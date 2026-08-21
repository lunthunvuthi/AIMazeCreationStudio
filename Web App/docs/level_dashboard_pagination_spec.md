# Level Dashboard — Page-Row Redesign Spec

This document specs a redesign of the Level Dashboard
(`Web App/frontend/src/pages/LevelDashboardPage.tsx`), replacing today's flat 3-column
question grid with a **list of page rows** — each row representing one page of the
exported worksheet PDF (`pdf_export_spec.md`), holding 1-2 questions, reorderable via
drag-and-drop. It also adds **Preview** and **Download (PDF + JSON)** to the dashboard's
action bar.

Written 2026-08-19 from the project owner's description, confirmed against the current
codebase (`types/maze.ts`, `levelStore.ts`, `LevelDashboardPage.tsx`). As with
`development_plan.md` and `pdf_export_spec.md`, anything marked **(ASSUMPTION)** was
inferred and should be corrected if wrong. Three forks were confirmed directly with the
project owner before writing this (§5.1, §6.2, §4.3) — noted inline as **(CONFIRMED)**.
A fourth, §4.4's manual "Bonus" toggle, was added the same day from a later, separate
instruction from the project owner (also directly confirmed, not inferred).

**Status (updated 2026-08-19):** the data model (§2: `PageRow`, `isBonus`, `formatVersion: 2`,
the old-file migration) and a minimal row-list dashboard UI (§3/§4: cover row locked,
in-row "+ Add question", "+ Add new page", the Bonus toggle) are **implemented**, in
`types/maze.ts`/`store/levelStore.ts`/`storage/fileAdapter.ts`/`LevelDashboardPage.tsx`.
**Not implemented:** §5's drag-and-drop (swap/move questions between rows via
`@dnd-kit`) and §6's Preview/Download buttons — today's Save Progress/Export JSON stay
as they were. This was a deliberate scope cut for this pass, not an oversight.

---

## 1. Why this doc exists

Today, `current.questions` is a flat array rendered as a 3-column card grid — there is
no concept of "which PDF page a question lands on." Now that `pdf_export_spec.md`
defines the print output as a page sequence, the dashboard needs to let the user author
that page structure directly (which questions share a page, in what order) rather than
have a renderer guess it after the fact. This doc is that authoring UI's spec, plus the
data-model change it requires.

---

## 2. Data Model Changes

### 2.1 `PageRow` (new type)

```ts
export interface PageRow {
  pageId: string           // stable id, independent of position — for React keys & DnD identity
  questions: MazeQuestion[] // length 1 for the cover row (pages[0]); 1-2 for every other row
  isBonus: boolean          // §4.4 — manual "Bonus" flag; always false for pages[0] (the cover row)
}
```

> **Stale as of 2026-08-21 — `pages[0]` is no longer a cover row.** The PDF cover's
> tutorial mazes became fixed per-maze-type constants
> (`spike/coverTutorial.ts`, `pdf_export_spec.md` §3), so the cover consumes no question
> and **every** row in `pages[]` is a question page. The renderer was updated to match.
> This doc's "pages[0] is always the cover/tutorial row" — §2.1's comment, §2.2, §2.3's
> migration step 2, §3's "Row 0 (cover row)", §4.1, §4.3's cover-row exemption — plus
> `LevelDashboardPage.tsx`'s locked "Cover / Tutorial" card and `levelStore.ts`'s
> `startNewLevel` reserving `pages[0]`, are all still written the old way. Known
> follow-up, deliberately not changed in the pass that built the cover. See
> `PRODUCTION_PROCESS.md` §4.

`isBonus` is new as of 2026-08-19 (§4.4) — see that section for the UI and rendering
rule. It **replaces** `pdf_export_spec.md` §4.1's original plan to compute the
laurel-wreath marker automatically from "does this row contain the sheet's highest star
rating" — that auto-computed rule is now superseded by this explicit per-row flag.

### 2.2 `LevelProgress` (§4.3 of `development_plan.md` — changed)

```ts
export interface LevelProgress {
  formatVersion: 2          // bumped from 1 — questions[] replaced by pages[]
  mazeType: string
  level: LevelName
  sheetName: string
  year: number
  month: number
  week: number
  pages: PageRow[]          // pages[0] is always the cover/tutorial row (§4.1)
  createdAt: string
  updatedAt: string
}
```

