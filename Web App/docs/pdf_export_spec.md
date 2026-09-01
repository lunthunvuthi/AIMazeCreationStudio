# PickAxe Maze — PDF Print Template Spec

This document translates the designer-provided sample
(`Maze-All-Contents/pickaxe-maze-creation/Images/Sample/Kinder July-week4-01.pdf`, and its answer-key
counterpart `Answer Kinder July-week4-01 2.pdf`) into concrete layout rules for the
**Export PDF** feature deferred in `development_plan.md` §7/§9 (roadmap step 8). It maps
`LevelProgress` (§4.3) to a printable worksheet.

As with `development_plan.md`, anything marked **(ASSUMPTION)** was inferred from the
sample and needs confirmation before implementation — the sample is a single example
sheet (Kinder, 9 maze panels), not itself a spec, so some of its choices may be
one-off rather than general rules.

**Status:** spec only. `Export PDF` stays disabled per `development_plan.md` §6.5 until
a renderer implementing this doc exists.

**See `pdf_design_spec.md` for the pixel-measured visual reference** (exact colors,
line thicknesses, panel geometry, the grid/wall/dot rendering algorithm, icon and
mascot design) — this doc covers document structure and product decisions; that one is
what makes a renderer's output actually match the template rather than approximate it.
This doc's §3/§4.2/§6 below have been corrected to match that doc's measured findings
where the two used to disagree (this doc's original draft was visual-estimate-only and
got the grid style, colors, and per-page panel layout wrong — see `pdf_design_spec.md`
§6.2/§7 for what changed and why).

**2026-08-19 — real vector assets superseded several visual-estimate items:** a
designer-provided folder of vector source files (`Web App/frontend/public/components/svg/`)
arrived and was confirmed role-by-role — see `pdf_design_spec.md` §12 for the full
catalog and the inline "Superseded" notes throughout that doc. In particular: the
cover page now has a literal full-A4 vector template (`Front Cover.svg`) rather than
needing to be reconstructed purely from the raster sample's measurements (§3 below), and
the Start/Goal/pickaxe/laurel icons are now exact vectors rather than shape-matched
approximations.

---

## 0. Source sample: what it is and isn't

- The sample PDF is **8 pages, each a single flattened A4 raster image** (2480×3508px,
  ~300dpi) — confirmed via its PDF structure (one `/Image` XObject per page, no text
  objects, no embedded fonts). There's no vector text/paths to extract, but the raster
  itself **can** be measured precisely (exact colors via full-page histogram, line
  thickness/panel geometry via pixel run-length scans) — `pdf_design_spec.md` §0
  documents the method; don't re-derive layout values by eyeballing a thumbnail when
  that doc already has the measured ones.
- The sample carries the **"Think! Think!" logo and mascot cat "Hatenyan"** — confirmed
  by the project owner (2026-08-19) to be this company's own branding, not a third
  party's, so it's safe to reproduce directly rather than treating it as a placeholder.
  (Corrected from this doc's original draft, which had mistakenly flagged it as external
  IP.)
- The sample's exact maze panel count (9 panels across 6 numbered boxes) does not divide
  evenly into Kinder's documented 8-question distribution (`difficulty_setting.md`:
  1★×1, 2★×2, 3★×2, 4★×2, 5★×1). **(ASSUMPTION)** — treated here as one illustrative
  sheet, not proof that "2 panels per page" is a hard rule for every star. §4 below
  generalizes the pagination logic by panel size instead of hardcoding "boxes 1-3 get 2
  panels."

---

## 1. Page Geometry

- **Size/orientation:** A4 portrait (210mm × 297mm), one worksheet page per
  print-page — matches the sample's page size exactly.
- **Margins (ASSUMPTION, visual estimate):** ~8–10mm on all sides, with a full-page
  border rule drawn just inside the margin on the cover and bonus pages (not on the
  numbered question pages, which have no outer border — only the maze panel itself is
  bordered).

---

## 2. Document Structure (page sequence)

For one `LevelProgress`, the exported PDF is:

1. **Cover / Direction page** (§3) — one per document, always first.
2. **Question pages** (§4) — one or more `MazeQuestion` panels per page, in `questions[]`
   order, paginated per §4's rule.
3. **Bonus page** (§5) — one per document, always last.

An **answer key** is the same page sequence with each maze panel's solution path drawn
over the grid (per the answer-key sample) — §6.

