// Shared data model from development_plan.md §4. Kept in sync with the
// backend's Pydantic schemas (Web App/backend/maze_api/schemas.py) and
// pickaxe_maze's MazeData (pickaxe-maze-creation/pickaxe_maze/models.py).

export type LevelName = 'kinder' | 'primary' | 'advanced'

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

export type QuestionStatus = 'empty' | 'in_progress' | 'randomized' | 'complete'

export type QuestionOrigin = 'manual' | 'random' | null

// §4.1 — a single maze, matches rules.md verbatim.
export interface MazeData {
  pickaxe_count: number
  width: number
  height: number
  maze: string[]
}

// §4.2 — one slot in a level.
export interface MazeQuestion {
  question_id: string // e.g. "kinder-3star-1"
  difficulty_star: number // 1-8
  status: QuestionStatus
  origin: QuestionOrigin
  maze: MazeData | null // null while status === "empty"
  solutionTrace: string | null
  seeds: {
    // only populated for randomized questions, enables reroll
    sgSeed: number | null
    pathSeed: number | null
    wallSeed: number | null
  }
}

// level_dashboard_pagination_spec.md §2.1 — one row of the exported PDF,
// holding 1-2 questions. Every row is a question page, pages[0] included: it
// was a locked cover/tutorial row until 2026-08-21, when the cover's tutorial
// became a fixed constant that consumes no question.
// `isBonus` (§4.4, added 2026-08-19) is a manual per-row flag controlling
// whether that page's number box renders the laurel-wreath design
// (pdf_design_spec.md §7) instead of the plain rectangle.
export interface PageRow {
  pageId: string
  questions: MazeQuestion[]
  isBonus: boolean
}

// §4.3 — the file that gets saved/loaded.
//
// formatVersion 2 (level_dashboard_pagination_spec.md §2.2, 2026-08-19)
// replaced a flat `questions[]` with `pages: PageRow[]` so the Level
// Dashboard authors page/row structure directly rather than a renderer
// guessing it after the fact.
//
// formatVersion 3 (2026-08-28) added `sheetId`. See storage/fileAdapter.ts for
// both migrations — they are additive, so every older save file still loads.
export interface LevelProgress {
  formatVersion: 3
  // Stable identity for this sheet, minted once and never changed by any edit.
  //
  // Added ahead of the storage work in storage_spike.md §4, which found that
  // nothing could name a sheet: the nearest thing was
  // `(level, year, month, week)`, which is editable from the dashboard AND
  // legitimately non-unique — two teachers both authoring "Primary, Sep,
  // week 1" is the point of a publish-and-choose flow, not a collision to
  // prevent. Without an id, "update the existing sheet" versus "create a
  // second one" is undecidable for Drive, for a backend, and even for a
  // multi-sheet local library.
  //
  // Deliberately opaque and never shown to a user: `sheetName` is the human
  // label and stays freely editable. Nothing derives a filename, a page number
  // or a sort order from this — it is only ever compared for equality.
  sheetId: string
  mazeType: string // registry key, see §5
  level: LevelName
  sheetName: string // user-editable label, e.g. "Kinder Week 2"
  year: number
  month: number // 1-12, see MONTH_NAMES
  week: number
  pages: PageRow[]
  createdAt: string
  updatedAt: string
}

// Flattens pages[] back into question order — for anything that only cares
// about "all questions on this sheet" (completion counts, occurrence
// numbering, question lookup by id) rather than page/row structure.
export function flattenPages(pages: PageRow[]): MazeQuestion[] {
  return pages.flatMap((page) => page.questions)
}

// "Is there anything here a user would mind losing?" — the test before an
// action replaces the store's sheet (starting a new level, importing a file).
// A freshly seeded level is all-`empty` slots and worth no warning; one
// authored maze is. Deliberately ignores sheetName/month/week: those are a
// few seconds of retyping, and warning about them would make the prompt
// routine enough to be clicked through.
export function hasAuthoredWork(progress: LevelProgress): boolean {
  return flattenPages(progress.pages).some((q) => q.maze !== null)
}

export type CellKind = 'normal' | 'start' | 'goal'

// §6.7.3 — "line segment active" flags for the ideal path, independent of walls.
export interface PathEdges {
  u: boolean
  r: boolean
  l: boolean
  d: boolean
}

// Per-cell model shared by the wizard and (eventually, step 5) the visual
// renderer. Mirrors pickaxe_maze/grid.py's Cell dataclass: a right wall is
// owned by the cell to its left, a bottom wall by the cell above it, and an
// "s"/"g" token has no room to also encode a wall on its owned edges.
export interface CellState {
  kind: CellKind
  rightWall: boolean
  bottomWall: boolean
  pathEdges: PathEdges
}

export type WizardGrid = CellState[][] // [y][x], row-major — matches MazeData.maze

// Ported from pickaxe_maze/difficulty.py's StarParams/STAR_PARAMS.
export interface StarParams {
  star: number
  width: number
  height: number
  pickaxeMin: number
  pickaxeMax: number
  minWalls: number
}

// In-progress state for the manual wizard (§6.7). `path` is the ordered chain
// of visited cells from whichever endpoint (S or G) the user started drawing
// from to the current open end — the source of truth that `grid[y][x].pathEdges`
// is derived from.
export interface WizardDraft {
  pickaxeCount: number
  grid: WizardGrid
  path: { x: number; y: number }[]
}

export interface ValidateResponse {
  solutionCount: number
  trace: string | null
  diagnostic: string | null
}

// Props every wizard step component receives (§6.7.1-6.7.4). Uniform across
// steps so `MazeTypeDefinition.WizardSteps` can stay a plain ordered array —
// only the terminal step (Add Walls) uses onValidate/validation/onComplete.
export interface WizardStepProps {
  star: number
  starParams: StarParams
  draft: WizardDraft
  updateDraft: (updater: (draft: WizardDraft) => WizardDraft) => void
  onValidate: () => Promise<void>
  validating: boolean
  validation: ValidateResponse | null
  onComplete: () => void
}

// §5 — the maze-type registry entry.
export interface MazeTypeDefinition {
  id: string // "pickaxe"
  label: string // "PickAxe Maze"
  difficultyConfig: Record<LevelName, number[]> // star per question slot, per level
  starParams: Record<number, StarParams> // grid size / pickaxe range / min walls per star
  WizardSteps: React.ComponentType<WizardStepProps>[] // ordered step components for manual creation
  CellRenderer: React.ComponentType<{ cell: CellState }>
}
