// Pure helpers for the manual wizard's in-progress maze state. Mirrors the
// parsing/serialization/ownership rules in
// pickaxe-maze-creation/pickaxe_maze/grid.py (rules.md §7) so a maze built
// here round-trips through /api/maze/validate exactly as the backend expects.

import type { CellState, MazeData, MazeQuestion, PathEdges, WizardDraft, WizardGrid } from '../../types/maze'

export type Point = { x: number; y: number }
type Direction = 'u' | 'd' | 'l' | 'r'

const DIRS: Record<Direction, { dx: number; dy: number; opposite: Direction }> = {
  u: { dx: 0, dy: -1, opposite: 'd' },
  d: { dx: 0, dy: 1, opposite: 'u' },
  l: { dx: -1, dy: 0, opposite: 'r' },
  r: { dx: 1, dy: 0, opposite: 'l' },
}

function emptyEdges(): PathEdges {
  return { u: false, r: false, l: false, d: false }
}

function emptyCell(): CellState {
  return { kind: 'normal', rightWall: false, bottomWall: false, pathEdges: emptyEdges() }
}

export function createEmptyGrid(width: number, height: number): WizardGrid {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => emptyCell()))
}

export function createEmptyDraft(width: number, height: number, pickaxeCount: number): WizardDraft {
  return { pickaxeCount, grid: createEmptyGrid(width, height), path: [] }
}

// Clears path edges and walls but keeps cell kind (S/G placement) — used
// whenever a later step's data would otherwise go stale, e.g. redrawing the
// path invalidates Step 4's wall placements.
export function clearPathAndWalls(grid: WizardGrid): WizardGrid {
  return grid.map((row) =>
    row.map((cell) => ({ ...cell, rightWall: false, bottomWall: false, pathEdges: emptyEdges() })),
  )
}

// Clears only walls, keeping cell kind and path edges intact — used by
// RandomizeProgressModal's "reroll wall placement" replay, which keeps S/G
// and the ideal path fixed and only re-animates/re-decides walls.
export function clearWalls(grid: WizardGrid): WizardGrid {
  return grid.map((row) => row.map((cell) => ({ ...cell, rightWall: false, bottomWall: false })))
}

export function setCellKind(grid: WizardGrid, p: Point, kind: CellState['kind']): WizardGrid {
  const next = cloneGrid(grid)
  next[p.y][p.x].kind = kind
  return next
}

function cloneGrid(grid: WizardGrid): WizardGrid {
  return grid.map((row) => row.map((cell) => ({ ...cell, pathEdges: { ...cell.pathEdges } })))
}

export function pointKey(p: Point): string {
  return `${p.x},${p.y}`
}

export function findCell(grid: WizardGrid, kind: 'start' | 'goal'): Point | null {
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x].kind === kind) return { x, y }
    }
  }
  return null
}

function isAdjacent(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1
}

function directionBetween(a: Point, b: Point): Direction {
  const dx = b.x - a.x
  const dy = b.y - a.y
  if (dx === 1 && dy === 0) return 'r'
  if (dx === -1 && dy === 0) return 'l'
  if (dy === 1 && dx === 0) return 'd'
  if (dy === -1 && dx === 0) return 'u'
  throw new Error(`(${a.x},${a.y}) and (${b.x},${b.y}) are not orthogonally adjacent`)
}

export function isInBounds(grid: WizardGrid, p: Point): boolean {
  return p.y >= 0 && p.y < grid.length && p.x >= 0 && p.x < (grid[0]?.length ?? 0)
}

// --- Wall ownership (grid.py's set_wall / wall_between) ---
// Right walls are owned by the cell to the left, bottom walls by the cell
// above — this just says which cell's flags store a given edge's wall. Any
// cell, including start/goal, can own a wall (rules.md §7: "s|", "g_", etc).

function owningCell(a: Point, b: Point): { at: Point; edgeChar: '|' | '_' } {
  const dir = directionBetween(a, b)
  if (dir === 'r') return { at: a, edgeChar: '|' }
  if (dir === 'l') return { at: b, edgeChar: '|' }
  if (dir === 'd') return { at: a, edgeChar: '_' }
  return { at: b, edgeChar: '_' } // 'u'
}