`MazeQuestion` itself (§4.2) is unchanged — page membership and order live entirely in
`pages[]`'s structure, not as an index field on the question. This avoids a second
source of truth that could drift out of sync with actual array position (the same
"heuristic, not guaranteed" risk already flagged for `question_id` occurrence-numbering
in `handoffs/handoff-2026-08-18-2321.md` — don't repeat that pattern here).

### 2.3 Migration (`fileAdapter.ts`)

`parseLevelProgressFile` must detect `formatVersion === 1` (or a missing `pages` key)
and migrate on load:

1. Take the sheet's existing flat `questions[]`.
2. Its first question becomes `pages[0]` alone (the cover/tutorial row).
3. Pack the remaining questions into rows of 2, in their existing array order, as
   `pages[1..]`.
4. Every migrated row gets `isBonus: false` (§4.4) — there's no prior data to infer it
   from, and the user can toggle it on per row immediately after loading.
5. Re-save under `formatVersion: 2` the next time the user exports.

**(ASSUMPTION)** — step 2 assumes `questions[0]` is the tutorial question (true today,
since `startNewLevel` always builds the 1★ tutorial first per `development_plan.md`
§6.4). This is a one-time reflow of *old* save files only; the user can immediately
rearrange the result via drag-and-drop, so a slightly-wrong initial grouping is cheap to
fix, not a data-loss risk.

### 2.4 `question_id` occurrence counting

`buildEmptyQuestion`/`addQuestion`/`setQuestionStar` in `levelStore.ts` currently scan
the flat `state.current.questions` array to compute each star's occurrence number (e.g.
the `-2` in `kinder-3star-2`). With `pages[]`, this needs a
`state.current.pages.flatMap(p => p.questions)` flatten step wherever that scan happens
— call this out explicitly during implementation, it's an easy spot to miss.

---

## 3. Dashboard Layout

Replace the `grid grid-cols-2 sm:grid-cols-3` question grid with a **vertical list of
page rows**, each rendered full-width, in `pages[]` order:

- **Row 0 (cover row):** visually distinct (e.g. a header-styled card) — shows it holds
  the tutorial question, no drag handle, no remove control, no second-question slot.
  Rendered from `pages[0].questions[0]` using the existing `QuestionSlotCard`.
- **Rows 1..N:** each shows 1 or 2 `QuestionSlotCard`s side-by-side (or stacked on
  narrow viewports), a small "Page N" label (N = the row's 1-based index within
  `pages[]`, matching `pdf_export_spec.md` §4.1's page numbering) with a **"Bonus"
  toggle right next to it** (§4.4, new 2026-08-19), and — only when the row currently
  holds exactly 1 question — a trailing **"+ Add question"** slot (reuses today's
  `AddQuestionCard` star-picker dropdown, **(CONFIRMED)** unchanged from its current
  behavior — this is only about *where* it's rendered, inside the row instead of
  trailing the whole grid).
- **"+ Add new page"** — a single control after the last row (not inside any row).
  Clicking it appends a new `PageRow` with one freshly-built `empty` question at
  **3-star** difficulty (star chosen regardless of level, since `starParams` for star 3
  exists across every level's shared registry per `development_plan.md` §5 — it's just
  not that level's own default distribution for Advanced, which is fine, the same
  divergence-from-template allowance already covers this per §6.5).

---

## 4. Page Row Rules

### 4.1 Cover row is fixed **(CONFIRMED)**

Row 0 is not part of the drag-and-drop system at all: its question can never be dragged
out, and no other question can be dropped into it. It always holds exactly one
question — the tutorial. No "+ Add question" slot, no Remove control, no drop target
behavior. This sidesteps any "cover row becomes empty" edge case entirely, at the cost
of the tutorial question being permanently un-editable-in-position (its star/content can
still presumably be changed via its own difficulty selector, same as before — that part
is unchanged from today's `QuestionSlotCard`).

### 4.2 Row capacity

- Row 0: exactly 1, always.
- All other rows: 1 or 2. A row showing 2 questions hides its "+ Add question" slot
  (§3).

### 4.3 Empty rows self-delete **(CONFIRMED interpretation)**

Any row other than row 0 that drops to 0 questions (its only or last question dragged
elsewhere) is removed from `pages[]` immediately — no empty placeholder row is ever
rendered or persisted. Because `pages[]` is a plain ordered array (not indexed by a
separate page-number field), removing a row automatically renumbers everything after it
— no explicit reindexing step needed.

### 4.4 "Bonus" toggle per row (added 2026-08-19, from the project owner's description)

Each row other than row 0 gets a **"Bonus" trigger** — a small toggle/checkbox next to
that row's "Page N" label (§3) — bound to `PageRow.isBonus` (§2.1).

- **Off (default):** the exported page's page-number box renders as the plain
  hairline-bordered rectangle (`pdf_design_spec.md` §7).
- **On:** the page-number box renders with the **laurel design** instead —
  `pdf_design_spec.md` §7's laurel wreath (`symbol-19.svg`, `pdf_design_spec.md` §12.1)
  wrapped around that row's number.
- Row 0 (the cover row) never shows this toggle and `isBonus` is always `false` for it —
  it has no page-number box at all (§4.1's numbering starts at the first question row,
  matching `pdf_export_spec.md` §4.1).

**This replaces the previous plan** (`pdf_export_spec.md` §4.1, `pdf_design_spec.md`
§7) to compute the laurel marker automatically from "does this row contain the sheet's
highest star rating." That heuristic is now dropped in favor of direct manual control —
the user decides which pages read as "Bonus," rather than the renderer inferring it,
which also sidesteps any surprise re-labeling when rows get reordered via drag-and-drop
(§5). Multiple rows can be marked Bonus on the same sheet; there's no cap or mutual
exclusivity rule.

---

## 5. Drag-and-Drop Mechanics

The request describes two things that sound distinct but resolve to the same mechanic
plus two supporting ones. Concretely, three drag gestures cover everything described:

1. **Drag a question onto another question's card** → the two swap positions (their
   `PageRow`s exchange that question). Works within the same row or across rows. Row
   question-counts never change, so this never triggers §4.3's auto-delete and never
   needs to touch row 0's lock (row 0 is excluded from being either side of a swap, per
   §4.1).
