# Frontend Reference — `Web App/frontend/`

Implementation-level map of the React SPA, for AI/human sessions that need to change or
debug this code without re-reading every file first. For the *product* spec (what each
screen is supposed to do and the confirmed UX decisions), see `development_plan.md` §6.
This doc describes what the code *actually does*, as of the last update below — cross-
references to `development_plan.md` sections point at intent/rationale, this doc points
at implementation.

**Last verified against source:** 2026-08-19.

---

## 1. Tech stack & how to run it

React 19 + TypeScript, Vite 8, Tailwind CSS 4 (via `@tailwindcss/vite`, no separate
config file — utility classes only, no `tailwind.config.js`), `react-router-dom` v7,
Zustand v5 for state, `oxlint` for linting. No test runner configured for the frontend
(no Vitest/Jest/Playwright in `package.json`).

```bash
cd "Web App/frontend"
npm run dev          # Vite dev server, http://localhost:5173, proxies /api → :8000
npm run build        # tsc -b && vite build
npx tsc -b           # typecheck only
npx oxlint .         # lint only
```

`vite.config.ts` proxies `/api/*` to `http://127.0.0.1:8000` in dev — the backend must
be running separately (see `../backend/backend_reference.md` §1) for any API-calling screen to
work. There is no `.env` requirement except the optional `VITE_FAST_ANIM=1` (see §8).

---

## 2. File map

```
frontend/src/
├── main.tsx                        # entry point: StrictMode + BrowserRouter + App
├── App.tsx                         # all route definitions (react-router)
├── index.css                       # Tailwind import, no custom CSS
├── types/maze.ts                   # every shared TS type (data model + registry contract)
├── api/mazeApi.ts                  # fetch wrappers for the 2 backend endpoints
├── store/levelStore.ts             # Zustand store — the ONE source of truth for in-progress level
├── storage/fileAdapter.ts          # JSON export/import (download + parse+validate)
├── registry/
│   ├── mazeTypes.ts                 # MAZE_TYPES array + getMazeType() — the extensibility point
│   └── pickaxe/                     # the only registered maze type today
│       ├── starParams.ts            # PICKAXE_STAR_PARAMS (grid size/pickaxe range/min walls per star)
│       ├── wizardMaze.ts            # pure grid/path/wall helper functions (no React)
│       ├── CellRenderer.tsx         # presentational single-cell renderer (§7's visual spec)
│       ├── PickaxeGrid.tsx          # interactive grid shell (click/drag wiring around CellRenderer)
│       └── steps/                   # the 4 manual-wizard step components
│           ├── SizeAndPickaxesStep.tsx
│           ├── PlaceStartGoalStep.tsx
│           ├── DrawPathStep.tsx
│           └── AddWallsStep.tsx
├── components/                      # cross-page reusable UI (not maze-type-specific)
│   ├── QuestionSlotCard.tsx          # one slot tile in the Level Dashboard grid
│   ├── AddQuestionCard.tsx           # the trailing "+ Add question" tile
│   ├── WizardStepper.tsx             # clickable step-breadcrumb footer
│   └── RandomizeProgressModal.tsx    # the choreographed generate/reroll animation modal
└── pages/                           # one file per route (see §3)
    ├── LandingPage.tsx
    ├── MazeTypeHomePage.tsx
    ├── NewLevelPage.tsx
    ├── ModifyMazePage.tsx
    ├── LevelDashboardPage.tsx
    ├── QuestionEntryPage.tsx
    ├── ManualWizardPage.tsx
    └── RandomizeResultPage.tsx
```

---

## 3. Routing (`App.tsx`)

All routes are declared flat in `App.tsx`, no nested layouts:

| Path | Component | Purpose |
|---|---|---|
| `/` | `LandingPage` | Pick a maze type |
| `/:mazeTypeId` | `MazeTypeHomePage` | Create New vs Modify |
| `/:mazeTypeId/new` | `NewLevelPage` | Pick Kinder/Primary/Advanced, calls `startNewLevel` |
| `/:mazeTypeId/modify` | `ModifyMazePage` | Drag-drop a saved JSON, calls `loadLevel` |
| `/:mazeTypeId/dashboard` | `LevelDashboardPage` | The question grid + save/export |
| `/:mazeTypeId/dashboard/:questionId` | `QuestionEntryPage` | Create Myself vs Randomize choice (or auto-redirects — see §7.3) |
| `/:mazeTypeId/dashboard/:questionId/create` | `ManualWizardPage` | The 4-step manual wizard |
| `/:mazeTypeId/dashboard/:questionId/randomize` | `RandomizeResultPage` | Randomize result + reroll controls |