export function wallBetween(grid: WizardGrid, a: Point, b: Point): '|' | '_' | null {
  const { at, edgeChar } = owningCell(a, b)
  const cell = grid[at.y][at.x]
  const present = edgeChar === '|' ? cell.rightWall : cell.bottomWall
  return present ? edgeChar : null
}

export function setWall(grid: WizardGrid, a: Point, b: Point, present: boolean): WizardGrid {
  const { at, edgeChar } = owningCell(a, b)
  const next = cloneGrid(grid)
  const cell = next[at.y][at.x]
  if (edgeChar === '|') cell.rightWall = present
  else cell.bottomWall = present
  return next
}

export function toggleWall(grid: WizardGrid, a: Point, b: Point): WizardGrid {
  return setWall(grid, a, b, wallBetween(grid, a, b) === null)
}

export function pathEdgeList(path: Point[]): Array<{ a: Point; b: Point }> {
  const edges: Array<{ a: Point; b: Point }> = []
  for (let i = 0; i < path.length - 1; i++) edges.push({ a: path[i], b: path[i + 1] })
  return edges
}

export function countPathWalls(grid: WizardGrid, path: Point[]): number {
  return pathEdgeList(path).filter(({ a, b }) => wallBetween(grid, a, b) !== null).length
}

// Every wall edge actually present on a grid — used by RandomizeProgressModal
// to reveal a generated maze's real walls one by one instead of animating
// placeholder ones.
export function listWallEdges(grid: WizardGrid): Array<{ a: Point; b: Point }> {
  const edges: Array<{ a: Point; b: Point }> = []
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      const cell = grid[y][x]
      if (cell.rightWall) edges.push({ a: { x, y }, b: { x: x + 1, y } })
      if (cell.bottomWall) edges.push({ a: { x, y }, b: { x, y: y + 1 } })
    }
  }
  return edges
}

export function countTotalWalls(grid: WizardGrid): number {
  let count = 0
  for (const row of grid) {
    for (const cell of row) {
      if (cell.rightWall) count++
      if (cell.bottomWall) count++
    }
  }
  return count
}

// --- Path edges (§6.7.3) ---

function edgeCount(edges: PathEdges): number {
  return (edges.u ? 1 : 0) + (edges.r ? 1 : 0) + (edges.l ? 1 : 0) + (edges.d ? 1 : 0)
}

export function setPathEdge(grid: WizardGrid, a: Point, b: Point, active: boolean): WizardGrid {
  const dir = directionBetween(a, b)
  const next = cloneGrid(grid)
  next[a.y][a.x].pathEdges[dir] = active
  next[b.y][b.x].pathEdges[DIRS[dir].opposite] = active
  return next
}

// Rebuilds every cell's pathEdges from an ordered path sequence — clears
// stale edges first so this can be called after a retrace/undo too.
export function applyPathToGrid(grid: WizardGrid, path: Point[]): WizardGrid {
  let next = cloneGrid(grid)
  for (const row of next) for (const cell of row) cell.pathEdges = emptyEdges()
  for (const { a, b } of pathEdgeList(path)) next = setPathEdge(next, a, b, true)
  return next
}

// Cells that should blink red per §6.7.3: a non-S/G cell with exactly 1
// active edge, or any cell with 3+ active edges.
export function getInvalidPathCells(grid: WizardGrid): Set<string> {
  const invalid = new Set<string>()
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      const cell = grid[y][x]
      const count = edgeCount(cell.pathEdges)
      if (count >= 3 || (cell.kind === 'normal' && count === 1)) invalid.add(pointKey({ x, y }))
    }
  }
  return invalid
}

function countCellsOnPath(grid: WizardGrid): number {
  let count = 0
  for (const row of grid) for (const cell of row) if (edgeCount(cell.pathEdges) > 0) count++
  return count
}

function nextPathNeighbor(grid: WizardGrid, current: Point, prev: Point | null): Point | null {
  const cell = grid[current.y][current.x]
  const candidates: Point[] = []
  for (const dir of Object.keys(DIRS) as Direction[]) {
    if (!cell.pathEdges[dir]) continue
    const { dx, dy } = DIRS[dir]
    const neighbor = { x: current.x + dx, y: current.y + dy }
    if (!isInBounds(grid, neighbor)) continue
    if (prev && neighbor.x === prev.x && neighbor.y === prev.y) continue
    candidates.push(neighbor)
  }
  return candidates.length === 1 ? candidates[0] : null
}

