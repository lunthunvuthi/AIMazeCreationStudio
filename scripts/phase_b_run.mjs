#!/usr/bin/env node
/**
 * Drive one full Phase B run through the real app and save what it produced.
 *
 * PRODUCTION_PROCESS.md §4 is a sequence a human performs on the Level
 * Dashboard: author every question, then export. Running it by hand is how the
 * pipeline gets proven, and it is also how the traps get found — but each run
 * used to be a throwaway Playwright script in a session scratchpad, so the next
 * person re-derived the same selectors and re-learned the same traps. This is
 * that script, kept.
 *
 * It is a *driver*, not a test: it makes no assertions about how the PDF looks.
 * It authors a level, exports the three artifacts, and writes them to a folder.
 * `verify_worksheet_pdf.py` is the half that checks the output.
 *
 * The mazes come from the backend generator and are then REPLAYED click by
 * click through the real wizard UI. That is deliberate: the point is to
 * exercise the authoring surface, not to design mazes. A generated maze is
 * already known to have a unique solution, so a faithful replay must end in a
 * green Validate — if it does not, the wizard and the generator disagree about
 * something, which is exactly the kind of seam this run exists to find.
 *
 * Usage:
 *   node scripts/phase_b_run.mjs --level primary --route mixed
 *
 *   --level kinder|primary|advanced   which level to author   (default primary)
 *   --route manual|randomize|mixed    authoring route         (default mixed)
 *                                       manual    — every slot via Create Myself
 *                                       randomize — every slot via Randomize
 *                                       mixed     — alternating, so the exported
 *                                                   sheet has both provenances
 *   --rerolls                         on the first randomized slot, exercise all
 *                                     three reroll controls before completing
 *   --out <dir>                       artifact folder (default phase-b-out/<level>-<route>)
 *   --clean                           replace artifacts left by an earlier run
 *   --frontend <url>                  default http://localhost:5173
 *   --backend  <url>                  default http://localhost:8000
 *   --headed                          watch it drive
 *
 * Needs ALL THREE servers up (README "Running all three"): backend :8000 for
 * generate/validate, Vite for the app, and pdf-service :8010 for the exports.
 *
 * Three traps worth knowing before editing this file:
 *
 *  - pdf-service renders whatever is at ITS `FRONTEND_URL`, which defaults to
 *    :5173. When Vite finds 5173 taken it silently moves to 5174, and the
 *    export then comes back rendered against whatever stale dev server is
 *    squatting on 5173. Passing `--frontend` here does NOT fix that; it only
 *    points *this* script. Start pdf-service with a matching FRONTEND_URL.
 *
 *  - Playwright's `locator.count()` does not auto-wait. The wizard renders
 *    nothing until its draft effect has run (`if (!draft) return null`), so
 *    probing for a control too early returns 0 and silently skips a step. That
 *    cost a run: the pickaxe-count control was skipped on the first slot with a
 *    pickaxe range, and it surfaced two steps later as a disabled Validate with
 *    "Path walls: 3 / 2". Wait for something visible before counting.
 *
 *  - Preview's blob tab resolves to a *download* in headless Chromium, racing
 *    with the two real exports. Anything that waits on a download COUNT can be
 *    satisfied by the wrong file — the progress .json standing in for the
 *    answer key, which then never gets saved while the run still reports
 *    success. Claim downloads by filename; see `claim()` below.
 *
 * Set VITE_FAST_ANIM=1 on the *Vite* server to cut RandomizeProgressModal's
 * animations to ~5% — the randomize route spends ~7s per question otherwise.
 *
 * What this run deliberately does NOT cover, so nobody reads a green run as
 * more than it is: it never toggles a row's **Bonus** flag (§4.4 — that changes
 * the printed badge to a laurel wreath), never drags a question between rows
 * (§5), and never loads a saved progress file back in. It also authors the
 * slate a new level is seeded with and nothing else — no rows added or removed.
 */