2. **Drag a question onto an empty "+ Add question" slot** in a row that currently has
   1 question → moves the dragged question into that row as its second question,
   removing it from its original row (which may then self-delete per §4.3 if that was
   its only question).
3. **Drag a question onto the "+ Add new page" control** → moves it into a brand-new
   row created at the end of `pages[]` (its original row self-deletes per §4.3 if
   emptied).

### 5.1 Whole-row reordering is out of scope **(CONFIRMED by omission)**

Nothing in the request asks for dragging an entire row as a unit — only individual
questions move. Row order only changes as a side effect of gesture 3 (new rows append
at the end) and rows disappearing (§4.3). If whole-page drag-reordering turns out to be
wanted later, it's an additive change (drag handle on the row itself, unrelated to the
per-question gestures above) — not built into this pass.

### 5.2 Library

No drag-and-drop library exists in `Web App/frontend/package.json` yet (checked
2026-08-19 — only `react`, `react-dom`, `react-router-dom`, `zustand`). **Confirmed
2026-08-19** — `@dnd-kit/core` (+ `@dnd-kit/sortable` if the swap/move semantics above
map cleanly onto its sortable primitives), for its lightweight footprint, no dependency
on a specific backend, and good accessibility defaults. Still needs adding to
`package.json` when implementation starts.

---

## 6. Preview & Download

### 6.1 Button set (replaces today's Save Progress / Export JSON pair)

- **Save Progress** — unchanged. Always-available JSON-only checkpoint download, same
  as today.
- **Preview** (new) — renders the worksheet as it would print, for the *current* state
  of `pages[]`, regardless of completion (useful mid-work, incomplete questions render
  as an empty/placeholder panel). **(ASSUMPTION)** — not gated on `allComplete`, since
  its whole point is checking layout before finishing.
