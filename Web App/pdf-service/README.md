# pdf-service

Long-running Express service backing the Level Dashboard's **Preview** and
**Download** buttons. Drives headless Playwright against the frontend's
`/spike/pdf-preview` route to produce real PDFs from `LevelProgress` data,
the same rendering approach proven by
`../spikes/pdf-renderer/hybrid/render_via_browser.mjs` — see that script's
header comment and `../docs/pdf_export_spec.md` §7 item 5 for the
renderer-tech decision this builds on.

Unlike that CLI script, this service does **not** spawn its own frontend dev
server — it expects one already running (the same one the dashboard itself
is being served from) and fails fast with a `503` if it isn't reachable.

## Setup

```
npm install
npx playwright install chromium
```

## Run

```
npm start
```

Requires `Web App/frontend`'s dev server (`npm run dev`) already running at
`http://localhost:5173` (override with `FRONTEND_URL`). Listens on `:8010`
by default (override with `PORT`).

## API

`POST /api/pdf/render?answerKey=true|false`

Body: a `LevelProgress`-shaped JSON object (`Web App/frontend/src/types/maze.ts`).
Response: `application/pdf` bytes, or a JSON `{ error: string }` body on
`400`/`503`/`500`.