import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Playwright is not a dependency of this repo's root — it arrives with
// pdf-service, which needs it for the very exports this script clicks. Reusing
// that install keeps one browser download instead of two.
const PDF_SERVICE = path.join(REPO_ROOT, 'Web App', 'pdf-service')
let chromium
try {
  ;({ chromium } = createRequire(path.join(PDF_SERVICE, 'package.json'))('playwright'))
} catch {
  console.error(`Could not load Playwright from ${PDF_SERVICE}.\nRun:  cd "Web App/pdf-service" && npm install`)
  process.exit(1)
}

// --------------------------------------------------------------------------
// Arguments
// --------------------------------------------------------------------------

const USAGE = `Usage: node scripts/phase_b_run.mjs [options]

  --level kinder|primary|advanced   which level to author         (default primary)
  --route manual|randomize|mixed    authoring route               (default mixed)
  --rerolls                         exercise the three Randomize reroll controls
  --out <dir>                       artifacts (default phase-b-out/<level>-<route>)
  --clean                           replace artifacts left by an earlier run
  --frontend <url>                  default http://localhost:5173
  --backend <url>                   default http://localhost:8000
  --headed                          watch it drive

Needs the backend, Vite and pdf-service all running (see README).`

const VALUE_FLAGS = new Set(['level', 'route', 'out', 'frontend', 'backend'])
const BOOLEAN_FLAGS = new Set(['rerolls', 'headed', 'clean'])

function parseArgs(argv) {
  const opts = {
    level: 'primary',
    route: 'mixed',
    out: null,
    frontend: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    backend: process.env.BACKEND_URL ?? 'http://localhost:8000',
    rerolls: false,
    headed: false,
    clean: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--help' || a === '-h') {
      console.log(USAGE)
      process.exit(0)
    }
    if (!a.startsWith('--')) throw new Error(`unexpected argument: ${a}`)
    const name = a.slice(2)
    if (BOOLEAN_FLAGS.has(name)) {
      opts[name] = true
    } else if (VALUE_FLAGS.has(name)) {
      const value = argv[++i]
      if (value === undefined || value.startsWith('--')) throw new Error(`--${name} needs a value`)
      opts[name] = value
    } else {
      // Assigning unknown keys straight onto opts made a typo silent, and the
      // silence was expensive in exactly one direction: `--fronend` leaves the
      // driver on :5173, which is the stale-dev-server trap the header warns
      // about, and the run still "passes" against whatever is squatting there.
      throw new Error(`unknown option: ${a}`)
    }
  }
  if (!['kinder', 'primary', 'advanced'].includes(opts.level)) throw new Error(`bad --level: ${opts.level}`)
  if (!['manual', 'randomize', 'mixed'].includes(opts.route)) throw new Error(`bad --route: ${opts.route}`)
  opts.out ??= path.join(REPO_ROOT, 'phase-b-out', `${opts.level}-${opts.route}`)
  return opts
}

let opts
try {
  opts = parseArgs(process.argv.slice(2))
} catch (e) {
  console.error(`${e.message}\n\n${USAGE}`)
  process.exit(2)
}
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

// --------------------------------------------------------------------------
// Maze data <-> UI coordinates
//
// Mirrors wizardMaze.ts's serialization rules (rules.md §7) in the opposite
// direction: given a generator response, work out which cells and which edges
// have to be clicked to reproduce it.
// --------------------------------------------------------------------------

function parseMaze(gen) {
  const walls = []
  let start = null
  let goal = null
  gen.maze.forEach((row, y) => {
    row.split(',').forEach((raw, x) => {
      let token = raw.trim()
      if (token.startsWith('s')) {
        start = { x, y }
        token = token.slice(1)
      } else if (token.startsWith('g')) {
        goal = { x, y }
        token = token.slice(1)
      } else if (token === '.') {
        token = ''
      }
      // Right walls are owned by the cell to the left, bottom walls by the cell
      // above, which is exactly how PickaxeGrid lays out its edge buttons.
      if (token.includes('|')) walls.push({ x, y, edge: 'right' })
      if (token.includes('_')) walls.push({ x, y, edge: 'bottom' })
    })
  })
  if (!start || !goal) throw new Error(`generator returned a maze with no start/goal: ${JSON.stringify(gen.maze)}`)
  return { start, goal, walls }
}

