# Maze Studio Web App — Development Plan

This document specifies the web application that wraps the maze generation/validation
scripts (see `pickaxe-maze-creation/`) in an interactive authoring tool. It is written to
be **maze-type-agnostic** at the architecture level — PickAxe Maze is the first (and
currently only) registered maze type, but the app should not hardcode assumptions that
would block adding a second type later.

Decisions below were confirmed with the project owner on 2026-08-17. Anything marked
**(ASSUMPTION)** was inferred to keep the spec unblocked and should be corrected if wrong.

---

## 1. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React + TypeScript (Vite) | SPA, no SSR needed |
| Styling | Tailwind CSS | fast iteration on grid/wizard UI |
| Frontend state | Zustand (or React Context if the store stays small) | one store per in-progress level session |
| Backend | Python + FastAPI | hosts the generator + validator algorithms from `generation_spec.md` / `validator_design.md` natively, no translation to JS |
| Backend algorithm code | Reuses/implements the DFS validator and constructive generator exactly as specified in the PickAxe docs | this is also the "Maze Generator and Validator scripts" the previous handoff flagged as the next step — building them as importable Python modules serves both the CLI/offline use case and this API |
| PDF export | **Deferred** — button stays disabled/hidden until a designer delivers the print template | see [§7](#7-maze-visual-rendering-spec) for the simple in-app visual that ships now instead |
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
- **Phase 2 (future):** Add a `localStorage`/`IndexedDB` autosave alongside the file
  export, so an accidental refresh/tab-close doesn't lose unsaved work. Purely additive —
  same `LevelProgress` shape, just written to two places.
- **Phase 3 (future):** Add backend-persisted accounts/projects (Postgres via FastAPI),
  so `LevelProgress` can be loaded/saved by ID instead of only by file.

**Design implication:** define a single `ProgressStorageAdapter` interface up front
(`save(progress): Promise<void>`, `load(id?): Promise<LevelProgress>`,
`list?(): Promise<Summary[]>`) with a `FileAdapter` implementation for Phase 1. Phase 2
adds a `LocalStorageAdapter`, Phase 3 a `BackendAdapter` — the UI and store never need to
change, only which adapter is wired in.

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
```ts
type LevelProgress = {
  formatVersion: 1;
  mazeType: "pickaxe";         // registry key, see §5
  level: "kinder" | "primary" | "advanced";
  questions: MazeQuestion[];   // pre-populated per difficulty_setting.md distribution
  createdAt: string;           // ISO timestamp, stamped client-side at export time
  updatedAt: string;
};
```

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
- App immediately builds the `questions[]` list per the exact star distribution in
  `difficulty_setting.md` (e.g. Kinder = 1★×1, 2★×2, 3★×2, 4★×2, 5★×1), all `status: "empty"`.
- The 1★ tutorial slot is **auto-generated immediately** (calls
  `/api/maze/generate` with `star: 1`, no user interaction) and marked `randomized` /
  `complete` before the dashboard is even shown.

### 6.5 Level Dashboard
- Shows all slots (e.g. as a star-labeled grid/list) with status badges: Empty /
  In Progress / Complete, each rendered with the simple visual style from
  [§7](#7-maze-visual-rendering-spec) once a maze exists for that slot.
- Selecting an empty or in-progress slot opens **Create Myself vs Randomize** choice.
  Selecting an already-`complete` slot reopens it (at Step 4 for randomized-origin, or
  the wizard for manual-origin) so it can be modified and re-validated.
- Header shows overall completion (e.g. "3 / 8 complete").
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

No print-ready design exists yet (a designer is producing that separately). Until then,
the app ships with a **simple in-app visual renderer** — this is the shared
`CellRenderer` referenced in the registry (§5), used everywhere a maze needs to be shown:
the wizard steps, the read-only Randomize/Step-4 view, and the Level Dashboard's slot
previews. It is *not* the print template — **Export PDF stays disabled** (§6.5) until
that real template replaces this spec.

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
6. *(Future)* `localStorage` autosave layer (Phase 2 persistence, §2).
7. *(Future)* Backend-persisted accounts/projects (Phase 3 persistence, §2).
8. *(Future, blocked on designer)* Wire up real PDF export once a print template exists,
   replacing the disabled button from step 5.

---

## 10. Open Items / Follow-ups

All four items raised in the prior draft have been resolved:
- PDF export: confirmed deferred — button ships disabled, only JSON export + the simple
  in-app visual (§7) are required for now.
- Step 3 input: confirmed both drag and tap/click are supported, per §6.7.3.
- Step 2 S/G restriction: confirmed column restriction applies only to the Randomize
  pipeline, not manual creation.
- Modify Maze: confirmed completed questions remain editable, not locked.

No open items remain blocking this spec. The only still-outstanding external dependency
is the designer's print template, tracked as roadmap step 8 above.
