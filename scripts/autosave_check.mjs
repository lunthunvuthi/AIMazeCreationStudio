/**
 * Browser-driven regression check for the localStorage autosave
 * (development_plan.md §2 Phase 2 / §9 roadmap step 6).
 *
 * Why this exists as a script: the frontend has no test runner, so every
 * frontend guarantee in this repo is verified by driving the real app — same
 * reasoning as scripts/phase_b_run.mjs, and the same borrowed Playwright
 * (pdf-service/node_modules, to avoid a second Chromium download).
 *
 * It is not a substitute for phase_b_run.mjs and does not export anything. It
 * answers one question: does an in-progress sheet survive a reload, and do the
 * three ways of *deliberately* replacing it still ask first.
 *
 *   node scripts/autosave_check.mjs                       # expects Vite on :5174
 *   BASE=http://localhost:5173 node scripts/autosave_check.mjs
 *
 * Needs the backend on :8000 too — one check authors a real maze via Randomize,
 * because "an authored maze survives" is the claim that actually matters and a
 * sheet of empty slots would not prove it.
 *
 * TRAPS, learned the hard way here:
 *  - Do not read localStorage immediately after a store action. Writes are
 *    coalesced in a ~500ms window (localStorageAdapter.WRITE_WINDOW_MS), so an
 *    immediate read returns the PREVIOUS sheet. Cost one debugging round when a
 *    question_id from the old sheet 404'd against the new one.
 *  - `getByRole('link', {name: 'Resume'})` is ambiguous — "Modify Maze / Resume
 *    from a saved level file" also matches. Use exact: true.
 *  - Randomize on the question-entry screen is a <Link> wrapping an <h2>, not a
 *    button. Click the heading, as phase_b_run.mjs does.
 *  - Keep the catch block below. An earlier version had only try/finally, so a
 *    thrown locator error printed "10/10 passed" and exited 0.
 */

// Playwright is borrowed from pdf-service's install rather than added at the
// repo root — see scripts/phase_b_run.mjs, same reason (no second Chromium).
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const require = createRequire(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'Web App', 'pdf-service', 'package.json'),
)
const { chromium } = require('playwright')