// "S,49 -> 41(break _ wall) -> ... -> 32" (validator_design.md §2) into the
// ordered chain of cells to tap. Cell numbers are 1-based, row-major.
function parseTrace(trace, width) {
  return trace.split('->').map((token) => {
    const match = token.match(/(\d+)/)
    if (!match) throw new Error(`unparseable trace token: ${token}`)
    const zeroBased = parseInt(match[1], 10) - 1
    return { x: zeroBased % width, y: Math.floor(zeroBased / width) }
  })
}

// Roadmap step 7a put /api/maze/* behind a login. This script talks to the
// backend directly, outside the browser, so it needs its own token. Google and
// Auth0's hosted login both block automated sign-in, so what it sends is the
// backend's fixed development token (maze_api/config.py DEV_BYPASS_TOKEN),
// which is accepted only while that server is running unauthenticated. Set
// AUTH_TOKEN to send a real one instead.
//
// The BROWSER half of this run needs the matching switch on the frontend: once
// Auth0 is configured in Web App/frontend/.env.local, start Vite with
// VITE_AUTH_BYPASS=1 or the route guard will bounce this script to /login.
const AUTH_TOKEN = process.env.AUTH_TOKEN ?? 'dev-bypass-token'

async function generate(star) {
  const res = await fetch(`${opts.backend}/api/maze/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AUTH_TOKEN}` },
    body: JSON.stringify({ type: 'pickaxe', star }),
  })
  if (res.status === 401) {
    throw new Error(
      `generate star=${star} -> 401. The backend requires a real login. Either run it without ` +
        'Auth0 configured / with DEV_AUTH_BYPASS=1, or pass AUTH_TOKEN=<access token>.',
    )
  }
  if (!res.ok) throw new Error(`generate star=${star} -> ${res.status} ${await res.text()}`)
  return res.json()
}

// --------------------------------------------------------------------------
// Authoring one question
// --------------------------------------------------------------------------

const cell = (page, p) => page.locator(`[data-x="${p.x}"][data-y="${p.y}"]`)

/** Dashboard card -> QuestionEntryPage. Every slot goes through the real §6.5
 *  choice screen rather than a deep link, so that screen is exercised too. */
async function openSlot(page, questionId) {
  await page.locator(`a[href="/pickaxe/dashboard/${questionId}"]`).first().click()
  await page.waitForURL(`**/dashboard/${questionId}`)
}