- **Download** (new, replaces today's `Export JSON` button) — downloads **both** the
  PDF and the JSON for the current sheet in one click. Gated on:
  1. `allComplete` (same rule `Export JSON` already used), **and**
  2. a fresh Preview having been generated since the last edit (§6.2).

### 6.2 Preview-freshness gating **(CONFIRMED)**

Rather than manually flagging "stale" on every mutating store action (error-prone — easy
to miss a spot, same risk class as the `question_id` heuristic in §2.4), recommend a
**snapshot-comparison** approach:

- On Preview, store a serialized snapshot of `current` (e.g.
  `JSON.stringify(current)`) in local component/store state as `previewedSnapshot`.
- Download's enabled condition becomes:
  `allComplete && previewedSnapshot === JSON.stringify(current)`.
- Any edit at all (drag, add, remove, re-rate, sheet-info change, completing a question)
  naturally changes the serialized form, so this can't drift out of sync the way a
  manually-toggled boolean could.

### 6.3 Dependency on the renderer (blocking)

Preview needs *something* to render a PDF-like view from. `pdf_export_spec.md` §7 item 5
(backend vs. frontend vs. hybrid rendering tech) is **resolved as of 2026-08-19: hybrid**
(headless Playwright printing the frontend's React view to PDF) — but it is not yet
*wired up*: the hybrid spike still only ever renders its own hardcoded fixture, not real
`LevelProgress`/`pages[]` data.

- **Phase A (done):** the `pages[]` data model, row-based dashboard UI, and Bonus toggle
  are implemented (§4.4). Drag-and-drop from §5 is deliberately **not** built yet
  (scope cut, see `pdf_export_spec.md`'s "Done" history / `MEMORY.md`).
- **Phase B (done, 2026-08-20):** real `LevelProgress` data is wired into the hybrid
  renderer, and the actual **Preview**/**Download** buttons in `LevelDashboardPage.tsx`
  replace the old Save Progress/Export JSON pair per §6.1 — backed by a new
  `Web App/pdf-service/` Node/Express service (see `pdf_export_spec.md` §7 item 5's
  2026-08-20 update for the architecture). Preview renders regardless of completion
  and caches the resulting blob; Download reuses that cached blob (no re-render) once
  §6.2's `previewedSnapshot === JSON.stringify(current)` gate passes, and also
  downloads the JSON via the existing `downloadLevelProgress`. Verified end-to-end via
  the real Modify-Maze-load → Dashboard → Preview → Download flow with a fully-complete
  sample sheet (5-page, 190KB PDF).

---

## 7. Files Likely Touched (for implementation planning, not yet started)

- `Web App/frontend/src/types/maze.ts` — add `PageRow` (incl. `isBonus`, §4.4), change
  `LevelProgress.questions` → `pages`, bump `formatVersion`.
- `Web App/frontend/src/store/levelStore.ts` — restructure all actions around
  `pages[]`; add swap/move actions for §5's three gestures; add row auto-delete (§4.3);
  add a toggle action for `isBonus` (§4.4); add preview-snapshot state (§6.2).
- `Web App/frontend/src/storage/fileAdapter.ts` — `formatVersion: 1` → `2` migration
  (§2.3); update filename stamping if it referenced `questions.length` anywhere.
- `Web App/frontend/src/pages/LevelDashboardPage.tsx` — replace the grid with the
  page-row list (§3); new Preview/Download buttons (§6.1).
- New component(s): a `PageRowCard` (or similar) wrapping 1-2 `QuestionSlotCard`s per
  row; the cover row likely reuses `QuestionSlotCard` directly with drag disabled.
  `AddQuestionCard` is reused as-is inside a row (§3) — no changes expected there.
- `Web App/frontend/package.json` — new drag-and-drop dependency (§5.2).

---

## 8. Open Decisions Still Needed

1. **Renderer tech** (`pdf_export_spec.md` §7 item 5) — still blocks Phase B of §6.3, not
   just final Export PDF. **Decided 2026-08-19: spike both** (backend Python vs. frontend
   browser-print/CSS) before committing — no winner picked yet.
2. ~~DnD library pick~~ — **resolved 2026-08-19**: `@dnd-kit/core` (§5.2).
3. ~~Laurel-wreath / "top difficulty" marker mechanism~~ — **resolved 2026-08-19**:
   dropped the auto-computed-from-star-rating rule in favor of a manual per-row
   "Bonus" toggle (§4.4), driven directly by the project owner's description of how they
   want this to work, not an inference from `questions[]`.
4. Everything else in this doc was either directly confirmed with the project owner
   (§4.1, §4.3/§5.1, §6.2, §4.4, and keeping the in-row add picker per §3) or is a
   low-risk inferred default (migration grouping §2.3, 3-star new-page default already
   stated by the project owner, Preview not gated on completeness §6.1) — flagged
   inline as **(ASSUMPTION)** rather than blocking on it.
