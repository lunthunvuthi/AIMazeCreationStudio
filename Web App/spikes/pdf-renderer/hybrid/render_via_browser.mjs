// Spike: the "hybrid" direction from ../README.md's "Composability findings"
// — author each maze type's PDF question design as a React/SVG component
// (the frontend spike's demonstrated composability win: no per-maze-type
// height contract, the browser lays out whatever gets rendered), but
// produce the actual downloadable file via a backend step that drives a
// headless browser to print that same component tree to PDF (satisfying
// the dashboard's one-click Download requirement, which plain
// window.print() can't — see the README's Download-button finding).
//
// This script doesn't render anything itself — it spawns the real frontend
// spike's Vite dev server, opens Web App/frontend/src/spike/PdfPreviewSpikePage.tsx
// in headless Chromium, and calls Playwright's page.pdf() (Chromium's actual
// print-to-PDF engine, the same one behind the browser's Print dialog) to
// capture what's on screen as a real PDF file — no manual "Save as PDF"
// click, no reportlab/vector-drawing code of its own.
//
// Run from this folder (needs `npm install` here first — separate
// package.json, not part of the frontend's real dependency graph):
//   npm install
//   node render_via_browser.mjs                              # -> output/hybrid_question.pdf + hybrid_answer_key.pdf
//   node render_via_browser.mjs --preview-question 3          # -> output/hybrid_question_preview_3.pdf
//   node render_via_browser.mjs --preview-question 3 --answer-key
//   node render_via_browser.mjs --data path/to/level.json     # render a real exported LevelProgress instead of the sample fixture
//
// --data wiring: LevelProgress (Web App/frontend/src/types/maze.ts) is a
// structural superset of the spike's SpikeFixture (same field names, plus
// createdAt/updatedAt which the page ignores), so no transformation is
// needed. The headless page has no access to this Node process's memory or
// the real app's Zustand store, so the JSON is handed across via
// page.addInitScript — it sets a global before the spike page's React code
// runs, and PdfPreviewSpikePage.tsx reads it in place of the hardcoded
// sampleFixture import (see that file's readFixture()).

import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FRONTEND_DIR = path.resolve(__dirname, '../../../frontend')
const OUTPUT_DIR = path.resolve(__dirname, '../output')
const BASE_URL = 'http://localhost:5173/spike/pdf-preview'

// Deliberately minimal — not a full re-implementation of fileAdapter.ts's
// parseLevelProgressFile (formatVersion migration, field defaulting). Just
// enough to fail fast with a clear message on an input that cannot produce a
// usable sheet, rather than a silent blank render with no indication which
// input file caused it. (Until 2026-08-21 this guarded a real unconditional
// dereference — PdfPreviewSpikePage.tsx's `fixture.pages[0].questions[0]`
// cover-question lookup; the cover's tutorial is a fixed constant now and the
// page only maps over `pages[]`, so the pages[0] check is just a fail-fast on
// an empty first row, which the dashboard no longer produces either.)
async function loadFixtureData(dataPath) {
  const raw = await readFile(path.resolve(dataPath), 'utf-8')
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new Error(`--data ${dataPath} is not valid JSON: ${err.message}`)
  }
  if (!Array.isArray(parsed.pages) || parsed.pages.length === 0) {
    throw new Error(`--data ${dataPath} has no pages[] — expected a LevelProgress-shaped file with at least one question page`)
  }
  if (!Array.isArray(parsed.pages[0].questions) || parsed.pages[0].questions.length === 0) {
    throw new Error(`--data ${dataPath}'s pages[0] has no questions — expected at least one`)
  }
  return parsed
}

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  throw new Error(`dev server did not become ready at ${url} within ${timeoutMs}ms`)
}

async function renderSheetVariant(page, answerKey, outPath) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' })
  // See pdf-service/render.js for why this is data-pdf-ready and no longer
  // `text=Bonus Challenge`.
  await page.waitForSelector('[data-pdf-ready="true"]')
  if (answerKey) {
    await page.getByText('Answer key (overlay solution path)').click()
    await page.waitForTimeout(150) // path/decoration re-render
  }
  // preferCSSPageSize: true — trust the page's own @page{size:A4;margin:10mm}
  // rule (pdf_design_spec.md §1) rather than Playwright's own format/margin
  // options; printBackground: true — the gray title banner/badges/wreath
  // rely on CSS background-color and SVG fills, both dropped by default.
  await page.pdf({ path: outPath, printBackground: true, preferCSSPageSize: true })
  console.log(`wrote ${outPath}`)
}

async function renderQuestionPreview(page, index, answerKey, outPath) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' })
  await page.selectOption('select', String(index))
  if (answerKey) {
    await page.getByText('Answer key (overlay solution path)').click()
  }
  await page.waitForTimeout(150)
  await page.pdf({ path: outPath, printBackground: true, preferCSSPageSize: true })
  console.log(`wrote ${outPath}`)
}

async function main() {
  const args = process.argv.slice(2)
  const answerKeyOnly = args.includes('--answer-key')
  const previewFlagIndex = args.indexOf('--preview-question')
  const previewQuestion = previewFlagIndex !== -1 ? Number(args[previewFlagIndex + 1]) : null
  const dataFlagIndex = args.indexOf('--data')
  const dataPath = dataFlagIndex !== -1 ? args[dataFlagIndex + 1] : null

  let fixtureData = null
  if (dataPath) {
    fixtureData = await loadFixtureData(dataPath)
    console.log(`rendering real data from ${dataPath}`)
  }

  await mkdir(OUTPUT_DIR, { recursive: true })

  console.log('starting frontend dev server...')
  const devServer = spawn('npm', ['run', 'dev'], { cwd: FRONTEND_DIR, stdio: 'ignore' })

  try {
    await waitForServer(BASE_URL)
    const browser = await chromium.launch()
    const page = await browser.newPage()
    if (fixtureData) {
      await page.addInitScript((data) => {
        window.__PDF_FIXTURE_DATA__ = data
      }, fixtureData)
    }

    if (previewQuestion !== null) {
      const suffix = answerKeyOnly ? '_answer_key' : ''
      await renderQuestionPreview(page, previewQuestion, answerKeyOnly, path.join(OUTPUT_DIR, `hybrid_question_preview_${previewQuestion}${suffix}.pdf`))
    } else if (answerKeyOnly) {
      await renderSheetVariant(page, true, path.join(OUTPUT_DIR, 'hybrid_answer_key.pdf'))
    } else {
      await renderSheetVariant(page, false, path.join(OUTPUT_DIR, 'hybrid_question.pdf'))
      await renderSheetVariant(page, true, path.join(OUTPUT_DIR, 'hybrid_answer_key.pdf'))
    }

    await browser.close()
  } finally {
    devServer.kill()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