---

## 3. Cover / Direction Page

Static content, not derived from maze data except the header fields:

- **Header bar:** "Think! Think!" logo (left) · `Name: ______` blank (center-left) ·
  vertical divider · level/period label (right), two lines:
  - Line 1: `LevelProgress.level`, capitalized (`Kinder` / `Primary` / `Advanced`).
  - Line 2: `{MONTH_ABBR} {year} / Wk{week}` — e.g. `Sep 2026 / Wk1`. Reuses the sheet
    metadata from `development_plan.md` §4.3.

    **Resolved 2026-08-28 — the year is now printed.** This was an open question for a
    week on the grounds that "there is no room for it in this field", which came from an
    estimate rather than a measurement. Measured against the real Roboto-Bold at the
    designer's own 14px, over every month × week 1..52, the field's 121pt (divider
    x=450.30 to page border x=571.33) takes:

    | candidate | worst case | width | fits |
    |---|---|---|---|
    | `{Mon} {year} / Week{w}` | `May 2026 / Week10` | 125.2pt | **no** |
    | `{Mon} {year} / Wk{w}` | `May 2026 / Wk10` | 110.3pt | **yes**, 5.4pt clear each side |
    | `{Mon} {year} / W{w}` | `May 2026 / W10` | 102.8pt | yes, but `W10` reads worse |
    | `{Mon} {year} / Week{w}` at 12px | — | 99.1pt | yes, below the designer's size |

    So the year fits at full size only with **Week → Wk**. Two further findings from the
    same measurement: the month must stay abbreviated (`September / Week1` is 123.9pt,
    over even when perfectly centred), and putting the year on line 1 instead is not an
    option (`Advanced 2026` at 18px is 126.0pt).

    It also required a positioning change. The designer left-anchors both lines at x
    values chosen for the sample strings `Kinder` / `Aug / Week1`, so a longer value grows
    rightward toward the page border — `Advanced` and a two-digit week both push that way.
    Both lines are now `text-anchor="middle"` on the field's centre (510.815), so growth
    is shared between the two margins. Verified by rendering a real PDF for
    `Advanced / May 2026 / Wk10`, `Primary / Sep 2030 / Wk52` and
    `Advanced / Dec 2026 / Wk1`, and reading the text nodes' bounding boxes back in user
    units — all clear both the divider and the border.

    `scripts/verify_worksheet_pdf.py` asserts the new string, **including the year**, so a
    silent regression to the yearless form fails the run.

    **`Wk` confirmed by the owner 2026-09-01.** It shipped as the measurement's only
    viable candidate rather than as anyone's preference, so it was carried as an open
    question in case the owner wanted `Week` back. They don't — `Wk` is the chosen form,
    not merely the surviving one. Reversing it is a one-word change to `CoverPage.tsx` and
    the verifier, but it costs the year on this line, which is the whole point of this
    entry.
