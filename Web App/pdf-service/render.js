// Render logic ported from ../spikes/pdf-renderer/hybrid/render_via_browser.mjs,
// adapted for a long-running service instead of a one-shot CLI script:
// - No spawn/kill of `npm run dev` here — this service runs alongside the
//   frontend dev server the real dashboard is already being served from, it
//   only drives a headless browser against it.
// - One persistent Chromium instance is launched once (launchBrowser) and
//   reused across requests; each render gets its own browser context/page so
//   concurrent requests don't share injected fixture data.
// - page.pdf() is called with no `path`, returning the PDF bytes directly as
//   a Buffer to stream back over HTTP instead of writing to disk.

import { chromium } from 'playwright'

const PREVIEW_PATH = '/spike/pdf-preview'

export function validateLevelProgressShape(parsed) {
  if (!parsed || !Array.isArray(parsed.pages) || parsed.pages.length === 0) {
    throw new Error('Request body has no pages[] — expected a LevelProgress-shaped object with at least one question page')
  }
  if (!Array.isArray(parsed.pages[0].questions) || parsed.pages[0].questions.length === 0) {
    throw new Error("Request body's pages[0] has no questions — expected at least one")
  }
}

export async function isFrontendReachable(frontendUrl, timeoutMs = 2000) {
  try {
    const res = await fetch(frontendUrl + PREVIEW_PATH, { signal: AbortSignal.timeout(timeoutMs) })
    return res.ok
  } catch {
    return false
  }
}

export async function launchBrowser() {
  return chromium.launch()
}

// preferCSSPageSize/printBackground: see render_via_browser.mjs's comments —
// trusts the page's own @page{size:A4;margin:10mm} rule, and backgrounds are
// how the title banner/badges/wreath render their fills.
export async function renderPdf(browser, frontendUrl, levelProgress, { answerKey = false } = {}) {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.addInitScript((data) => {
      window.__PDF_FIXTURE_DATA__ = data
    }, levelProgress)

    await page.goto(frontendUrl + PREVIEW_PATH, { waitUntil: 'networkidle' })
    // The preview page flips data-pdf-ready once BOTH static pages have
    // finished loading: the cover fetches Front Cover.svg (a fetch, so it
    // resolves after networkidle) and the last page decodes a ~1MB JPEG.
    // Printing before that yields a cover with no template and a blank final
    // page. This replaced a `text=Bonus Challenge` wait, which pointed at the
    // hand-coded bonus page that the designer's real last-page image replaced.
    await page.waitForSelector('[data-pdf-ready="true"]')
    if (answerKey) {
      await page.getByText('Answer key (overlay solution path)').click()
      await page.waitForTimeout(150)
    }

    return await page.pdf({ printBackground: true, preferCSSPageSize: true })
  } finally {
    await context.close()
  }
}
