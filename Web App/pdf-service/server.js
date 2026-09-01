import express from 'express'
import { describeAuth, requireAuth } from './auth.js'
import { isFrontendReachable, launchBrowser, renderPdf, validateLevelProgressShape } from './render.js'

const PORT = Number(process.env.PORT) || 8010
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

const app = express()
app.use(express.json({ limit: '5mb' }))

const browser = await launchBrowser()

// Registered at the full /api/pdf/render path (not just /render/pdf) because
// vite.config.ts's proxy forwards the original path unchanged, the same
// convention the existing FastAPI backend's /api/maze/* routes already use.
app.post('/api/pdf/render', requireAuth(), async (req, res) => {
  try {
    validateLevelProgressShape(req.body)
  } catch (err) {
    res.status(400).json({ error: err.message })
    return
  }

  if (!(await isFrontendReachable(FRONTEND_URL))) {
    res.status(503).json({
      error: `Frontend dev server not reachable at ${FRONTEND_URL} — start \`npm run dev\` in Web App/frontend first.`,
    })
    return
  }

  try {
    const answerKey = req.query.answerKey === 'true'
    const pdfBuffer = await renderPdf(browser, FRONTEND_URL, req.body, { answerKey })
    res.setHeader('Content-Type', 'application/pdf')
    res.send(pdfBuffer)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: `PDF render failed: ${err.message}` })
  }
})

const server = app.listen(PORT, () => {
  console.log(`pdf-service listening on :${PORT} (frontend expected at ${FRONTEND_URL})`)
  console.log(describeAuth())
})

async function shutdown() {
  server.close()
  await browser.close()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
