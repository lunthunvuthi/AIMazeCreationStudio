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
  - Line 2: `{MONTH_NAMES[month]} / Week{week}` — reuses the sheet metadata added to
    `LevelProgress` this session (§4.3 of `development_plan.md`). **(ASSUMPTION)** —
    the sample omits `year`; recommend adding it here (e.g. `July 2026 / Week4`) since
    `LevelProgress` already tracks it and dashboards spanning multiple years would
    otherwise be ambiguous.
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

---

## 4. Question Pages

### 4.1 Pagination rule

**Superseded by `level_dashboard_pagination_spec.md`:** pagination is no longer computed
by the renderer at export time. As of the dashboard redesign (2026-08-19), page/row
membership (1-2 questions per row, 1 on the cover row) is authored directly on the
Level Dashboard and saved as `LevelProgress.pages[]` — the PDF renderer simply renders
`pages[]` in order, one PDF page per `PageRow`, with no auto-fit-by-height logic. This
keeps the print output and the dashboard's page-row preview in visual agreement (what
you arranged is what prints), rather than risking the renderer's height-based packing
disagreeing with the dashboard's own row boundaries.

- Each page's numbered box shows the **1-based index of that `PageRow` within
  `pages[]`** (matches the sample: boxes 1-6 across 6 pages) — the cover row (index 0)
  is unnumbered/untitled per §3, numbering starts at the first question row.
- **Confirmed 2026-08-19** — the sample marks its last 2 pages with a laurel-wreath icon
  next to the number. Interpreted as "this row's questions include the sheet's highest
  star rating" (computed per-row from that row's own `questions[]`, not a fixed page
  position), so it still makes sense once rows have been freely reordered.

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
  about fast in-app iteration, not final print quality).
- No wall-count/pickaxe-count text is shown *inside* the grid — only the badge above it.
- **Panel count per page:** where a page holds 2 questions, the sample stacks the two
  panels **vertically** (one above the other, each with its own badge), not
  side-by-side — corrects this project's first renderer spike, which laid them out
  side-by-side. Panels are horizontally centered on the page regardless of count
  (`pdf_design_spec.md` §7).

---

## 5. Bonus Page

Static, one per document: "Bonus Challenge — Be a mission maker!" heading, a blank
boxed area sized for a child to hand-draw their own maze, and a closing Hatenyan mascot
with "I did it!". No data-driven content — this page is identical across every exported
sheet for a given maze type.

---

## 6. Answer Key Variant

Same page sequence and layout as §2-§5, with one addition per maze panel: the solution
path (`MazeQuestion.solutionTrace`) drawn as a **plain, straight, ink-black** line
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
5. **Renderer technology** — still open: backend Python (e.g. `reportlab` or
   `weasyprint`, generating from `LevelProgress` server-side) vs. frontend
   browser-print/CSS (reusing the existing React `CellRenderer`-adjacent components with
   print stylesheets). Backend keeps rendering logic in one place matching the
   maze-generation code; frontend reuses existing UI components. **Decided 2026-08-19:
   spike both before committing** — no winner picked yet, next step is to build a small
   throwaway version of each and compare. This blocks the dashboard's **Preview** button
   (`level_dashboard_pagination_spec.md`) as well as final Export PDF.