async function authorManually(page, questionId, star, findings) {
  const gen = await generate(star)
  const { start, goal, walls } = parseMaze(gen)
  const trace = parseTrace(gen.solutionTrace, gen.width)
  log(`  ${questionId} (${star}★) manual — ${gen.width}x${gen.height}, ${gen.pickaxe_count} pickaxes, ${trace.length} path cells, ${walls.length} walls`)

  await openSlot(page, questionId)
  await page.getByRole('heading', { name: 'Create Myself' }).click()
  await page.waitForURL(`**/dashboard/${questionId}/create`)

  // Step 1 — grid size is fixed; pickaxe count is only choosable where
  // difficulty_setting.md gives a range (6-8★). Wait for the step to paint
  // before probing: see the locator.count() trap in the header comment.
  await page.getByRole('heading', { name: 'Grid size' }).waitFor({ state: 'visible' })
  const plus = page.getByRole('button', { name: '+', exact: true })
  const readCount = () => page.locator('span.w-6.text-center').innerText().then(Number)
  if (await plus.count()) {
    const minus = page.getByRole('button', { name: '−', exact: true })
    for (let i = 0; i < 8 && (await readCount()) !== gen.pickaxe_count; i++) {
      await ((await readCount()) < gen.pickaxe_count ? plus : minus).click()
    }
    const shown = await readCount()
    if (shown !== gen.pickaxe_count) throw new Error(`pickaxe count stuck at ${shown}, wanted ${gen.pickaxe_count}`)
  } else {
    // Fixed-pickaxe star: no control exists, so the generated count must
    // already match or step 4's counter could never be satisfied.
    const fixed = await page.getByText(/pickaxe(s)? — fixed for this difficulty/).innerText()
    if (!fixed.startsWith(String(gen.pickaxe_count))) {
      throw new Error(`fixed pickaxe mismatch: wizard says "${fixed}", generator gave ${gen.pickaxe_count}`)
    }
  }
  await page.getByRole('button', { name: 'Next' }).click()

  // Step 2 — S then G.
  await cell(page, start).click()
  await cell(page, goal).click()
  await page.getByText('Start placed. Goal placed.').waitFor({ state: 'visible' })
  await page.getByRole('button', { name: 'Next' }).click()

  // Step 3 — tap the ideal path one cell at a time. The tap route rather than
  // the drag route: both drive the same state, and taps are the one a flaky
  // pointer-drag cannot silently truncate.
  for (const p of trace) await cell(page, p).click()
  await page.getByText('Path complete.').waitFor({ state: 'visible', timeout: 5000 })
  await page.getByRole('button', { name: 'Next' }).click()

  // Step 4 — every wall the generator placed. Those lying on the drawn path
  // count toward the pickaxe requirement (sub-step A); the rest are the
  // manual-only distraction walls (sub-step B), which is the part of the
  // authoring surface the Randomize route never touches.
  for (const w of walls) {
    const button = cell(page, w).locator(`button[data-edge="${w.edge}"]`)
    if (!(await button.count())) {
      findings.push(`${questionId}: no ${w.edge} edge control at (${w.x},${w.y}) — boundary wall in generator output?`)
      continue
    }
    await button.click()
  }

  const counters = (await page.locator('.flex.flex-wrap.gap-4 span').allInnerTexts()).join(' | ')
  const validate = page.getByRole('button', { name: 'Validate' })
  if (await validate.isDisabled()) throw new Error(`Validate stayed disabled: ${counters}`)
  await validate.click()

  const complete = page.getByRole('button', { name: 'Complete' })
  await complete.waitFor({ state: 'visible', timeout: 20000 })
  const verdict = await page.locator('p.text-sm.text-emerald-700').innerText()
  if (!verdict.startsWith('Unique solution found')) throw new Error(`unexpected verdict: ${verdict}`)
  await complete.click()
  await page.waitForURL('**/pickaxe/dashboard')

  log(`    ${counters}`)
  return { questionId, star, route: 'manual', pickaxes: gen.pickaxe_count, seeds: gen.seeds, trace: gen.solutionTrace }
}

async function authorByRandomize(page, questionId, star, { rerolls }) {
  log(`  ${questionId} (${star}★) randomize${rerolls ? ' + rerolls' : ''}`)
  await openSlot(page, questionId)
  await page.getByRole('heading', { name: 'Randomize' }).click()
  await page.waitForURL(`**/dashboard/${questionId}/randomize`)

  // RandomizeProgressModal settles on its own — no click. It animates for
  // several seconds per generate unless Vite was started with VITE_FAST_ANIM=1.
  const complete = page.getByRole('button', { name: 'Complete' })
  await complete.waitFor({ state: 'visible', timeout: 60000 })

  if (rerolls) {
    // §6.6's three reroll controls each re-generate with a different subset of
    // the previous result's seeds pinned. Exercised once here because nothing
    // else in a Phase B run touches them.
    for (const name of ['Reroll S/G placement', 'Reroll ideal path', 'Reroll wall placement']) {
      await page.getByRole('button', { name }).click()
      // Complete is still on screen from the previous settle, so waiting for it
      // to be *visible* resolves instantly and logs a reroll that has not
      // started — after which the next click lands on stale DOM. The modal
      // unmounts that whole block, so wait for it to go away first.
      await complete.waitFor({ state: 'hidden', timeout: 15000 })
      await complete.waitFor({ state: 'visible', timeout: 60000 })
      log(`    ${name} ok`)
    }
  }

  const verdict = await page.locator('p.text-sm.text-emerald-700').innerText()
  if (!verdict.startsWith('Unique solution found')) throw new Error(`unexpected verdict: ${verdict}`)
  await complete.click()
  await page.waitForURL('**/pickaxe/dashboard')
  return { questionId, star, route: 'randomize', trace: verdict.replace('Unique solution found: ', '') }
}

