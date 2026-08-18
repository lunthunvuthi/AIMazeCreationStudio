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

---

## 0. Source sample: what it is and isn't

- The sample PDF is **8 pages, each a single flattened A4 raster image** (2480×3508px,
  ~300dpi) — confirmed via its PDF structure (one `/Image` XObject per page, no text
  objects, no embedded fonts). There is nothing to extract programmatically (no exact
  hex colors, font names, or coordinates) — every measurement below is a visual estimate
  off the rendered page, not a measured value.
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
- **Title banner:** full-width colored bar with a large title (sample: "Let's do it")
  and the Hatenyan mascot icon. **(ASSUMPTION)** — title could be static per maze type
  (e.g. always "Let's do it" for PickAxe) or configurable; defaulting to static per
  maze-type registry entry (§5 of `development_plan.md`) unless told otherwise.
- **Direction box:** rounded-rect panel, "Direction" pill label, instruction text
  (maze-type-specific — PickAxe's is "Let's break the walls with a pickaxe and reach the
  goal!"), then a **correct-example** mini maze panel (1 pickaxe, path drawn, reaches
  goal using exactly that many broken walls) side-by-side with an **incorrect-example**
  mini maze panel (crossed out, showing a path that breaks more walls than pickaxes
  allow) with a short caption. Both examples are static fixtures per maze type, not
  derived from the current level's actual questions.
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
- **(ASSUMPTION)** — the sample marks its last 2 pages with a laurel-wreath icon next to
  the number. Recommend interpreting this as "this row's questions include the sheet's
  highest star rating" (computed per-row from that row's own `questions[]`, not a fixed
  page position), so it still makes sense once rows have been freely reordered.

### 4.2 Per-maze panel

- **Pickaxe badge:** row of pickaxe icons above the grid equal to `MazeData.pickaxe_count`,
  with a speech-bubble count label (sample shows the count redundantly as both icon-count
  and a number badge — replicate both since that's clearly deliberate for pre-reading
  Kinder-age kids).
- **Grid:** bordered square, light dotted internal cell-division lines, walls (`|`/`_`/`_|`)
  rendered as short blocking segments across the relevant dot-to-dot edge (visually
  consistent with `development_plan.md` §7's wall-rectangle approach, just drawn as a
  line between lattice dots rather than a filled rectangle inside the cell — print and
  in-app can use different wall-rendering styles since they're already documented as
  separate renderers).
- **Start/Goal icons:** sample uses a **walking stick-figure** for Start and a
  **flag-with-star** for Goal, positioned inside their cell — not the literal "S"/"G"
  letters that `development_plan.md` §7 specifies for the in-app simple renderer.
  **(DECISION NEEDED)** — confirm whether print export should use these friendlier icons
  (recommended, given Kinder/Primary audience) while the in-app editor keeps using plain
  letters (§7, unchanged, since that's about fast in-app iteration not final print
  quality), or whether both should be unified on one icon set.
- No wall-count/pickaxe-count text is shown *inside* the grid — only the badge above it.

---

## 5. Bonus Page

Static, one per document: "Bonus Challenge — Be a mission maker!" heading, a blank
boxed area sized for a child to hand-draw their own maze, and a closing Hatenyan mascot
with "I did it!". No data-driven content — this page is identical across every exported
sheet for a given maze type.

---

## 6. Answer Key Variant

Same page sequence and layout as §2-§5, with one addition per maze panel: the solution
path (`MazeQuestion.solutionTrace`) drawn as a bold line connecting cell-centers from
Start to Goal, breaking through the walls it consumes pickaxes on (matches the answer-key
sample exactly — same panel, same badge, path overlaid). **(ASSUMPTION)** — whether the
answer key is a separate PDF (as in the sample, two distinct files) or an appended
section of the same export; recommend keeping it a **separate download** (`Export PDF` +
`Export Answer Key PDF`) so a teacher can hand out only the question sheet.

---

## 7. Open Decisions Before Implementation

1. **Icon set for Start/Goal in print** (§4.2) — confirm diverging from §7's letter-based
   in-app renderer.
2. ~~Branding placeholder~~ — **resolved 2026-08-19**: the logo/mascot are this
   company's own IP (§0), reproduce directly.
3. **Laurel-wreath / "top difficulty" marker** (§4.1) — confirm the computed-from-data
   interpretation, or drop the icon entirely if it's not wanted as a general feature.
4. **Answer key delivery** (§6) — separate file vs. appended section.
5. **Renderer technology** — not yet decided: backend Python (e.g. `reportlab` or
   `weasyprint`, generating from `LevelProgress` server-side) vs. frontend
   browser-print/CSS (reusing the existing React `CellRenderer`-adjacent components with
   print stylesheets). Backend keeps rendering logic in one place matching the
   maze-generation code; frontend reuses existing UI components. No recommendation yet —
   worth a short spike of each before committing. Now more time-pressured: the new
   dashboard **Preview** button (`level_dashboard_pagination_spec.md`) needs *some*
   renderer to call, so this decision blocks that feature, not just final Export PDF.