Every page-level component follows the same guard pattern at its top: resolve
`mazeType` via `getMazeType(mazeTypeId)`, `<Navigate to="/" />` if unknown; resolve
`current` from the store, `<Navigate>` to an earlier step if missing/mismatched. There
is no route-level auth or loading state — everything is synchronous client-side state
lookup.

---

## 4. Data model (`types/maze.ts`)

This file is the single source of truth for every shared shape — read it in full before
touching any page, store action, or registry file. Mirrors `development_plan.md` §4
exactly; comments in the file itself cross-reference each doc section. Key types:

- **`MazeData`** — `{ pickaxe_count, width, height, maze: string[] }`. The wire format,
  identical to the backend's `MazeDataIn`/`GenerateResponse` fields and to
  `pickaxe_maze/models.py`'s `MazeData`. `maze` is one comma-separated row per string
  (`rules.md`'s per-cell token format: `"s"`, `"g"`, `"."`, `"|"`, `"_"`, `"_|"`, or a
  prefixed variant like `"s|"`).
- **`MazeQuestion`** — one dashboard slot: `question_id`, `difficulty_star`, `status`
  (`empty|in_progress|randomized|complete`), `origin` (`manual|random|null`), `maze`,
  `solutionTrace`, `seeds`.
- **`LevelProgress`** — the save-file shape: `formatVersion: 1`, `mazeType`, `level`,
  `sheetName`/`year`/`month`/`week` (sheet metadata, added after the format's initial
  release — see `fileAdapter.ts`'s backward-compat defaulting, §6), `questions[]`,
  `createdAt`/`updatedAt`.
- **`CellState`** — the wizard's per-cell UI model: `kind` (`normal|start|goal`),
  `rightWall`/`bottomWall` (booleans, **not** the string tokens — see wall-ownership
  note below), `pathEdges` (`{u,r,l,d}` booleans for the Step-3 ideal-path overlay,
  independent of walls).
- **`WizardDraft`** — in-progress wizard state: `pickaxeCount`, `grid: CellState[][]`
  (row-major, `[y][x]`), `path: {x,y}[]` (ordered chain from whichever end the user
  started drawing from — the source of truth `pathEdges` is derived from, not the
  reverse).
- **`MazeTypeDefinition`** — the registry contract (§5): `id`, `label`,
  `difficultyConfig`, `starParams`, `WizardSteps` (ordered component array),
  `CellRenderer`.
- **`WizardStepProps`** — the uniform prop shape every step component receives
  (`star`, `starParams`, `draft`, `updateDraft`, `onValidate`, `validating`,
  `validation`, `onComplete`) — only the terminal step (`AddWallsStep`) actually uses
  the last four; this uniformity is what lets `WizardSteps` stay a plain array instead
  of each step having a bespoke prop contract.

**Wall ownership convention** (also documented inline in `wizardMaze.ts`): a right wall
is stored on the cell to its *left*; a bottom wall on the cell *above* it. Any cell,
including Start/Goal cells, can own a wall on its owned edges. This exactly mirrors
`pickaxe_maze/grid.py`'s `Cell` dataclass — the two implementations must never diverge
from this rule or `MazeData` round-tripping between frontend and backend will silently
scramble wall positions.

---

## 5. Maze-type registry (`registry/mazeTypes.ts` + `registry/pickaxe/`)

The extensibility seam described in `development_plan.md` §5. `MAZE_TYPES` is a flat
array of `MazeTypeDefinition` objects; `getMazeType(id)` does a linear find. Today it
contains exactly one entry, `pickaxeMazeDefinition`, assembled from:
- `PICKAXE_DIFFICULTY_CONFIG` — inlined directly in `mazeTypes.ts` (not imported from
  `starParams.ts`), ported verbatim from `difficulty_setting.md` / `pickaxe_maze/
  difficulty.py`'s `LEVEL_DISTRIBUTIONS`. Per-level ordered star lists, e.g.
  `kinder: [1, 2, 2, 3, 3, 4, 4, 5]`.
- `PICKAXE_STAR_PARAMS` (from `starParams.ts`) — per-star fixed grid size, pickaxe
  min/max, and minimum wall count, ported verbatim from `pickaxe_maze/difficulty.py`'s
  `STAR_PARAMS`.
- `WizardSteps: [SizeAndPickaxesStep, PlaceStartGoalStep, DrawPathStep, AddWallsStep]` —
  order matters, this literally drives the wizard's step sequence.
- `CellRenderer` — the shared presentational cell component.

**Important:** `PICKAXE_DIFFICULTY_CONFIG` and `PICKAXE_STAR_PARAMS` are manually
hand-copied from the Python source in `pickaxe_maze/difficulty.py` — there is no
build-time or runtime sync mechanism. If `difficulty_setting.md`'s numeric constants
ever change, **both** the Python file and these two TS structures must be updated
together, or frontend/backend will disagree about grid sizes, pickaxe ranges, or level
distributions. (Per standing memory `feedback_spec_conflicts`: ask before editing a
design doc's numeric constants even if the doc says "adjustable later" — this applies
doubly here since it's duplicated in two languages.)

To add a second maze type: create a new `registry/<type>/` folder with the same shape
(a `starParams`-equivalent, wizard step components, a `CellRenderer`), assemble a new
`MazeTypeDefinition`, and push it into `MAZE_TYPES`. No other file should need touching
— routing, the store, and `fileAdapter.ts` are all already generic over `mazeType`.

---

## 6. State & persistence

### `store/levelStore.ts` (Zustand)
Single store, single piece of state: `current: LevelProgress | null`. No slices, no
middleware (no persist/devtools). Every mutating action follows the same pattern:
early-return the unchanged state if `current` is null, otherwise spread-update
`questions[]` and bump `updatedAt`. Actions:
- `startNewLevel(mazeTypeId, level)` — builds a fresh `LevelProgress` with
  `buildEmptyQuestions()`, which reads `mazeType.difficultyConfig[level]` and assigns
  `question_id`s as `${level}-${star}star-${occurrence}` (occurrence = 1st/2nd/... slot
  at that star, per-level).
- `loadLevel(progress)` — replaces `current` wholesale (used by Modify Maze's import).
- `updateSheetInfo(patch)` — patches `sheetName`/`year`/`month`/`week`.
- `addQuestion(star)` — appends one `empty` slot past the starting distribution
  (`development_plan.md` §6.5's "+" tile).
- `setQuestionStar(questionId, star)` — **re-rating a slot resets it to a fresh empty
  question** (new `question_id` under the new star, `maze`/`status`/`origin` all wiped)
  — this is the "any edit invalidates" rule from the wizard applied to the dashboard.
- `removeQuestion(questionId)`.
- `markInProgress(questionId)` — only flips `empty → in_progress`, no-op otherwise.
- `completeQuestion(questionId, {maze, solutionTrace})` — sets `status: complete`,
  `origin: manual`.
- `setRandomized(questionId, {maze, solutionTrace, seeds})` — sets `status:
  randomized`, `origin: random`; used for **both** the first Randomize call and every
  reroll (a reroll on an already-`complete` question deliberately demotes it back to
  `randomized`, requiring the Complete button again).
- `completeRandomizedQuestion(questionId)` — `randomized → complete`, gated on
  `origin === 'random' && maze` truthy.

**question_id note:** the `occurrence` suffix is computed by counting *current* slots
at that star, not any global counter — removing and re-adding slots can produce
duplicate-looking IDs across a session's history (not a bug per se, just not a stable
long-term identifier — don't rely on `question_id` for anything beyond "unique among
currently-existing slots").

### `storage/fileAdapter.ts` (Phase 1 persistence)
Two functions, no class/interface — deliberately **not** yet the generic
`ProgressStorageAdapter` interface `development_plan.md` §2 sketches for later phases;
the comment at the top of the file explains why (only one implementation exists so far,
so there's nothing to prove a generic interface against yet — reshape when Phase 2
lands).
- `downloadLevelProgress(progress)` — serializes to pretty-printed JSON, triggers a
  browser download via an in-memory `Blob` + object URL + synthetic `<a click>`.
  Filename pattern: `${mazeType}-${level}-${year}-${month}-week${week}-${stamp}.json`.
- `parseLevelProgressFile(file)` — reads + `JSON.parse`s a `File`, validates
  `formatVersion === 1`, `mazeType` is a known registry id, `level` is a known
  `LevelName`, `questions` is an array — throws a user-facing `Error` message on any
  failure. **Backward-compat defaulting:** `sheetName`/`year`/`month`/`week` are
  defaulted (blank / current year / current month / `1`) if absent, so save files from
  before those fields existed still load. There is no `formatVersion: 2` handling yet —
  when the page-row redesign (`level_dashboard_pagination_spec.md`) ships, this
  function is where its migration logic will need to go.

There is no Phase 2 (`localStorage`) or Phase 3 (backend-persisted) adapter
implemented — only file-based save/load exists in code today.

---

## 7. Page-by-page notes (implementation quirks not obvious from the spec)

### 7.1 `LandingPage` / `MazeTypeHomePage` / `NewLevelPage` / `ModifyMazePage`
Straightforward — no state beyond local UI state (drag-over highlight, error message).
`ModifyMazePage` supports both drag-drop and a hidden `<input type=file>` triggered by a
button; both paths converge on the same `handleFile()`.

### 7.2 `LevelDashboardPage`
- Computes `completeCount`/`allComplete` inline on every render (no memoization —
  fine at this scale).
- `starOptions` = every star key in `mazeType.starParams`, numerically sorted — this is
  what populates every per-slot difficulty `<select>` and the "+ Add question" picker.
- Re-rating (`handleChangeStar`) and removing (`handleRemove`) both gate on
  `window.confirm(...)` **only if the slot already has a `maze`** — empty/in-progress
  slots change with no confirmation.
- "Save Progress" and "Export JSON" are **the same `downloadLevelProgress` call** —
  Export JSON is just gated on `allComplete` and has a disabled/tooltip state
  otherwise; there's no separate export format or endpoint.
- Export PDF button does not exist yet in this component at all (not even a disabled
  stub) — per `development_plan.md` §6.5/§7, it's deferred until the renderer exists.

### 7.3 `QuestionEntryPage`
Almost entirely a **routing decision tree**, not a real screen most of the time:
- `status === 'complete' && origin === 'manual'` → redirects straight to
  `.../create` (reopens the wizard, not this choice screen).
- `origin === 'random' && status is 'complete' or 'randomized'` → redirects to
  `.../randomize` (covers both a finished randomize and one mid-flight where the user
  hasn't clicked Complete yet).
- Only an `empty` or `in_progress`-with-`origin: null` question actually renders the
  Create Myself / Randomize choice UI.

### 7.4 `ManualWizardPage` — the wizard orchestrator
This is the most stateful page in the app. Owns:
- `stepIndex` (current step), `maxReachedStep` (furthest step ever reached — gates
  which steps are clickable in `WizardStepper`, and whether reopening a complete
  question can jump straight to any step).
- `draft: WizardDraft | null` — hydrated on mount via a `useEffect` keyed only on
  `question?.question_id` (explicitly *not* re-run on other prop changes, per its
  `eslint-disable-next-line react-hooks/exhaustive-deps` comment) — hydration source is
  `hydrateDraftFromQuestion()` if the question already has manual-origin maze data,
  else a fresh empty draft sized from `starParams`.
- `validation: ValidateResponse | null` — cleared on **every** `updateDraft` call (see
  `updateDraft`'s inline comment: "any edit invalidates a prior Validate result"). This
  is why editing any earlier step and coming back always requires re-clicking Validate.
- `stepStatus(index)` — drives both the Next-button gate and `WizardStepper`'s
  color-coding. Each step has bespoke completion logic (step 1 always "complete" once
  reached, step 2 needs both S and G placed, step 3 needs `isPathComplete()`, step 4 —
  the terminal step — is "wrong" only *after* a failed Validate attempt, not just
  because it's unvalidated yet).
- Reopening an already-`complete` question sets `maxReachedStep` to the last step
  index immediately (every step's data is presumed already valid), letting the stepper
  jump freely.

### 7.5 `RandomizeResultPage`
- On mount, if the question has no `maze` yet, immediately kicks off
  `activeRandomize` with `replayFrom: 1` (full initial generate) via `useState`'s lazy
  initializer — no separate "click to randomize" button, it's automatic.
- The three reroll buttons (`rerollSG`/`rerollPath`/`rerollWalls`) each set a new
  `activeRandomize` with a different `replayFrom` stage number (2/3/4) and a `run()`
  thunk that calls `generateMaze()` with a different subset of the *previous* result's
  seeds pinned — `rerollWalls` passes both `sgSeed` and `pathSeed` from
  `question.seeds`, `rerollPath` passes only `sgSeed`, `rerollSG` passes neither.
- `handleCancel()` only navigates away if the question still has no `maze` (i.e.
  cancelling the very first generate) — cancelling a reroll just closes the modal and
  keeps showing the previous result.
- `handleComplete()` calls `completeRandomizedQuestion`, which the store gates on
  `origin === 'random' && maze` truthy (see §6).

---

## 8. `RandomizeProgressModal` — the choreographed animation

Worth its own section since it's the least obvious file in the codebase. It does **not**
animate a placeholder/fake sequence and then swap in real data — it always fetches the
real `generateMaze()` result *first* (phase `waiting`), then replays that exact data
across four scripted phases (`sizeCount → placeSG → drawPath → scatterWalls → done`), so
what's on screen when the modal closes is guaranteed to match what persists.

- `replayFrom` (1-4) controls which phases are actually *animated* vs. instantly
  snapped to their final state — a reroll that didn't touch a given stage (e.g.
  "reroll walls" didn't touch S/G placement) shows that stage's final state immediately
  rather than re-playing it.
- Each phase has a hardcoded duration constant (`SIZE_COUNT_MS`, `DRAW_PATH_TOTAL_MS`,
  etc.), scaled by a `SPEED` multiplier that reads `import.meta.env.VITE_FAST_ANIM` —
  set `VITE_FAST_ANIM=1` to shrink every duration to ~5% for fast manual/Playwright
  click-throughs, without touching production timing.
- Uses a locally-scoped `cancelled` flag (not a `ref`) inside the `useEffect`, keyed on
  an `attempt` counter that only changes via the Retry button — this specifically
  guards against React StrictMode's dev-only double-invoke (or a fast double-click)
  letting a stale in-flight `run()` call write state after a newer invocation already
  started.
- On fetch failure: shows the error message with Cancel/Retry buttons; Retry just bumps
  `attempt` to re-trigger the effect from scratch.

---

## 9. Pickaxe-specific rendering & wizard mechanics

### `wizardMaze.ts` — pure helpers, no React
The algorithmic core of the manual wizard, deliberately framework-free so its logic is
testable/reasonable in isolation. Mirrors `pickaxe_maze/grid.py` closely enough that a
`WizardDraft` serialized via `serializeToMazeData()` round-trips through
`/api/maze/validate` exactly as the backend expects. Notable functions:
- `createEmptyGrid`/`createEmptyDraft` — fresh grid of `emptyCell()`s.
- `clearPathAndWalls` vs `clearWalls` — two different invalidation levels: the former
  wipes path *and* walls (used when S/G placement changes, since a path anchored to
  moved S/G is meaningless); the latter wipes only walls, keeping path and cell kind
  intact (used by "reroll wall placement", which should keep S/G and the ideal path
  fixed).
- `owningCell(a, b)` — the wall-ownership rule (see §4) as actual code: right walls
  belong to the left cell, bottom walls to the top cell.
- `isPathComplete(grid)` — validates the full Step-3 completion rule: no cell in a
  blink-invalid state (checked via `getInvalidPathCells`), S and G each have exactly one
  active edge, and walking the edge graph from S reaches G having visited every cell
  that has *any* active edge (catches disconnected fragments).
- `serializeToMazeData(draft)` / `parseMazeDataToGrid(maze)` — the two directions of
  the wire-format ↔ `WizardGrid` conversion. Cell token format:
  prefix (`s`/`g`/none) + wall suffix (`|`/`_`/`_|`/none, with a lone empty cell
  serializing as literal `.`).
- `parseTrace(trace, width)` — parses the backend's `solutionTrace` string format
  (`"S,1 -> 2 -> 3(break _ wall) -> ... -> 9"`, from `validator_design.md` §2) back into
  an ordered `Point[]` path, using 1-based cell-index → `(x,y)` conversion
  (`cellIndexToPoint`). This is how a completed/randomized question's path can be
  redrawn on reopen without persisting the path separately from `MazeData` +
  `solutionTrace`.

### `CellRenderer.tsx` / `PickaxeGrid.tsx` — visual + interaction split
`CellRenderer` is **pure presentation** — takes only a `CellState`, no callbacks, no
neighbor lookups (every wall it draws is already cell-local per the ownership rule). It
implements `development_plan.md` §7's exact visual spec: dotted per-cell border, double
outer border (drawn by `PickaxeGrid`, not `CellRenderer`), centered S/G letter, wall
rectangles at fixed percentage geometry (`RIGHT_WALL_RECT_CLASS`/
`BOTTOM_WALL_RECT_CLASS`, exported so `PickaxeGrid` can lay invisible click targets
exactly on top of them), and the path-edge accent-colored line segments.

`PickaxeGrid` wraps a grid of `CellRenderer`s with mode-dependent interaction
(`place-sg | draw-path | place-walls | view`):
- `place-sg`/`draw-path` modes wire whole-cell `onClick`/`onPointerDown`/
  `onPointerEnter`.
- `place-walls` mode instead overlays transparent `<button>` hit-targets exactly on
  each cell's right/bottom wall rectangle position (`z-10`, since the rectangle
  straddles the shared edge into the neighboring cell's box and would otherwise have
  its pointer events intercepted by that neighbor's own later-painted border).
- `view` mode (used by dashboard slot previews, the Randomize result screen, and the
  progress modal) has no interaction wiring at all.

### Wizard steps (`registry/pickaxe/steps/*.tsx`)
Each corresponds 1:1 to `development_plan.md` §6.7.1-6.7.4 and receives the same
`WizardStepProps`. Only `AddWallsStep` uses `onValidate`/`validating`/`validation`/
`onComplete` — the other three ignore those props entirely (they're always present on
the type for uniformity, per §4's note on why `WizardSteps` can stay a plain array).
- `SizeAndPickaxesStep` — read-only display unless `pickaxeMin !== pickaxeMax` (stars
  6-8 today), in which case a +/- stepper bounded to that range.
- `PlaceStartGoalStep` — click empty cell → places S then G in that order; clicking an
  existing S/G removes it; changing S/G calls `clearPathAndWalls` since a stale path
  would reference removed anchor points.
- `DrawPathStep` — implements both **drag** (`onPointerDown` + `onPointerEnter` while a
  local `dragging` flag is set) and **tap/click** (`onCellClick` calling the same
  `attemptStep`) through one shared `attemptStep(p)` function, so both input methods
  produce identical path state. Retrace-to-shorten (clicking/dragging onto the
  immediate predecessor) is handled as a special case inside `attemptStep` before the
  normal adjacency/visited checks.
- `AddWallsStep` — toggling any edge just calls `toggleWall`; whether it counts toward
  "path walls" or "total walls" is derived, not tracked separately, by checking
  membership in `pathEdgeList(draft.path)`. Validate button gates on both counters
  matching (`pathWalls === pickaxeCount` and `totalWalls >= minWalls`); Complete button
  only appears once `validation.solutionCount === 1`.

---

## 10. Gotchas / things that look like bugs but aren't

- **`useEffect` deps arrays with `eslint-disable-next-line`** appear twice
  (`ManualWizardPage`, `RandomizeProgressModal`) — both are deliberate: re-running on
  every prop change would re-hydrate/re-fetch on renders that shouldn't trigger it.
  Don't "fix" these by adding the missing deps without re-reading the adjacent comment.
- **No error boundary anywhere** — an unhandled exception in any page will produce a
  blank white screen with only a console error, no user-facing fallback UI.
- **No loading spinners for API calls** outside `RandomizeProgressModal` — `handleValidate`
  in `ManualWizardPage` only disables the Validate button (`validating` state) while
  in flight; there's no global loading indicator.
- **`window.confirm`** is used directly for the two destructive dashboard actions
  (re-rate/remove a slot with an existing maze) — no custom modal component exists for
  confirmations elsewhere in the app.
- **PDF export button does not exist in the code at all**, not even disabled — don't
  search for a hidden/gated PDF button expecting to just "enable" it; it needs to be
  built from scratch per `pdf_export_spec.md` when that work starts.
