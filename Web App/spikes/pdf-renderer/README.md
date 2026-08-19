# PDF renderer spike: backend (reportlab) vs. frontend (browser print/CSS)

Throwaway comparison spike for the one remaining open decision blocking both
`Export PDF` and the Level Dashboard's new **Preview** button:
`pdf_export_spec.md` §7 item 5 / `level_dashboard_pagination_spec.md` §8 item
1. Not production code — nothing here is wired into the real `maze_api` app
or the real dashboard. See project memory `project_pdf_export_spec` /
`project_level_dashboard_pagination` for how this fits the wider plan.

Both halves render the **same fixture** (`sample_fixture.json` /
`Web App/frontend/src/spike/sampleFixture.ts`, regenerate with
`generate_fixture.py`) so the comparison is apples-to-apples: a cover/
direction page (tutorial question as the "correct example" maze), 3 question
pages (mixing 1- and 2-question rows, including the sheet's max star to
exercise the laurel-wreath marker), and a bonus page. Both implement the 4
already-resolved spec decisions (icons for Start/Goal in print, computed
laurel wreath, separate answer-key output) so the comparison reflects real
scope, not a simplified stand-in.

**2026-08-19 update #1:** both halves were substantially reworked after the
project owner reviewed the first version's `output_question.pdf` against the
real sample and found it very different in style (background grid drawn
everywhere instead of walls-only, colored palette instead of grayscale,
side-by-side instead of stacked panels, tutorial-only decorations leaking onto
real question panels). In response: extracted every sample page's embedded
raster at native 2480×3508px (PyMuPDF, not a re-render), sampled exact colors
via full-page histogram, and measured line thickness/panel geometry via pixel
run-length scans — wrote the findings to **`Web App/docs/pdf_design_spec.md`**
(pixel-measured, not eyeballed). Both `backend/render_reportlab.py` and the
frontend's `src/spike/` (`WallGrid.tsx` + `icons.tsx`, replacing the first
pass's `PrintGrid`/`PrintCellRenderer` and emoji icons) were rewritten against
that doc and re-verified by rendering/screenshotting every page again. Both
halves are now a close style match to the sample and stay comparable to each
other again.

