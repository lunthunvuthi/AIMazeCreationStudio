import type { CellState } from '../../types/maze'

// §7's exact wall-rectangle geometry, exported so PickaxeGrid's interactive
// place-walls hit-targets can share the identical rect — visual and click
// target never drift apart.
// z-10: the rect straddles the shared edge, spilling half its width/height into
// the neighboring cell's own box — without an explicit stacking order, that
// neighbor's later-painted border/background would intercept both paint and
// pointer events on the overlapping half.
export const RIGHT_WALL_RECT_CLASS = 'absolute right-[-2.5%] top-[10%] z-10 h-4/5 w-[5%] rounded bg-slate-400'
export const BOTTOM_WALL_RECT_CLASS = 'absolute bottom-[-2.5%] left-[10%] z-10 h-[5%] w-4/5 rounded bg-slate-400'

// The shared visual cell renderer (development_plan.md §7) — dotted cell
// border, centered S/G, the path-line overlay, and light-gray wall
// rectangles. Purely presentational: matches MazeTypeDefinition['CellRenderer']
// exactly, so it takes only the cell itself, no callbacks or neighbor lookups
// (wall ownership is already cell-local, see CellState's doc comment).
export default function CellRenderer({ cell }: { cell: CellState }) {
  return (
    <div className="relative h-full w-full border border-dotted border-slate-300 bg-white">
      {cell.kind !== 'normal' && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-lg font-bold text-slate-800">
          {cell.kind === 'start' ? 'S' : 'G'}
        </span>
      )}

      {cell.pathEdges.u && (
        <div className="pointer-events-none absolute left-[40%] top-0 h-1/2 w-1/5 bg-indigo-400" />
      )}
      {cell.pathEdges.d && (
        <div className="pointer-events-none absolute left-[40%] top-1/2 h-1/2 w-1/5 bg-indigo-400" />
      )}
      {cell.pathEdges.l && (
        <div className="pointer-events-none absolute left-0 top-[40%] h-1/5 w-1/2 bg-indigo-400" />
      )}
      {cell.pathEdges.r && (
        <div className="pointer-events-none absolute left-1/2 top-[40%] h-1/5 w-1/2 bg-indigo-400" />
      )}

      {cell.rightWall && <div data-edge="right" data-wall-present="true" className={RIGHT_WALL_RECT_CLASS} />}
      {cell.bottomWall && <div data-edge="bottom" data-wall-present="true" className={BOTTOM_WALL_RECT_CLASS} />}
    </div>
  )
}
