# Maze Studio Web App — Development Plan

This document specifies the web application that wraps the maze generation/validation
scripts (see `Maze-All-Contents/pickaxe-maze-creation/`) in an interactive authoring tool. It is written to
be **maze-type-agnostic** at the architecture level — PickAxe Maze is the first (and
currently only) registered maze type, but the app should not hardcode assumptions that
would block adding a second type later.

Decisions below were confirmed with the project owner on 2026-08-17. Anything marked
**(ASSUMPTION)** was inferred to keep the spec unblocked and should be corrected if wrong.

**This document is the product spec — what each screen/endpoint should do and why.**
For an implementation-level map of the actual code (file-by-file purpose, data flow,
gotchas — written so an AI session can read it instead of re-reading the whole
codebase), see `frontend/frontend_reference.md` and `backend/backend_reference.md` in
this same folder.
Keep those two updated whenever the corresponding code structure changes; keep this
doc updated whenever the intended behavior changes.

---

## 1. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React + TypeScript (Vite) | SPA, no SSR needed |
| Styling | Tailwind CSS | fast iteration on grid/wizard UI |
| Frontend state | Zustand (or React Context if the store stays small) | one store per in-progress level session |
| Backend | Python + FastAPI | hosts the generator + validator algorithms from `generation_spec.md` / `validator_design.md` natively, no translation to JS |
| Backend algorithm code | Reuses/implements the DFS validator and constructive generator exactly as specified in the PickAxe docs | this is also the "Maze Generator and Validator scripts" the previous handoff flagged as the next step — building them as importable Python modules serves both the CLI/offline use case and this API |
| PDF export | **Deferred** — button stays disabled/hidden until a designer delivers the print template | see [§7](#7-maze-visual-rendering-spec) for the simple in-app visual that ships now instead; the designer's sample has since arrived and is specced in `pdf_export_spec.md` (renderer not yet built) |
| Persistence | **Phase 1: file-based only** (JSON export/import, no DB) | see [§2](#2-persistence-strategy-phased) |
| Deployment | Not yet decided — out of scope for this doc | revisit once Phase 1-3 are working locally |

---

## 2. Persistence Strategy (Phased)

Confirmed: build file-based first, but **architect the storage layer so the later phases
are additive, not a rewrite.**

- **Phase 1 (build now):** All state lives in the frontend store during a session. "Save"
  = serialize the current `LevelProgress` object (§4) to a `.json` file download. "Resume"
  = drag-and-drop that JSON file back into the **Modify Maze** screen, which deserializes
  it straight back into the store.
- **Phase 2 — BUILT 2026-08-28** (`storage/localStorageAdapter.ts`): a `localStorage`
  autosave alongside the file export, so an accidental refresh/tab-close doesn't lose
  unsaved work. Additive as predicted — the stored record is a bare `LevelProgress`, the
  same bytes the file export writes, read back through the same parser/migration.
  **One slot, not a library:** it holds whatever sheet the store currently has, as a crash
  net for the session in progress. A list of past work is Phase 3's job, not this one.
  Details in `frontend/frontend_reference.md` §6; verified by `scripts/autosave_check.mjs`.
- **Phase 3 (future):** Add backend-persisted accounts/projects (Postgres via FastAPI),
  so `LevelProgress` can be loaded/saved by ID instead of only by file.
  **Spiked 2026-08-28** — [`storage_spike.md`](storage_spike.md) covers the options
  (Google Drive direct vs. shared Drive vs. a backend), the concerns, and the decisions
  the owner needs to make. Two findings from it belong here:
  - **`LevelProgress` had no id — fixed 2026-08-28.** Every remote store and the whole
    collaboration flow needs one; `(level, year, month, week)` is user-editable and
    legitimately non-unique. `sheetId` + `formatVersion: 3` shipped as roadmap step 6.5;
    see §4.3.
  - **Google Drive can serve a single teacher** ("save my sheets, see them on reload") but
    **cannot** serve the multi-user publish/approve/roster flow — Drive ACLs cannot express
    "only a HeadTeacher may approve", and a roster has no home there. `storage_spike.md`
    §3.3.

**Design implication:** define a single `ProgressStorageAdapter` interface up front
(`save(progress): Promise<void>`, `load(id?): Promise<LevelProgress>`,
`list?(): Promise<Summary[]>`) with a `FileAdapter` implementation for Phase 1. Phase 2
adds a `LocalStorageAdapter`, Phase 3 a `BackendAdapter` — the UI and store never need to
change, only which adapter is wired in.

**How that actually went, recorded 2026-08-28:** the interface was *not* built, at Phase 1
or Phase 2. With one implementation it had nothing to prove itself against, and Phase 2's
adapter turned out not to share the sketched signatures anyway — its `save` is
fire-and-forget with a throttle, and its `load` takes no id because there is one slot. What
the two implementations *did* need to share was the parser: `parseLevelProgress` is now
exported from `fileAdapter.ts` and used by both, because two copies of the version checks
and the formatVersion-1 migration was the real risk, not two call signatures. Expect the
interface to become worthwhile at Phase 3, when there are three implementations and a
genuine `list()`.

---

## 3. High-Level Architecture

```
┌─────────────────────────────┐        ┌───────────────────────────────┐
│        Frontend (SPA)        │  REST  │        Backend (FastAPI)       │
│  React + TS, Vite, Tailwind │◄──────►│  Python generator/validator    │
│                              │  JSON  │                                 │
│  - Landing / type select    │        │  /api/maze/generate            │
│  - Level dashboard           │        │  /api/maze/validate            │
│  - Manual creation wizard   │        │  /api/maze/reroll               │
│  - Randomize + reroll UI    │        │  (PDF export deferred)          │
│  - Save/Load (file-based)   │        │  (Phase 3: /api/projects/*)     │
└─────────────────────────────┘        └───────────────────────────────┘
```

The backend is **stateless** in Phase 1 — every request carries the full maze/level
payload it needs; nothing is stored server-side. This keeps Phase 3's persistence layer
purely additive.

---

## 4. Data Model

These shapes are shared (conceptually) between frontend TS types and backend Pydantic
models. The per-cell string format is the one already defined in `rules.md` — this app
does not invent a new maze data format, it just wraps it in session/progress metadata.

### 4.1 `MazeData` (a single maze, matches `rules.md` verbatim)
```ts
type MazeData = {
  pickaxe_count: number;
  width: number;
  height: number;
  maze: string[]; // rows, comma-separated cells: "s" | "g" | "." | "|" | "_" | "_|" etc.
};
```

### 4.2 `MazeQuestion` (one slot in a level)
```ts
type MazeQuestion = {
  question_id: string;         // e.g. "kinder-3star-1"
  difficulty_star: number;     // 1-8
  status: "empty" | "in_progress" | "randomized" | "complete";
  origin: "manual" | "random" | null;
  maze: MazeData | null;       // null while status === "empty"
  solutionTrace: string | null; // e.g. "S,1 -> 2 -> 3(break _ wall) -> ... -> 9"
  seeds: {                    // only populated for randomized questions, enables reroll
    sgSeed: number | null;
    pathSeed: number | null;
    wallSeed: number | null;
  };
};
```

### 4.3 `LevelProgress` (the file that gets saved/loaded)

**Superseded twice. The snippet below is `formatVersion: 1`, kept for history.**
The current shape is `formatVersion: 3`:

- **`formatVersion: 2`** (2026-08-19, `level_dashboard_pagination_spec.md` §2) replaced
  flat `questions[]` with `pages: PageRow[]` so the Level Dashboard authors page/row
  structure directly, and added a per-row `isBonus` flag (§4.4) for the exported PDF's
  laurel-wreath marker. Drag-and-drop reordering (that spec's §5) landed 2026-08-26.
- **`formatVersion: 3`** (2026-08-28) added **`sheetId: string`** — a UUID minted once at
  `startNewLevel` and carried unchanged by every edit and by the export/import round
  trip. `storage_spike.md` §4 is why: nothing could name a sheet. The nearest thing was
  `(level, year, month, week)`, which is editable from the dashboard **and** legitimately
  non-unique — two teachers both authoring "Primary, Sep, week 1" is the point of a
  publish-and-choose flow, not a collision to prevent. Without an id, "update the
  existing sheet" versus "create a second one" is undecidable for Drive, for a backend,
  and even for a multi-sheet local library.

  It is opaque and never shown to a user; `sheetName` remains the human label. Nothing
  derives a filename, page number or sort order from it — it is only compared for
  equality.

Both migrations are additive and live in `storage/fileAdapter.ts`'s
`parseLevelProgress`, applied on the way in, so the rest of the app only ever sees the
current shape and **every older save file still loads**. A pre-v3 file has a `sheetId`
minted for it on import, which means importing the same old file twice yields two
distinct sheets — correct, since no field in an old file is both stable and unique. A v3
file keeps its id, so moving a sheet between two machines stays one sheet.

Current field list: `formatVersion` · `sheetId` · `mazeType` · `level` · `sheetName` ·
`year` · `month` · `week` · `pages` · `createdAt` · `updatedAt`.

```ts
type LevelProgress = {
  formatVersion: 1;
  mazeType: "pickaxe";         // registry key, see §5
  level: "kinder" | "primary" | "advanced";
  sheetName: string;           // user-editable label, e.g. "Kinder Week 2"
  year: number;
  month: number;                // 1-12
  week: number;
  questions: MazeQuestion[];   // pre-populated per difficulty_setting.md distribution
  createdAt: string;           // ISO timestamp, stamped client-side at export time
  updatedAt: string;
};
```

`sheetName`/`year`/`month`/`week` default to blank/current-year/current-month/1 when a
level is started, and are editable at any time from the Level Dashboard (§6.5) — they
identify which real-world question sheet (e.g. "2026, August, Week 2") this `LevelProgress`
corresponds to. Save files exported before these fields existed load fine; missing values
are defaulted the same way.

The **JSON export/import format IS `LevelProgress`** — no separate "save file" schema.
Downloading mid-progress and downloading a fully-complete level use the same shape; only
`questions[].status` differs.

---

## 5. Maze Type Registry (extensibility)

Even though only PickAxe Maze exists today, the landing page and routing should be built
against a registry, not a hardcoded page:

```ts
type MazeTypeDefinition = {
  id: string;                 // "pickaxe"
  label: string;              // "PickAxe Maze"
  difficultyConfig: LevelDistribution; // from difficulty_setting.md, per level
  WizardSteps: React.ComponentType[];  // ordered step components for manual creation
  CellRenderer: React.ComponentType<{ cell: CellState }>;
};

const MAZE_TYPES: MazeTypeDefinition[] = [pickaxeMazeDefinition];
```

Adding a second maze type later means adding one entry to this array plus its own backend
generator/validator module registered the same way (`/api/maze/generate?type=<id>`) — it
should not require touching the landing page, routing, or save/load logic.

---

## 6. Screen-by-Screen Spec

### 6.1 Landing Page
- Grid/list of registered maze types (currently just "PickAxe Maze").
- Clicking a type navigates to that type's home screen.

### 6.2 Maze Type Home
- Two options: **Create New Maze** / **Modify Maze**.

### 6.3 Modify Maze
- Drag-and-drop (or file-picker) zone accepting a `LevelProgress` JSON file.
- On drop: validate `formatVersion` + `mazeType` match a known registry entry, then
  deserialize straight into the store and route to the Level Dashboard (§6.5) with all
  slot statuses restored.
- **Confirmed:** any question, including ones already `complete`, can be re-opened and
  edited from here — the level is never locked just because it was exported once.

### 6.4 Create New Maze → Level Selection
- User picks Kinder / Primary / Advanced.
- App immediately builds the `questions[]` list per the star distribution in
  `difficulty_setting.md` (e.g. Kinder = 1★×1, 2★×2, 3★×2, 4★×2, 5★×1), all `status: "empty"`.
  This distribution is a **starting template, not a hard cap** — see §6.5 for how the
  dashboard lets a sheet diverge from it afterward.
- The 1★ tutorial slot is **auto-generated immediately** (calls
  `/api/maze/generate` with `star: 1`, no user interaction) and marked `randomized` /
  `complete` before the dashboard is even shown.

### 6.5 Level Dashboard

**Superseded by `level_dashboard_pagination_spec.md` (2026-08-19):** the flat
question-grid layout described below was replaced by a page-row list (1-2 questions per
row, plus Preview/Download actions) so the dashboard directly authors the PDF page
structure from `pdf_export_spec.md`. **Status (2026-08-21):** the row list, the per-row
Bonus toggle and Preview/Download are all built; drag-and-drop reorder/swap is the one
part still outstanding. The page-row list originally kept row 0 as a *locked* cover row —
that lock was removed 2026-08-21 (that doc's §4.1), so every row is an ordinary question
page. Treat the bullets below as historical: they describe the flat grid this replaced.

- Shows all slots (e.g. as a star-labeled grid/list) with status badges: Empty /
  In Progress / Complete, each rendered with the simple visual style from
  [§7](#7-maze-visual-rendering-spec) once a maze exists for that slot.
- Selecting an empty or in-progress slot opens **Create Myself vs Randomize** choice.
  Selecting an already-`complete` slot reopens it (at Step 4 for randomized-origin, or
  the wizard for manual-origin) so it can be modified and re-validated.
- Header shows overall completion (e.g. "3 / 8 complete").
- Each slot has its own **difficulty selector** (any star the maze type registers, e.g.
  1-8 for PickAxe) so a question can be re-rated after the level was created, and its own
  **Remove** control. Re-rating or removing a slot that already holds a maze prompts for
  confirmation first, since the maze is tied to that star's `starParams` (grid size,
  pickaxe range) and can't just carry over — the slot resets to `empty` under its new
  star, matching the manual wizard's "any edit invalidates" rule.
- A trailing **"+ Add question"** slot in the grid lets the user grow the sheet past
  `difficulty_setting.md`'s starting count: picking a star appends a new `empty` slot.
  This is how a sheet ends up with more (or fewer, via Remove) questions than the level's
  default distribution — e.g. adding an extra 3★ question to a Kinder sheet.
- Always-available **Save Progress** button → exports current `LevelProgress` as JSON
  (works at any completion level, including 0%).
- When **all** slots are `complete`: **Export JSON** becomes available (same action as
  Save Progress, just framed as "final"). **Export PDF stays disabled** (grayed out,
  e.g. with a "Coming soon — pending visual design" tooltip) until the print template
  in [§7](#7-maze-visual-rendering-spec) is superseded by a real designer-provided
  template.

### 6.6 Randomize This Question
- Calls `/api/maze/generate` with `{ type: "pickaxe", star }` (no seed → server picks
  seeds). Backend runs the full constructive pipeline internally
  (`generation_spec.md` steps 1-7) and returns a `MazeQuestion` that is already
  `status: "randomized"` with a valid `solutionTrace`.
- The result is shown on the **same screen as manual Step 4** (§6.7.4), fully filled in,
  Validate already green, **Complete** button visible immediately.
- Three reroll controls, each re-calling the backend with the previous result's other
  seeds pinned and one seed randomized:
  1. **Reroll S/G placement** — new `sgSeed`; re-runs steps 2→7 (new S/G, new path, new
     required + distraction walls, re-validate).
  2. **Reroll ideal path** — keeps S/G, new `pathSeed`; re-runs steps 3→7.
  3. **Reroll wall placement** — keeps S/G + path, new `wallSeed`; re-runs steps 4→7
     (both required-on-path walls and distraction walls are re-scattered, then
     re-validated).
- Each reroll replaces the question's `maze`/`solutionTrace`/relevant seed and re-renders
  the same read-only Step 4 view.

### 6.7 Create Myself (Manual Wizard)
A 4-step wizard per question slot. "Next" is disabled until that step's completion rule
is satisfied. Confirmed: **grid size is fixed per star** (read-only display, not user
adjustable); pickaxe count is only user-choosable where `difficulty_setting.md` already
defines a range (stars 6-8), otherwise it's also fixed and shown read-only.

#### 6.7.1 Step 1 — Size & Pickaxes
- Displays the fixed grid size for this star (e.g. "4×4").
- If this star has a pickaxe range (stars 6-8 today): a picker within that range.
  Otherwise: fixed value, read-only.
- Next always enabled (nothing to configure wrong here) once acknowledged.

#### 6.7.2 Step 2 — Place Start & Goal
- Click an empty cell to place S if no S exists yet; click an empty cell to place G once
  S exists; clicking an existing S or G removes it.
- **Confirmed:** the column-1/last-column restriction from `generation_spec.md` §1 applies
  **only to the Randomize pipeline** (the backend generator always places S in column 1
  and G in the last column). In the manual wizard there is **no placement restriction** —
  the user may click S and G onto any two empty cells on the grid.
- Next enabled only when both S and G are placed.

#### 6.7.3 Step 3 — Draw the Ideal Path
- Each cell has 4 boolean edge flags (`u`, `r`, `l`, `d`) for "line segment active",
  independent from the wall model (walls are placed in Step 4).
- **Confirmed — two equivalent input methods, both driving the same underlying path state:**
  - **Drag:** pointer-down on the S (or G) cell starts a drag; dragging into an
    orthogonally-adjacent, not-yet-visited cell activates the shared edge between the two
    cells (e.g. moving right from cell A to cell B sets `A.r = true` and `B.l = true`) and
    extends the visited path. Dragging back over the immediately-previous cell undoes that
    last segment (retrace-to-shorten).
  - **Tap/click:** clicking a cell only extends the path if that cell is orthogonally
    adjacent to the **current open end** of the path (i.e. the most recently connected
    cell, starting from S or G, whichever endpoint the user began from) and not already
    visited — clicking such a cell activates the shared edge exactly like a drag step.
    Clicking a cell that is **not** adjacent to the current open end does nothing (no
    connection is drawn). Clicking the current open end's immediate predecessor undoes
    the last segment, same as the drag retrace.
- No-crossing rule from `rules.md` §4 applies while drawing: the drag cannot re-enter an
  already-visited cell (matches "path can never revisit a cell").
- Live validation while drawing / on attempted Next:
  - A non-S/G cell with exactly **1** active edge, or **any** cell with **3+** active
    edges, blinks red — invalid.
  - S and G cells need exactly **1** active edge each; all other cells on the path need
    exactly **2**.
  - The full path must form one continuous S→G chain (no disconnected fragments).
- Next enabled only when the path is complete, continuous, and no cell is in a red-blink
  state.

#### 6.7.4 Step 4 — Add Walls
- **Sub-step A — Required walls (always manual, both manual & this screen for randomized results):**
  user clicks edges *along the ideal path drawn in Step 3* to place walls there. Must end
  up with **exactly** `pickaxe_count` walls on the path — the pickaxe counter/indicator
  blinks red if under or over that number.
- **Sub-step B — Distraction walls (manual-origin questions only):** confirmed — if the
  user chose "Create Myself" (not randomize), they also manually place the remaining
  distraction walls anywhere else on the grid until `difficulty_setting.md`'s minimum
  total wall count for that star is met. If the question was generated via Randomize
  instead, this sub-step is skipped entirely — the backend auto-scatters distraction
  walls as part of `generation_spec.md` step 5.
- **Validate button** enables once: (a) path-wall count == `pickaxe_count` exactly, and
  (b) for manual-origin questions, total wall count ≥ the star's minimum.
- Clicking Validate calls `/api/maze/validate` (running the DFS from
  `validator_design.md`) with the current `MazeData`.
  - `solution_count == 1` → show the solution trace, reveal **Complete** button.
  - `solution_count == 0` or `> 1` → show the validator's diagnostic message (unreachable
    goal / conflicting paths per `validator_design.md` §4), keep the user on this screen to
    add/move walls and re-validate. No auto-loop for manual questions — the human is the
    one iterating here, unlike the generator's internal auto-retry loop.
- **Complete** marks `status: "complete"` and returns to the Level Dashboard.

---

## 7. Maze Visual Rendering Spec

The app ships with a **simple in-app visual renderer** — this is the shared
`CellRenderer` referenced in the registry (§5), used everywhere a maze needs to be shown:
the wizard steps, the read-only Randomize/Step-4 view, and the Level Dashboard's slot
previews. It is *not* the print template — **Export PDF stays disabled** (§6.5) until
a renderer implementing the real template ships.

A designer sample has since arrived (`Maze-All-Contents/pickaxe-maze-creation/Images/
Sample/Kinder July-week4-01.pdf` + its answer-key counterpart) and is specced in
`pdf_export_spec.md`
— page geometry, pagination, per-panel layout, and open decisions (icon set, branding
placeholder, answer-key delivery, renderer tech). That spec is written; the renderer
itself is not yet built, so this section's in-app visual remains what actually ships
today.

Recommended implementation: one SVG per maze (or a `<div>` grid with absolutely-positioned
overlays) so the percentage-based wall rectangles are trivial to place.

- **Cell background:** white.
- **Cell border:** dotted line, light gray, drawn around every individual cell.
- **Outer maze border:** a double line around the entire grid's perimeter (the
  unbreakable boundary from `rules.md` §2) — visually distinct from the dotted internal
  cell borders.
- **Start/Goal:** render the literal letter **"S"** or **"G"**, centered in the cell.
- **Walls** (from the `|` / `_` / `_|` cell data): a light-gray filled rectangle placed on
  the shared edge between the two cells it separates, not inside either cell:
  - **Right wall (`|`):** height = 80% of cell height, width = 5% of cell width, centered
    on the vertical edge between the cell and its right neighbor.
  - **Bottom wall (`_`):** width = 80% of cell width, height = 5% of cell height, centered
    on the horizontal edge between the cell and the cell below it.
  - **`_|` (both):** render both rectangles as above.
- This same styling underlies Step 3's path-line overlay (drawn on top, in an accent
  color distinct from the light-gray walls) and Step 4's wall-placement clicks (walls
  appear/disappear as this same light-gray rectangle as the user toggles them).

---

## 8. Backend API

All endpoints are stateless — request payload is self-contained, no server-side session.

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/maze/generate` | POST | `{ type, star, sgSeed?, pathSeed?, wallSeed? }` → runs `generation_spec.md` steps 1-7 (any seed omitted = pick randomly), returns `MazeData` + `solutionTrace` + the seeds actually used |
| `/api/maze/validate` | POST | `{ type, maze: MazeData }` → runs the `validator_design.md` DFS, returns `{ solutionCount, trace? , diagnostic? }` |
| *(Deferred)* `/api/export/pdf` | POST | Not built yet — JSON export is handled entirely client-side (serializing `LevelProgress`), and PDF rendering waits on the real visual template (§7) |
| *(Phase 3)* `/api/projects/*` | — | CRUD for backend-persisted `LevelProgress`, once accounts exist |

`type` is included on every call so the backend can dispatch to the right
generator/validator module once a second maze type exists (mirrors the frontend registry
in §5).

---

## 9. Build Phases / Roadmap

0. **Prerequisite (already next on the list per the 2026-08-17 handoff):** implement the
   actual Python `generator.py` / `validator.py` modules per `generation_spec.md` and
   `validator_design.md`. This web app's backend imports those modules directly — it does
   not re-derive the algorithms.
1. Frontend skeleton: routing, maze-type registry, landing page, level dashboard shell.
2. Manual creation wizard (Steps 1-4, including the manual-only distraction-wall sub-step)
   wired to `/api/maze/validate`.
3. Randomize + reroll flow wired to `/api/maze/generate`.
4. File-based save/load: JSON export from the dashboard, drag-drop import via Modify Maze.
5. Simple in-app maze visual (§7), used across the wizard, Step 4 preview, and dashboard
   slot thumbnails. **Export PDF button ships disabled** — revisit once a designer
   delivers the real print template.
6. **Done 2026-08-28.** `localStorage` autosave layer (Phase 2 persistence, §2). The
   store hydrates from the autosave at construction, so a refresh keeps the sheet and
   stays on the Level Dashboard; writes coalesce in a 500 ms window and flush on
   `pagehide`; the maze-type home gained a **Resume / Discard** card; the three paths that
   replace the sheet (new level, file import, discard) confirm first once a maze has been
   authored; a refused write shows a visible warning rather than failing silently.
   Verified end to end in a real browser by `scripts/autosave_check.mjs` (20 checks).
6.5. **Done 2026-08-28.** `sheetId` + `formatVersion: 3` — see §4.3. Every path in step 7
   needed it identically, and doing it standalone kept the migration out of 7b's diff.
   `scripts/autosave_check.mjs` grew from 20 to 29 checks: sheetId is stable across a
   reload, a pre-v3 import mints one, a v3 import preserves it, the same v3 file imported
   twice stays one sheet, and an empty id is treated as absent. Those import checks are
   also the **first automated coverage of Modify Maze** — the Phase B driver never loads a
   progress file back in.
7. *(Future)* Backend-persisted accounts/projects (Phase 3 persistence, §2). Specced
   2026-08-28 as a **multi-user workflow**, not just remote storage:
   [`collaboration_workflow_spec.md`](collaboration_workflow_spec.md) — Teacher /
   HeadTeacher roles, private drafts, publish, comments, approval of an immutable
   *revision*, and a HeadTeacher-owned week × level roster with deadlines. Feasible with
   no novel engineering, and the authoring core (wizard, randomizer, validator, dashboard,
   PDF) is untouched — but it turns a single-user local tool into a deployed service with
   accounts, a database and backups. Sub-steps, in dependency order:
   - **7a** Google sign-in, `users` + roles, tighten `main.py`'s `allow_origins=["*"]`,
     authenticate the pdf-service render endpoint. *Decide the test-login story here:*
     Google blocks automated sign-in, so every browser-driven check in `scripts/` stops
     working the day auth lands unless the backend offers a test-only path.
   - **7b** Sheets + immutable revisions in Postgres, `BackendAdapter`, "My work" and
     "Shared" screens, Alembic (there are no migrations today).
   - **7c** Publish + comments.
   - **7d** Roster + deadlines (soft: badges and sort order, no notifications in v1).
   - **7e** Approval / revoke, audit log, and the approved PDF rendered **server-side from
     the stored revision** — otherwise "approved" does not identify specific bytes.
   - **7f** Admin: invites and role assignment.

   **Blocked on the owner:** `collaboration_workflow_spec.md` §8 lists 14 questions, of
   which #11 (one school per deployment or multi-tenant) must be answered *before* the
   schema is written, and #14 (is this the near-term goal?) decides whether a Google Drive
   integration or a local multi-sheet library is worth building in the meantime or is
   throwaway work.
8. **Largely done — status corrected 2026-08-28.** Real PDF export per
   `pdf_export_spec.md`. The renderer, the `pdf-service`, and the dashboard's
   Preview / Download / Answer Key actions all shipped (2026-08-21 / 2026-08-27) and have
   been driven end to end for all three levels — see `PRODUCTION_PROCESS.md` §4's
   validation table. This entry still said "the renderer is not yet built", which has been
   false since 2026-08-21. What genuinely remains: the renderer still lives under
   `src/spike/` behind the `/spike/pdf-preview` route, so `pdf_export_spec.md` §7 item 5
   (renderer technology) is decided in practice but not yet cleaned up in the code, and
   that doc's remaining §7 items stay open.
9. **Done.** Level Dashboard page-row redesign per
   `level_dashboard_pagination_spec.md` — `pages[]` data model + migration (2026-08-21),
   Preview/Download actions (2026-08-21), drag-and-drop (2026-08-26). That doc has no
   unimplemented sections left; §5.1's whole-row dragging was scoped out, not deferred.
10. *(Optional, after 7)* **Google Drive as a mirror** of approved artifacts — a
   server-side, one-way export of the approved PDF + JSON into the school's Drive folder.
   Deliberately placed after step 7 and deliberately server-side: browser-held Drive
   tokens bring hour-long expiry mid-edit, last-write-wins clobbering and an untestable
   OAuth path, none of which apply to a one-way export of an already-frozen artifact.
   `storage_spike.md` §3.2 / §5.

---

## 10. Open Items / Follow-ups

All four items raised in the prior draft have been resolved:
- PDF export: confirmed deferred — button ships disabled, only JSON export + the simple
  in-app visual (§7) are required for now.
- Step 3 input: confirmed both drag and tap/click are supported, per §6.7.3.
- Step 2 S/G restriction: confirmed column restriction applies only to the Randomize
  pipeline, not manual creation.
- Modify Maze: confirmed completed questions remain editable, not locked.

No open items remain blocking this spec. The designer's print template has arrived and
is specced in `pdf_export_spec.md` (roadmap step 8) — that doc's own §7 lists the
decisions (icon set, branding placeholder, answer-key delivery, renderer tech) still
needed before the renderer itself is built.