- **Title banner:** full-width bar, **measured as a plain gray fill (`#9D9F9E`), not
  colored** (corrects this doc's original amber/colored-banner guess), with a large
  title (sample: "Let's do it", no exclamation mark) and the Hatenyan mascot icon.
  **(ASSUMPTION)** — title could be static per maze type (e.g. always "Let's do it" for
  PickAxe) or configurable; defaulting to static per maze-type registry entry (§5 of
  `development_plan.md`) unless told otherwise.
- **Direction box:** rounded-rect panel, "Direction" pill label, instruction text
  (maze-type-specific — PickAxe's is "Let's break the walls with a pickaxe and reach the
  goal!"), then a **correct-example** mini maze panel (1 pickaxe, path drawn, reaches
  goal using exactly that many broken walls) side-by-side with an **incorrect-example**
  mini maze panel (crossed out, showing a path that breaks more walls than pickaxes
  allow) with a short caption. Both examples are static fixtures per maze type, not
  derived from the current level's actual questions. **The correct-example panel has two
  decorations found nowhere else in the document** — a sparkle/burst marker at each
  wall-break point and a pickaxe-in-speech-bubble callout at the break(s) the path
  consumes (`pdf_design_spec.md` §5) — those are specific to teaching the rule here and
  must **not** leak into the real per-question panels (§4.2) or the answer key (§6).
- **Decorative footer graphic:** purely cosmetic (muted maze/road motif), no data.
  **CUT 2026-09-01 (owner) — not part of the cover.** See `pdf_design_spec.md` §4. It is
  absent from `Front Cover.svg` entirely and the composited watermark occupies that area,
  so there is nothing here for an implementer to build. Kept in this list only so the
  element inventory still matches what the source sample showed (§0).

**Built 2026-08-21 — `Web App/frontend/src/spike/CoverPage.tsx`.** The cover is now
composited on the real `Front Cover.svg`, and the note that used to sit here (predicting
what would need generating) was one item wrong: **"Let's do it" IS already in the
template**, as nine white outlined glyph paths inside the title-band group — see
`pdf_design_spec.md` §12.2, corrected. Only two things get generated:

- the **watermark** (§3's four-part breakdown below), and
- the **Direction box's contents** — instruction sentence, correct example, counter-example.

Everything else, including the title text, comes from the file untouched. The two header
fields that ship with sample values (`Kinder`, `Aug / Week1`) are substituted with the
real `LevelProgress` values; `CoverPage.tsx` throws if either field can no longer be
found, so a template that changes shape fails the export instead of silently printing
"Kinder" on a Primary sheet.

**Four-part anatomy (project owner, 2026-08-21).** The page divides into header /
title band / body / direction box. The body carries a sample question of this maze type,
drawn faintly with its ideal line as a watermark — and with **no outer panel border**, the
one documented exception to `pdf_design_spec.md` §6.1 (see §12.2 there for why the frame
does not survive being scaled up). The direction box always sits **in front of** the
watermark, hiding part of it.

**Watermark sizing (revised 2026-08-21 on owner review).** It is *larger* than the page,
not merely page-width, and clipped to the body band. Three constraints interact, and the
non-obvious one is that they fight each other: the Start figure sits in the maze's bottom
row and grows upward from its cell centre, so **scaling the watermark up pushes that
figure's head further underneath the Direction box**, not clear of it. The owner's rule is
that the head and body must be plainly visible and only the legs may be cut. So the panel
is pushed *down* as it is scaled up, and the overflow is clipped rather than left to run
off the sheet — an unclipped overflow on a fixed-height print page can spill into an extra
blank PDF page. Current values are in `CoverPage.tsx`'s `WATERMARK`, with the arithmetic
spelled out there.

**Every example on this page carries its maze type's question badge.** The watermark, the
correct example and the counter-example all show the pickaxe row + count bubble above the
maze, exactly as a real question page does (§4.2). This was missing until the owner flagged
it on 2026-08-21, and it matters most on the counter-example: its whole point is "you broke
2 walls but had only 1 pickaxe", which is unreadable if the pickaxe count isn't on the
panel. The counter-example's large ✗ is offset down by the badge height so it covers the
maze only, never the count. The badge is rendered by `pdfMazeTypeRegistry.tsx`'s exported
`Badge` at an explicit point height, so the same component serves both screen-sized and
page-sized uses.

**The counter-example also carries a ✗-in-a-circle on its top-left corner**, labelling the
whole container as the wrong example — distinct from the large ✗ over the maze, which marks
that specific answer wrong. It straddles the corner rather than sitting inside it, because
the container's interior is fully taken by the caption and the maze. That layering is not
done with clip paths — the watermark is drawn *beneath the whole template*, and the
template's own opaque white header rect, opaque Direction-box fill, and gray title band
mask it exactly where needed. `Front Cover.svg` is therefore never edited, and a redraw
from the designer drops in without touching the masking.

**The cover's tutorial mazes are fixed constants, not export data** —
`spike/coverTutorial.ts`'s `COVER_CONTENT`, keyed by maze type (same extensibility seam
as `pdfMazeTypeRegistry.tsx`). Confirmed by the owner: "for the cover page, the tutorial
question is always fixed." Both PickAxe examples were run through the real validator
before being committed; the counter-example is deliberately invalid (2 walls broken, 1
pickaxe) and so is not validator-checkable.

**This makes `pages[0]` an ordinary question page.** The cover no longer consumes a
question, so the renderer renders every row of `pages[]` (it previously rendered
`pages.slice(1)`, which would now silently drop an authored question). The Level
Dashboard was brought in line on 2026-08-21 — it no longer labels row 0
"Cover / Tutorial" or locks it (`level_dashboard_pagination_spec.md` §4.1). See
`PRODUCTION_PROCESS.md` §4.

---

## 4. Question Pages

### 4.1 Pagination rule

**Superseded by `level_dashboard_pagination_spec.md`:** pagination is no longer computed
by the renderer at export time. As of the dashboard redesign (2026-08-19), page/row
membership (1-2 questions per row) is authored directly on the
Level Dashboard and saved as `LevelProgress.pages[]` — the PDF renderer simply renders
`pages[]` in order, one PDF page per `PageRow`, with no auto-fit-by-height logic. This
keeps the print output and the dashboard's page-row preview in visual agreement (what
you arranged is what prints), rather than risking the renderer's height-based packing
disagreeing with the dashboard's own row boundaries.

