import { authHeaders } from '../auth/tokenStore'
import type { LevelProgress } from '../types/maze'

// Hits POST /api/pdf/render (Web App/pdf-service/server.js), proxied to that
// service by vite.config.ts in dev.
export async function renderPdf(levelProgress: LevelProgress, opts?: { answerKey?: boolean }): Promise<Blob> {
  const qs = opts?.answerKey ? '?answerKey=true' : ''
  const res = await fetch(`/api/pdf/render${qs}`, {
    method: 'POST',
    // Step 7a authenticates the render endpoint. It was the most expensive
    // unauthenticated endpoint in the system: one unauthenticated POST drives a
    // real headless browser through a full A4 render.
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(levelProgress),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? `PDF render failed: ${res.status} ${res.statusText}`)
  }
  return res.blob()
}