// The full path must be a single continuous S->G chain with no disconnected
// fragments and no cell in a blink-invalid state (§6.7.3's Next-enable rule).
export function isPathComplete(grid: WizardGrid): boolean {
  if (getInvalidPathCells(grid).size > 0) return false
  const start = findCell(grid, 'start')
  const goal = findCell(grid, 'goal')
  if (!start || !goal) return false
  if (edgeCount(grid[start.y][start.x].pathEdges) !== 1) return false
  if (edgeCount(grid[goal.y][goal.x].pathEdges) !== 1) return false

  const visited = new Set<string>([pointKey(start)])
  let current = start
  let prev: Point | null = null
  while (!(current.x === goal.x && current.y === goal.y)) {
    const next = nextPathNeighbor(grid, current, prev)
    if (!next || visited.has(pointKey(next))) return false
    visited.add(pointKey(next))
    prev = current
    current = next
  }
  return visited.size === countCellsOnPath(grid)
}

// --- Serialization / hydration (rules.md §7) ---

function cellToken(cell: CellState): string {
  const prefix = cell.kind === 'start' ? 's' : cell.kind === 'goal' ? 'g' : ''
  let suffix: string
  if (cell.rightWall && cell.bottomWall) suffix = '_|'
  else if (cell.rightWall) suffix = '|'
  else if (cell.bottomWall) suffix = '_'
  else suffix = prefix ? '' : '.'
  return prefix + suffix
}

export function serializeToMazeData(draft: WizardDraft): MazeData {
  const height = draft.grid.length
  const width = draft.grid[0]?.length ?? 0
  return {
    pickaxe_count: draft.pickaxeCount,
    width,
    height,
    maze: draft.grid.map((row) => row.map(cellToken).join(',')),
  }
}

function parseMazeDataToGrid(maze: MazeData): WizardGrid {
  return maze.maze.map((row) =>
    row.split(',').map((raw): CellState => {
      const token = raw.trim()
      const cell = emptyCell()
      let wallPart = token
      if (token.startsWith('s')) {
        cell.kind = 'start'
        wallPart = token.slice(1)
      } else if (token.startsWith('g')) {
        cell.kind = 'goal'
        wallPart = token.slice(1)
      } else if (token === '.') {
        wallPart = ''
      }
      if (wallPart === '|') cell.rightWall = true
      else if (wallPart === '_') cell.bottomWall = true
      else if (wallPart === '_|') {
        cell.rightWall = true
        cell.bottomWall = true
      }
      return cell
    }),
  )
}

function cellIndexToPoint(index: number, width: number): Point {
  const zeroBased = index - 1
  return { x: zeroBased % width, y: Math.floor(zeroBased / width) }
}

// Parses "S,1 -> 2 -> 3(break _ wall) -> ... -> 9" (validator_design.md §2)
// back into the ordered chain of visited cells.
function parseTrace(trace: string, width: number): Point[] {
  return trace.split('->').map((token) => {
    const match = token.match(/(\d+)/)
    if (!match) throw new Error(`could not parse trace token: ${token}`)
    return cellIndexToPoint(parseInt(match[1], 10), width)
  })
}

// A validated maze has exactly one solution (rules.md §6), so its persisted
// solutionTrace IS the Step 3 ideal path — reopening a complete manual
// question (or a randomized one, see RandomizeResultPage) needs no extra
// persisted state beyond MazeData + solutionTrace.
export function hydrateDraftFromMazeData(maze: MazeData, solutionTrace: string | null): WizardDraft {
  const grid = parseMazeDataToGrid(maze)
  const path = solutionTrace ? parseTrace(solutionTrace, maze.width) : []
  return { pickaxeCount: maze.pickaxe_count, grid: applyPathToGrid(grid, path), path }
}

export function hydrateDraftFromQuestion(question: MazeQuestion): WizardDraft {
  if (!question.maze) throw new Error('cannot hydrate a wizard draft from a question with no maze')
  return hydrateDraftFromMazeData(question.maze, question.solutionTrace)
}

export function isAdjacentPoint(a: Point, b: Point): boolean {
  return isAdjacent(a, b)
}