- Each page's numbered box shows the **1-based index of that `PageRow` within
  `pages[]`** (matches the sample: boxes 1-6 across 6 pages). The cover itself is
  unnumbered/untitled per §3, and as of 2026-08-21 it consumes no row at all — its
  tutorial is a fixed constant (§3, `spike/coverTutorial.ts`) — so numbering starts at
  `pages[0]`, which is an ordinary question page like every other row
  (`level_dashboard_pagination_spec.md` §4.1).
- **Laurel-wreath / "Bonus" marker — superseded 2026-08-19, now manual:** the sample
  marks its last 2 pages with a laurel-wreath icon next to the number, originally
  interpreted (2026-08-19, earlier same day) as "this row's questions include the
  sheet's highest star rating," computed automatically per row. **Replaced same day**
  by an explicit **"Bonus" toggle** the user sets per page row on the Level Dashboard —
  see `level_dashboard_pagination_spec.md` §4.4 for the data-model/UI change. Manual
  control was chosen over the star-rating heuristic because the user wants direct
  authorship over which pages read as "bonus," not an inferred rule that could surprise
  them after reordering rows. When the toggle is on, the page-number box uses the laurel
  design (`pdf_design_spec.md` §7, §12.1's `symbol-19.svg`); off, it's the plain
  hairline-bordered rectangle (`pdf_design_spec.md` §7).

### 4.2 Per-maze panel

- **Pickaxe badge:** row of pickaxe icons above the grid equal to `MazeData.pickaxe_count`,
  with a speech-bubble count label (sample shows the count redundantly as both icon-count
  and a number badge — replicate both since that's clearly deliberate for pre-reading
  Kinder-age kids).
- **Grid:** bordered square, **no background grid at all for open/no-wall edges** —
  corrects this doc's original "light dotted internal cell-division lines" guess, which
  this project's first renderer spike implemented and which is why that spike's output
  looked wrong (per user review 2026-08-19). The panel interior is plain white; only
  actual walls (`|`/`_`/`_|`) are drawn, each as a full-length line along its one shared
  cell edge, measurably *thinner* than the outer border, with a small filled dot at each
  interior endpoint (none at endpoints touching the outer border). Full algorithm:
  `pdf_design_spec.md` §6.2 — that section is the one to implement against, not this
  paragraph's summary.
- **Start/Goal icons:** sample uses a **walking stick-figure** for Start and a **flag
  with a square frame around a star** for Goal (not a bare triangular pennant — that
  shape is only used for the cover's intentionally-"broken" incorrect-example flag,
  `pdf_design_spec.md` §5), positioned inside their cell — not the literal "S"/"G"
  letters that `development_plan.md` §7 specifies for the in-app simple renderer.
  **Confirmed 2026-08-19** — print export uses these friendlier icons (Kinder/Primary
  audience) while the in-app editor keeps plain letters (§7, unchanged, since that's
  about fast in-app iteration, not final print quality). **Sourced from real vectors as
  of 2026-08-19** — `symbol-16.svg` (Start) / `symbol-17.svg` (Goal), see
  `pdf_design_spec.md` §12.1.
- No wall-count/pickaxe-count text is shown *inside* the grid — only the badge above it.
- **Panel count per page:** where a page holds 2 questions, the sample stacks the two
  panels **vertically** (one above the other, each with its own badge), not
  side-by-side — corrects this project's first renderer spike, which laid them out
  side-by-side. Panels are horizontally centered on the page regardless of count
  (`pdf_design_spec.md` §7).

---

## 5. Last Page (was: Bonus Page)

Static, one per document, and as of 2026-08-21 **no longer rendered from markup** — the
project owner supplied the finished artwork as full-bleed A4 rasters, one per level, at
`Web App/frontend/public/components/images/`. `spike/LastPage.tsx` places the image for
the sheet's level; nothing is composited onto it.

- Both files are 2480×3508px — A4 at exactly 300dpi.
- They are **not** two crops of one design. Kinder closes on **Hatenyan alone**, holding a
  pencil, under "I did it!"; Primary closes on **two Hatenyan flanking a third, larger
  bear-like figure**, cropped at the page's bottom edge, under "Well done! You did it!".
  The per-level split is real content.

  **Do not name that third figure.** This doc used to call it Posuru. That came from
  reading the JPEG, not from the owner, and it contradicts the owner's standing rule
  (2026-08-19, reconfirmed 2026-09-01): **Pickaxe Maze uses Hatenyan and only Hatenyan.**
  Posuru is a separate brand asset the owner will assign to content explicitly. Describing
  the figure is fine; attributing it is not.
- Keyed by **level, not maze type** — so a new maze type inherits it, but a new level
  needs new artwork. **`advanced` has no artwork of its own and reuses Primary's**, on the
  project owner's explicit instruction (2026-08-21). That is an editorial choice, not a
  renderer default: the two pages differ in content, so which one Advanced borrows
  matters. Replace with a dedicated file when one is produced. `LastPage.tsx` keeps a
  visible placeholder branch for any unmapped level — unreachable through `LevelName`
  today, but `level` comes from a save file at runtime.
- **Colour management — resolved 2026-08-21.** Both files arrived as **CMYK /
  U.S. Web Coated (SWOP) v2**, and the headless browser's implicit CMYK→RGB conversion
  was measurably lighter than a colour-managed one (Kinder's mascot rich black rendered
  `rgb(71,68,70)`, versus `rgb(36,30,32)` through ColorSync). The served copies are now
  **sRGB IEC61966-2.1**, converted once with
  `sips -m "sRGB Profile.icc" -s formatOptions best`; the same pixel now renders
  `rgb(37,33,34)` in the PDF. The CMYK masters are preserved at
  `Web App/assets-source/last-pages-cmyk/` — see that folder's README, and use those, not
  the sRGB copies, for any real print run.
- **Side effect worth knowing:** with an sRGB JPEG input, Chromium now embeds the file
  **verbatim** (`/Filter /DCTDecode`, byte length identical to the source) instead of
  decoding and re-encoding it as Flate. Better fidelity — no double re-encode — but the
  exported PDF grew from ~284KB to ~729KB. If size ever matters, the lever is the source
  JPEG's own quality, since the PDF now embeds it unchanged.

The previous hand-coded version of this page (Bonus Challenge ribbon + "Be a mission
maker!" + blank draw area + mascot, rebuilt in JSX from this section's original
description) is deleted — the supplied images *are* that page, rendered by the designer.

---

## 6. Answer Key Variant

Same page sequence and layout as §2-§5, with one addition per maze panel: the solution
path (`MazeQuestion.solutionTrace`) drawn as a **plain, straight, dark-grey** line
(`#58595B` — owner override 2026-08-21 of the sample's measured ink black, so the route
stays readable against the black Start figure; see `pdf_design_spec.md` §8) 
connecting cell-centers from Start to Goal (matches the answer-key sample exactly — same
panel, same badge, path overlaid, confirmed by direct comparison against the same
panel's question-only rendering, `pdf_design_spec.md` §8). **Correction, found by
comparing the two variants directly:** real answer-key panels do **not** get the cover
illustration's sparkle/burst markers or pickaxe-in-bubble callouts, and the path itself
is a crisp straight line, not the cover example's wavy "hand-drawn road" stroke — those
are exclusive to §3's tutorial illustration. This project's first renderer spike got
this wrong (it drew the tutorial-style decorations, and used the tutorial's path style,
on what were meant to be plain answer-key panels). **Confirmed 2026-08-19** — the
answer key is a **separate download** (`Export PDF` + `Export Answer Key PDF`, as in the
sample, two distinct files), so a teacher can hand out only the question sheet.

**Built 2026-08-27.** The Level Dashboard's **Answer Key** button renders with
`answerKey: true` and saves as `<sheet filename>-answer-key.pdf` — the same base name as
the question sheet with a suffix, so the pair sorts together in a download folder.
Unlike Preview/Download it does not cache a blob or require a preview first: the key is
never the artifact being proofed on screen, so a two-step flow would only add a click. It
is gated on every question being complete, because an empty slot leaves the renderer's
question panel with no maze to draw and the page never signals ready.

---

## 7. Open Decisions Before Implementation

1. ~~Icon set for Start/Goal in print~~ — **resolved 2026-08-19**: print export uses the
   sample's stick-figure (Start) and flag-with-star (Goal) icons; the in-app editor keeps
   plain "S"/"G" letters (§7 of `development_plan.md`, unchanged). Two renderers, two
   purposes — no unification needed.
2. ~~Branding placeholder~~ — **resolved 2026-08-19**: the logo/mascot are this
   company's own IP (§0), reproduce directly.
3. ~~Laurel-wreath / "top difficulty" marker~~ — **resolved 2026-08-19**: keep it, using
   the computed-from-data interpretation in §4.1 (shows on any row whose questions
   include the sheet's highest star rating).
4. ~~Answer key delivery~~ — **resolved 2026-08-19**: separate download
   (`Export PDF` + `Export Answer Key PDF`), matching the sample.
5. ~~Renderer technology~~ — **resolved 2026-08-19: hybrid.** Headless Playwright
   drives the frontend's own React print view (`/spike/pdf-preview`) and calls
   `page.pdf()` to produce a real, one-click-downloadable PDF — see
   `Web App/spikes/pdf-renderer/README.md`'s "Hybrid spike" section for the full spike.
   Chosen over backend (`reportlab`) and frontend-only (`window.print()`) because:
   frontend/hybrid's CSS-reflow composability (no per-maze-type height contract to get
   subtly wrong, unlike reportlab's immediate-mode canvas) was judged the most important
   property for supporting many future maze types, each with their own question design;
   frontend-only alone can't satisfy the Download button's one-click requirement
   (`window.print()` requires a manual "Save as PDF" step); and the real vector assets
   (`pdf_design_spec.md` §12) drop into the frontend's DOM trivially versus needing
   `svglib`/manual path conversion for reportlab. Accepted trade-offs: a built/served
   frontend bundle becomes a hard runtime dependency for PDF generation (not just a dev
   convenience), current spike output is ~12× larger than reportlab's (186KB vs. 15KB,
   likely closable with font subsetting, not yet attempted), and there's a second moving
   part (dev/prod server + headless browser + capture step) versus a single Python
   function call. This unblocks both the dashboard's **Preview** button
   (`level_dashboard_pagination_spec.md` §6.3) and final Export PDF.
   **2026-08-19 update:** the hybrid renderer can now consume a real `LevelProgress`
   JSON file directly (`render_via_browser.mjs --data path/to/level.json`, injected into
   the headless page via `page.addInitScript` since `LevelProgress` is a structural
   superset of the spike's fixture type) — see
   `Web App/spikes/pdf-renderer/README.md`'s "Renderer-tech decision + wiring real data
   in" section.
   **2026-08-20 update:** the browser-triggers-server-side-Playwright architectural
   question is resolved — a standalone Node/Express service, `Web App/pdf-service/`
   (own `package.json`, not part of the frontend's dependency graph), reusing the same
   `page.addInitScript`/`page.pdf()` approach as the CLI script but against the
   frontend's already-running dev server rather than spawning its own. `POST
   /api/pdf/render` (optional `?answerKey=true`) takes a raw `LevelProgress` JSON body
   and returns PDF bytes; `Web App/frontend/vite.config.ts` proxies `/api/pdf` to it
   (port 8010, alongside the FastAPI backend's 8000). The dashboard's **Preview** and
   **Download** buttons (`LevelDashboardPage.tsx`) are wired up to it — see
   `level_dashboard_pagination_spec.md` §6.3.
   **2026-08-21 update:** the cover page is now built from the real `Front Cover.svg`
   template (§3) and the last page from the supplied per-level artwork (§5), replacing
   the approximated markup for both. The renderer's readiness signal changed with them:
   it waits on `[data-pdf-ready="true"]`, set once the cover's template fetch and the
   last page's image decode have both finished, instead of the old `text=Bonus Challenge`
   selector (which pointed at markup that no longer exists, and which resolved before
   those async loads completed). `@page` margin is now `0`, with each sheet element
   exactly 210mm × 297mm carrying its own padding — the cover and last page are
   full-bleed, and the previous `margin: 10mm` combined with 210mm-wide page elements had
   been overflowing the 190mm printable width. Question-page content boxes are unchanged
   at 190mm × 277mm.