**2026-08-19 update #2 — multi-maze-type extensibility.** The project owner
pointed out the actual scaling requirement: PickAxe's "question" isn't just a
bare maze grid, it's the pickaxe-count badge *plus* the grid together as one
composed unit, and a future maze type might compose something else entirely
(a different badge, a non-square panel, no badge at all). Asked to prove out
"build each maze type's question renderer/preview on its own first, then
arrange N of them onto a page" as an actual pattern, on both spikes, so the
tech decision accounts for how well each one scales to many maze types, not
just today's one. Both sides now have: a per-maze-type question-unit registry
(backend: `QUESTION_TYPES` dict in `render_reportlab.py`; frontend:
`PDF_QUESTION_PANELS` in `pdfMazeTypeRegistry.tsx`, mirroring the real app's
existing `MazeTypeDefinition` registry pattern), a generic page composer with
zero PickAxe-specific knowledge (backend: `compose_question_page`; frontend:
the page component's `questionPages.map` + `<QuestionPanel>`), and a
standalone single-question preview mode (backend: `--preview-question N`;
frontend: the toolbar's "Preview" dropdown) — see §"Composability findings"
below for what building this actually surfaced.

## Backend half (reportlab)

```bash
source .venv/bin/activate  # from repo root; needs `pip install reportlab` (already done in this repo's venv)
python "Web App/spikes/pdf-renderer/backend/render_reportlab.py"                       # -> output/output_question.pdf
python "Web App/spikes/pdf-renderer/backend/render_reportlab.py" --answer-key          # -> output/output_answer_key.pdf
python "Web App/spikes/pdf-renderer/backend/render_reportlab.py" --preview-question 3  # one question, isolated, no page chrome
```

`reportlab` was picked over `weasyprint` to represent "backend" in this spike
— pure Python, no system-library install (`weasyprint` needs Pango/Cairo/
GDK-Pixbuf on the host, which is its own deployment cost worth knowing about
if backend rendering is chosen for real, just not what this spike measured).

`QUESTION_TYPES` (a dict of `{"height": fn, "draw": fn}` per maze type) is
where a second maze type's PDF question design would register itself;
`compose_question_page` and `render_question_preview` only ever call through
that dict, never anything PickAxe-specific directly.

## Frontend half (browser print/CSS)

Temporary route added to the real app: `npm run dev` (from
`Web App/frontend/`), then open `http://localhost:5173/spike/pdf-preview`.
Toggle "Answer key" to see the solution-path overlay; use the "Preview"
dropdown to switch between the full sheet and one isolated question, no page
chrome; "Print / Save as PDF" triggers `window.print()`.

New files, all removable as a unit once the decision lands:
- `Web App/frontend/src/spike/types.ts`, `sampleFixture.ts` (generated),
  `icons.tsx`, `WallGrid.tsx`, `pdfMazeTypeRegistry.tsx`, `PdfPreviewSpikePage.tsx`
- One route added in `App.tsx` (`/spike/pdf-preview`), clearly commented as
  spike-only at both ends.

`PDF_QUESTION_PANELS` in `pdfMazeTypeRegistry.tsx` (a `Record<mazeType,
ComponentType<PdfQuestionPanelProps>>`) is where a second maze type's PDF
question design would register itself — `PdfPreviewSpikePage`'s page loop and
its `<QuestionPanel mazeType={...} .../>` lookup never reference PickAxe
directly, mirroring the backend's `QUESTION_TYPES` dict.

`WallGrid` is **not** the production `PickaxeGrid`/`CellRenderer` — per-cell
divs with CSS borders can't express "no background grid, only actual walls,
full-length along the shared edge, thinner than the outer border, dots at
interior endpoints" (`pdf_design_spec.md` §6.2), so `WallGrid` is a single SVG
computing that geometry directly from a `WizardGrid`, deliberately mirroring
`render_reportlab.py`'s approach on the backend side. It does reuse the
production `wizardMaze.ts` helpers verbatim (`findCell`, `wallBetween`,
`hydrateDraftFromMazeData`) rather than re-deriving wall/path logic.
`icons.tsx`'s Start/Goal/pickaxe/wreath/mascot are custom SVG shapes matching
the sample (replacing the first pass's 🚶/🏁/⛏️ emoji, which didn't match the
sample's actual icon designs) — the production `CellRenderer` still renders
plain "S"/"G" letters by design (`pdf_export_spec.md` §7 item 1: print gets
icons, in-app editor keeps letters — two renderers, two purposes).

## What building both actually showed

**Lines of custom drawing code.** Both sides grew substantially in the
2026-08-19 rework — matching the sample's actual grayscale/walls-only/
stacked-panel style needed more geometry everywhere, not less, once emoji and
CSS borders stopped being able to carry the visual. Backend: ~670 lines
(up from ~370), almost all hand-drawn vector primitives in points/mm —
`canvas.line`/`circle`/`Path` calls with no box model, no flexbox, no live
inspector, just a render → open PDF → crop → compare loop. Frontend: ~550
lines across `icons.tsx` + `WallGrid.tsx` + the page component (up from
~230) — SVG coordinates computed by hand too, since the same "no CSS border
can express this wall/dot geometry" problem applies equally once the emoji
shortcut is gone. The frontend's remaining edge is narrower after this rework
than the first pass suggested, but two things are still free there and stay
free: `wizardMaze.ts`'s already-exported `hydrateDraftFromMazeData`/
`findCell`/`wallBetween` (no Python equivalent exists yet, see below), and a
live dev-server + screenshot loop instead of a render-and-reopen one.

The backend spike had to hand-roll a small Python solution-trace parser
(`_parse_trace`) since no equivalent of `wizardMaze.ts#parseTrace` exists yet
in `pickaxe_maze` — a real backend renderer would need to add one properly
rather than duplicate it ad hoc like this spike does.

**Where backend pulls ahead.** Reuses `pickaxe_maze.grid.parse_rows` directly
(the same wall-parsing code the generator/validator already trust), keeps all
rendering logic in one language/repo alongside maze generation, and produces
a PDF as a plain function call with no browser in the loop — deterministic,
scriptable, easy to unit-test byte-for-byte.

**The Download-button finding (still stands, unaffected by the composability
rework below):** the dashboard's **Download** button
(`level_dashboard_pagination_spec.md` §6.1) is specified as one click
producing **both** a PDF and a JSON file. `window.print()` only opens the
browser's native print dialog — the user still has to manually choose "Save
as PDF" and a location themselves, which is a materially different (worse)
UX than a single downloaded file. Getting a true one-click PDF out of the
frontend-rendered approach would mean driving a headless browser
server-side (e.g. Playwright/Puppeteer rendering this same React print view
to a PDF buffer on request) — which pulls a backend step back into the
picture regardless, just automating the browser's print view instead of
drawing the PDF from scratch. Pure client-only frontend rendering satisfies
**Preview** (an on-screen check, `window.print()`/browser tab is fine there)
but does not, by itself, satisfy **Download** as specified.

## Composability findings — many maze types, each with their own question design

This is the finding that should weigh most heavily for the "scale will be
very big later" question specifically (as opposed to the fidelity/Download
findings above, which are about today's one maze type). Both spikes now
implement the same three-part contract — a per-maze-type question-unit
registry, a page composer with zero PickAxe-specific knowledge, and a
standalone single-question preview — and building that out surfaced a real,
structural difference between the two:

**reportlab's canvas requires an explicit height contract; CSS doesn't.**
`canvas` is immediate-mode — once something is drawn, there's no reflow, so
`compose_question_page` has to know the *total height* of N question units
**before** it draws any of them, in order to vertically center/stack
correctly. That's why `QUESTION_TYPES` has to carry a `height` function
alongside `draw` for every maze type — a second maze type that gets its own
`height` formula subtly wrong (forgets a badge's margin, assumes a square
panel when its design isn't one) produces silently misaligned output, not an
error. The frontend composer (`PdfPreviewSpikePage`'s `.map` over questions
into a `flex flex-col ... gap-10` container) does **zero** height
bookkeeping — no maze type's panel component reports its own size anywhere,
the browser lays out and centers whatever was actually rendered, regardless
of a future maze type's panel being non-square, taller, shorter, or built
from completely different content. This isn't a small ergonomic difference:
it's the exact failure mode "many maze types, each with their own design"
would keep hitting on the backend and structurally can't hit on the frontend.

**What doesn't change:** the backend still reuses `pickaxe_maze.grid.parse_rows`
directly and keeps rendering next to maze-generation code; the frontend still
needs its own custom SVG per maze type (no more free emoji shortcut) and
still can't produce a one-click downloadable file without a server-side step
(the Download-button finding above).

These two findings together pointed toward a third option — not a strict
either/or between backend-drawn and frontend-drawn — spiked next, below.

## Hybrid spike: headless browser prints the frontend's React tree to PDF

`Web App/spikes/pdf-renderer/hybrid/` — a small standalone Node project
(own `package.json`/`package-lock.json`, not touching the frontend's real
dependency graph) that spawns the frontend spike's own Vite dev server,
opens `/spike/pdf-preview` in headless Chromium via Playwright, and calls
`page.pdf()` — Chromium's actual print-to-PDF engine, the same one behind the
browser's Print dialog — to capture a **real PDF file on disk**, no manual
"Save as PDF" click. This directly tests the synthesis above: author each
maze type's question design as a React/SVG component (the frontend's
demonstrated composability win from the section above), get a true one-click
downloadable file anyway via a backend automation step (satisfying the
Download-button finding) instead of hand-drawn PDF primitives.

```bash
cd "Web App/spikes/pdf-renderer/hybrid"
npm install    # once
node render_via_browser.mjs                              # -> output/hybrid_question.pdf + hybrid_answer_key.pdf
node render_via_browser.mjs --preview-question 3          # -> output/hybrid_question_preview_3.pdf, isolated
node render_via_browser.mjs --preview-question 3 --answer-key
node render_via_browser.mjs --data path/to/level.json     # render a real exported LevelProgress
```

**It worked, cleanly, on the first real attempt.** 5-page sheet (cover + 3
question pages + bonus, matching the reportlab output's page count exactly),
correct A4 sizing via the page's own `@page` CSS rule
(`preferCSSPageSize: true`), correct pagination via `page-break-after`,
correct grayscale/backgrounds via `printBackground: true`, and the
single-question preview produces a clean isolated PDF with no page chrome —
all verified by rendering, extracting individual pages, and visually
inspecting them. Text in the output is real extractable PDF text (checked via
`pypdf`'s `extract_text()`), not rasterized — same property reportlab's
`drawString` already has, so not a differentiator between the two backend
options, but confirms this path doesn't lose that quality either.

**One real bug this caught:** the frontend page's print CSS (`.no-print`
hiding the toolbar, the `@page` rule) only lived inside the "full sheet"
branch of the component, not the single-question preview branch — so a
headless-browser PDF of "Question 3" in isolation was including the on-screen
toolbar controls in the printed output. Fixed by hoisting the shared
`<style>` block above the branch so both paths get it
(`PdfPreviewSpikePage.tsx`). This is exactly the kind of gap that's easy to
miss when only ever checking a page by eye in a browser tab (where the print
stylesheet's absence when you're not printing is invisible) — driving actual
PDF generation surfaced it immediately.

**Trade-offs this introduces, weigh against the wins above:**
- **A live dev server is now a hard runtime dependency for PDF generation,**
  not just a dev convenience — `render_via_browser.mjs` spawns
  `npm run dev` itself and waits for it. A real implementation would need a
  built/served frontend bundle in whatever environment generates PDFs
  (the backend, presumably), not a `vite dev` process — solvable, but it's
  infrastructure the pure-backend and pure-frontend options don't need.
- **File size:** `hybrid_question.pdf` is ~186KB vs. reportlab's
  `output_question.pdf` at ~15KB for the identical fixture — roughly 12×
  larger, almost certainly from Chromium embedding/subsetting web fonts per
  print-to-PDF call, something reportlab avoids by using PDF base-14 fonts.
  Worth a closer look (font-loading strategy, `pdfmetrics.registerFont` on
  the reportlab side would close some of this gap too since it isn't using
  base-14 either in a final version) before treating this as settled, but as
  measured today it's a real cost difference to factor in.
- **A second moving part in the render pipeline** — dev server + headless
  browser + PDF capture step, vs. reportlab's single Python function call.
  More that can fail (server didn't start in time, browser crashed, a
  selector changed and the answer-key toggle silently didn't click) for a
  production job queue to handle gracefully, though none of that showed up
  in this spike's runs.

## Renderer-tech decision + wiring real data in

**2026-08-19 — hybrid chosen** (see `Web App/docs/pdf_export_spec.md` §7 item 5 for the
full rationale): the composability finding above, plus frontend-only's inability to
satisfy the Download button's one-click requirement, outweighed hybrid's file-size and
infra trade-offs.

**Real `LevelProgress` data now wired in, same day, later session.** `LevelProgress`
(`types/maze.ts`) turned out to be a structural superset of this spike's `SpikeFixture`
(same field names, plus `createdAt`/`updatedAt` which the page ignores) — no
transformation needed. The remaining gap was transport: Playwright's headless Chromium
is a separate process with no access to the dashboard tab's Zustand store or the
filesystem location of a user-downloaded save file. Solved via `page.addInitScript`:
`render_via_browser.mjs --data path/to/level.json` reads the file, validates it parses,
and injects it as `window.__PDF_FIXTURE_DATA__` before navigation;
`PdfPreviewSpikePage.tsx`'s `readFixture()` reads that global if present, falling back
to the hardcoded `sampleFixture` otherwise (so the no-`--data` path, and the
manual-browser `/spike/pdf-preview` route, are unchanged). Verified by rendering a
hand-modified copy of `sample_fixture.json` (different level/month/week, and the Bonus
flag moved to a different page) through `--data` and visually confirming the PDF
reflects the injected values, not the default fixture. **Not yet built:** the actual
Preview/Download buttons in `LevelDashboardPage.tsx` that would produce this JSON from
`current` and call this script — this only proves the renderer *can* consume real data,
not a one-click UI path yet (that's still real backend-service work, see
`pdf_export_spec.md` §7 item 5's "not yet done" note).

## Regenerating the fixture

```bash
source .venv/bin/activate
python "Web App/spikes/pdf-renderer/generate_fixture.py"
```

Seeds are hardcoded in `generate_fixture.py` for reproducibility — rerunning
produces byte-identical mazes. Writes both `sample_fixture.json` (backend)
and `Web App/frontend/src/spike/sampleFixture.ts` (frontend).