// --------------------------------------------------------------------------
// The run
// --------------------------------------------------------------------------

// Only ever matches files this script itself writes, and only removed on ask.
const ARTIFACT_PATTERN = /\.(pdf|json|png)$/

function prepareOutDir() {
  fs.mkdirSync(opts.out, { recursive: true })
  const stale = fs.readdirSync(opts.out).filter((f) => ARTIFACT_PATTERN.test(f))
  if (!stale.length) return
  if (!opts.clean) {
    throw new Error(
      `${opts.out} already holds ${stale.length} artifact(s) from an earlier run.\n` +
        `Every export filename carries its own timestamp, so a second run would sit\n` +
        `alongside them and the verifier could check the older worksheet instead.\n` +
        `Pass --clean to replace them, or --out <dir> to keep both.`,
    )
  }
  for (const f of stale) fs.rmSync(path.join(opts.out, f))
  log(`--clean: removed ${stale.length} artifact(s) from an earlier run`)
}

try {
  prepareOutDir()
} catch (e) {
  console.error(e.message)
  process.exit(2)
}

const findings = []
const authored = []
const saved = []
let slots = []
let browser
let page
let failure = null

try {
  browser = await chromium.launch({ headless: !opts.headed })
  const context = await browser.newContext({ viewport: { width: 1280, height: 1600 }, acceptDownloads: true })
  page = await context.newPage()
  page.on('pageerror', (e) => findings.push(`uncaught page error: ${e.message}`))
  // Every alert in this app is a failure path (see LevelDashboardPage's export
  // handlers), so one appearing is a finding, not noise.
  page.on('dialog', async (d) => {
    findings.push(`DIALOG(${d.type()}): ${d.message()}`)
    await d.accept()
  })

  // Downloads are claimed BY FILENAME, never by arrival order or by counting.
  // Preview opens its blob in a new tab and headless Chromium resolves that to
  // a download of its own — a bare GUID.pdf — which races with the two exports
  // that follow. Counting arrivals lets the progress .json satisfy the wait for
  // the answer key, after which the answer key is never saved and the run still
  // reports success. Every real export is named by buildExportFilename() as
  // `pickaxe-<level>-...`, so the preview blob is trivially distinguishable.
  // None of this is an app defect: a real browser shows the preview in a tab.
  const downloads = []
  const claimed = new Set()
  page.on('download', (d) => downloads.push(d))

  const claim = async (label, matches, timeoutMs = 180000) => {
    for (let waited = 0; waited <= timeoutMs; waited += 250) {
      const hit = downloads.find((d) => !claimed.has(d) && matches(d.suggestedFilename()))
      if (hit) {
        claimed.add(hit)
        return hit
      }
      await page.waitForTimeout(250)
    }
    const seen = downloads.map((d) => d.suggestedFilename()).join(', ') || 'nothing'
    throw new Error(`${label}: no matching download after ${timeoutMs}ms (saw: ${seen})`)
  }

  log(`Phase B: level=${opts.level} route=${opts.route} frontend=${opts.frontend}`)

  await page.goto(opts.frontend)
  await page.getByRole('heading', { name: 'PickAxe Maze' }).click()
  await page.getByRole('heading', { name: 'Create New Maze' }).click()
  await page.waitForURL('**/pickaxe/new')
  await page.getByRole('heading', { name: new RegExp(`^${opts.level}$`, 'i') }).click()
  await page.waitForURL('**/pickaxe/dashboard')

  // Sheet info. The cover prints level + month/week; the year is captured here
  // but the cover template has no room for it (pdf_export_spec.md §3).
  await page.locator('input[type="text"]').fill(`${opts.level[0].toUpperCase() + opts.level.slice(1)} Week 1`)
  await page.locator('select').first().selectOption({ label: 'September' })
  await page.locator('input[type="number"]').last().fill('1')
  await page.locator('h1').click() // blur, so the last field commits

  // A new level is seeded with its full slate of empty slots across several
  // rows (not an empty sheet), so the work list is read straight off the
  // dashboard. waitFor() rather than count(): right after waitForURL the rows
  // have not re-rendered and a count reads 0.
  await page.locator('a[href^="/pickaxe/dashboard/"]').first().waitFor({ state: 'visible' })
  slots = [
    ...new Set(
      await page
        .locator('a[href^="/pickaxe/dashboard/"]')
        .evaluateAll((els) => els.map((e) => e.getAttribute('href').split('/').pop())),
    ),
  ]
  log(`${slots.length} seeded slots: ${slots.join(', ')}`)

  let usedReroll = false
  for (const [index, questionId] of slots.entries()) {
    const star = Number(questionId.match(/-(\d+)star-/)[1])
    const useManual = opts.route === 'manual' || (opts.route === 'mixed' && index % 2 === 0)
    if (useManual) {
      authored.push(await authorManually(page, questionId, star, findings))
    } else {
      const rerolls = opts.rerolls && !usedReroll
      usedReroll ||= rerolls
      authored.push(await authorByRandomize(page, questionId, star, { rerolls }))
    }
    log(`    dashboard: ${await page.locator('p.mt-1.text-sm.text-slate-600').innerText()}`)
  }

  // Export — Preview, then Download, then Answer Key (PRODUCTION_PROCESS.md §4
  // step 2/3). Download deliberately hands over the exact bytes Preview cached,
  // so Preview has to happen first; Answer Key re-renders independently.
  const exportPrefix = `pickaxe-${opts.level}-`

  log('Preview')
  const popupPromise = page.waitForEvent('popup', { timeout: 120000 })
  await page.getByRole('button', { name: 'Preview' }).click()
  await (await popupPromise).close()

  log('Download')
  await page.getByRole('button', { name: 'Download', exact: true }).click()
  const sheetPdf = await claim(
    'Download (worksheet)',
    (n) => n.startsWith(exportPrefix) && n.endsWith('.pdf') && !n.endsWith('-answer-key.pdf'),
  )
  const progressJson = await claim('Download (progress)', (n) => n.startsWith(exportPrefix) && n.endsWith('.json'))

  log('Answer Key')
  await page.getByRole('button', { name: 'Answer Key' }).click()
  const keyPdf = await claim('Answer Key', (n) => n.endsWith('-answer-key.pdf'))

  for (const d of [sheetPdf, progressJson, keyPdf]) {
    const name = d.suggestedFilename()
    await d.saveAs(path.join(opts.out, name))
    saved.push(name)
  }
} catch (e) {
  failure = e
} finally {
  // A run that dies halfway is exactly when its findings and its last screen
  // are worth having, so both are written before anything is torn down. The
  // earlier version threw straight out of the top level and lost all three.
  if (page && !page.isClosed()) {
    await page.screenshot({ path: path.join(opts.out, 'dashboard-final.png'), fullPage: true }).catch(() => {})
  }
  await browser?.close().catch(() => {})
  fs.writeFileSync(
    path.join(opts.out, 'run.json'),
    JSON.stringify(
      {
        level: opts.level,
        route: opts.route,
        rerolls: opts.rerolls,
        slots,
        authored,
        saved,
        findings,
        failed: failure ? String(failure.message ?? failure) : null,
      },
      null,
      2,
    ),
  )
}

log(`artifacts in ${opts.out}`)
for (const name of saved) log(`  ${name}`)

if (failure) {
  console.error(`\nRUN FAILED after ${authored.length}/${slots.length || '?'} question(s): ${failure.message ?? failure}`)
  console.error(`Partial artifacts and findings were still written to ${opts.out}/run.json`)
}
console.log('\n=== FINDINGS ===')
console.log(findings.length ? findings.join('\n') : '(none)')
if (!failure) console.log(`\nNext:  python scripts/verify_worksheet_pdf.py "${opts.out}"`)
process.exit(failure || findings.length ? 1 : 0)