const BASE = process.env.BASE || 'http://localhost:5174'
const KEY = 'mazeStudio.autosave.v1'
const results = []
function check(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch()
const ctx = await browser.newContext()
const page = await ctx.newPage()
page.on('console', (m) => m.type() === 'error' && console.log('  [console.error]', m.text()))
page.on('pageerror', (e) => console.log('  [pageerror]', e.message))

try {
  // Clean slate
  await page.goto(BASE)
  await page.evaluate((k) => localStorage.removeItem(k), KEY)

  // 1. No autosave -> no resume card
  await page.goto(`${BASE}/pickaxe`)
  check('no resume card on a clean origin', (await page.getByText('In progress').count()) === 0)

  // 2. Start a level, edit sheet name
  await page.goto(`${BASE}/pickaxe/new`)
  await page.getByRole('button', { name: /Kinder/ }).click()
  await page.waitForURL(/dashboard/)
  await page.getByPlaceholder('e.g. Kinder Week 2').fill('Autosave Probe')
  await page.waitForTimeout(900) // past WRITE_WINDOW_MS

  const stored = await page.evaluate((k) => localStorage.getItem(k), KEY)
  check('autosave record written', !!stored)
  const parsed = stored ? JSON.parse(stored) : {}
  check('record is a bare LevelProgress', parsed.formatVersion === 2 && Array.isArray(parsed.pages),
    `formatVersion=${parsed.formatVersion}`)
  check('record holds the typed sheet name', parsed.sheetName === 'Autosave Probe', `got "${parsed.sheetName}"`)

  // 3. THE point of the feature: reload stays put, work intact
  await page.reload()
  check('reload stays on the dashboard', page.url().includes('/dashboard'), page.url())
  check('reload keeps the sheet name',
    (await page.getByPlaceholder('e.g. Kinder Week 2').inputValue()) === 'Autosave Probe')
  check('reload keeps the level', (await page.getByRole('heading', { level: 1 }).textContent())?.includes('kinder'))

  // 4. pagehide flush — edit then navigate away inside the throttle window
  await page.getByPlaceholder('e.g. Kinder Week 2').fill('Flushed Before Unload')
  await page.goto(`${BASE}/pickaxe`) // full navigation, fires pagehide immediately
  const flushed = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), KEY))
  check('pagehide flushed the edit made inside the throttle window',
    flushed.sheetName === 'Flushed Before Unload', `got "${flushed.sheetName}"`)

  // 5. Resume card
  check('resume card shown on maze-type home', (await page.getByText('In progress').count()) === 1)
  check('resume card names the sheet', (await page.getByText('Flushed Before Unload').count()) >= 1)
  await page.getByRole('link', { name: 'Resume', exact: true }).click()
  await page.waitForURL(/dashboard/)
  check('Resume lands on the dashboard', page.url().includes('/dashboard'))

  // 6. New-level overwrite guard: no maze authored yet -> NO prompt
  await page.goto(`${BASE}/pickaxe/new`)
  let dialogs = 0
  page.on('dialog', (d) => { dialogs++; d.accept() })
  await page.getByRole('button', { name: /Primary/ }).click()
  await page.waitForURL(/dashboard/)
  check('no prompt when the replaced sheet has no authored maze', dialogs === 0, `dialogs=${dialogs}`)

  // 7. Author one maze via Randomize, then the guard must fire
  // Navigate by the id the record itself reports, rather than guessing a card selector.
  // The wait matters: the record still holds the *previous* sheet for up to
  // WRITE_WINDOW_MS after startNewLevel, so reading it immediately yields a
  // question_id that does not exist on the new sheet.
  await page.waitForTimeout(900)
  const firstId = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), KEY))
    .pages[0].questions[0].question_id
  await page.goto(`${BASE}/pickaxe/dashboard/${firstId}`)
  // Randomize is a Link with an h2 inside, not a button — same selectors
  // scripts/phase_b_run.mjs uses.
  await page.getByRole('heading', { name: 'Randomize' }).click()
  await page.waitForURL(/randomize/, { timeout: 30000 })
  const complete = page.getByRole('button', { name: 'Complete' })
  await complete.waitFor({ state: 'visible', timeout: 60000 })
  await complete.click()
  await page.waitForURL('**/pickaxe/dashboard')
  await page.waitForTimeout(900)

  const withMaze = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), KEY))
  const authored = withMaze.pages.flatMap((p) => p.questions).filter((q) => q.maze).length
  check('a completed maze is in the autosave record', authored === 1, `authored=${authored}`)

  dialogs = 0
  await page.goto(`${BASE}/pickaxe/new`)
  await page.getByRole('button', { name: /Advanced/ }).click()
  await page.waitForURL(/dashboard/)
  check('prompt fires when the replaced sheet has an authored maze', dialogs === 1, `dialogs=${dialogs}`)

  // 8. Discard clears the record and the card
  await page.goto(`${BASE}/pickaxe`)
  dialogs = 0
  await page.getByRole('button', { name: 'Discard' }).click()
  check('discard prompted', dialogs === 1, `dialogs=${dialogs}`)
  check('discard removed the record', (await page.evaluate((k) => localStorage.getItem(k), KEY)) === null)
  check('discard removed the resume card', (await page.getByText('In progress').count()) === 0)
  await page.reload()
  check('discarded sheet does not come back on reload',
    (await page.evaluate((k) => localStorage.getItem(k), KEY)) === null &&
    (await page.getByText('In progress').count()) === 0)

  // 9. Corrupt record is quarantined, not fatal
  await page.evaluate((k) => localStorage.setItem(k, '{not json'), KEY)
  await page.goto(`${BASE}/pickaxe/dashboard`)
  check('corrupt record does not crash the app', !!(await page.getByRole('heading').first().count()))
  const q = await page.evaluate(() => ({
    live: localStorage.getItem('mazeStudio.autosave.v1'),
    quar: localStorage.getItem('mazeStudio.autosave.v1.unreadable'),
  }))
  check('corrupt record quarantined, not deleted', q.live === null && q.quar === '{not json}'.slice(0, 9),
    JSON.stringify(q))
} catch (err) {
  console.log('\n!! THREW:', err.message.split('\n').slice(0, 6).join('\n'))
  check('script ran to completion', false, 'threw')
} finally {
  await browser.close()
  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  process.exit(failed.length ? 1 : 0)
}
