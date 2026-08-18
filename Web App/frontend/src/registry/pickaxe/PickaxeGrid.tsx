import type { WizardGrid } from '../../types/maze'
import { pointKey, wallBetween, type Point } from './wizardMaze'
import CellRenderer, { BOTTOM_WALL_RECT_CLASS, RIGHT_WALL_RECT_CLASS } from './CellRenderer'

export type PickaxeGridMode = 'place-sg' | 'draw-path' | 'place-walls' | 'view'

export interface PickaxeGridProps {
  grid: WizardGrid
  mode: PickaxeGridMode
  invalidCells?: Set<string>
  onCellClick?: (p: Point) => void
  onCellPointerDown?: (p: Point) => void
  onCellPointerEnter?: (p: Point) => void
  onPointerUp?: () => void
  onEdgeToggle?: (a: Point, b: Point) => void
}

// Interaction + layout shell around the shared CellRenderer (§7): the outer
// double-line border, per-cell click/drag wiring, the invalid-cell blink
// overlay, and (in place-walls mode only) transparent wall-toggle hit-targets
// laid exactly over CellRenderer's own wall rectangles.
export default function PickaxeGrid({
  grid,
  mode,
  invalidCells,
  onCellClick,
  onCellPointerDown,
  onCellPointerEnter,
  onPointerUp,
  onEdgeToggle,
}: PickaxeGridProps) {
  const height = grid.length
  const width = grid[0]?.length ?? 0

  return (
    <div
      className="mx-auto grid aspect-square w-full max-w-md select-none border-4 border-double border-slate-700"
      style={{ gridTemplateColumns: `repeat(${width}, 1fr)`, gridTemplateRows: `repeat(${height}, 1fr)` }}
      onPointerUp={onPointerUp}
      onPointerLeave={mode === 'draw-path' ? onPointerUp : undefined}
    >
      {grid.map((row, y) =>
        row.map((cell, x) => {
          const point = { x, y }
          const invalid = invalidCells?.has(pointKey(point)) ?? false
          const rightEdge = x + 1 < width ? { a: point, b: { x: x + 1, y } } : null
          const bottomEdge = y + 1 < height ? { a: point, b: { x, y: y + 1 } } : null
          const rightClickable = mode === 'place-walls' && !!rightEdge && !!onEdgeToggle
          const bottomClickable = mode === 'place-walls' && !!bottomEdge && !!onEdgeToggle

          return (
            <div
              key={pointKey(point)}
              data-x={x}
              data-y={y}
              data-cell-kind={cell.kind}
              className={`relative ${mode === 'place-sg' || mode === 'draw-path' ? 'cursor-pointer' : ''}`}
              onClick={mode === 'place-sg' || mode === 'draw-path' ? () => onCellClick?.(point) : undefined}
              onPointerDown={mode === 'draw-path' ? () => onCellPointerDown?.(point) : undefined}
              onPointerEnter={mode === 'draw-path' ? () => onCellPointerEnter?.(point) : undefined}
            >
              <CellRenderer cell={cell} />

              {invalid && <div className="pointer-events-none absolute inset-0 animate-pulse bg-red-200/70" />}

              {rightClickable &&
                (() => {
                  const present = wallBetween(grid, rightEdge!.a, rightEdge!.b) !== null
                  return (
                    <button
                      type="button"
                      data-edge="right"
                      data-wall-present={present}
                      onClick={(e) => {
                        e.stopPropagation()
                        onEdgeToggle?.(rightEdge!.a, rightEdge!.b)
                      }}
                      className={`${RIGHT_WALL_RECT_CLASS} cursor-pointer ${
                        present ? 'bg-transparent hover:bg-slate-600/40' : 'bg-slate-200 hover:bg-slate-400'
                      }`}
                    />
                  )
                })()}
              {bottomClickable &&
                (() => {
                  const present = wallBetween(grid, bottomEdge!.a, bottomEdge!.b) !== null
                  return (
                    <button
                      type="button"
                      data-edge="bottom"
                      data-wall-present={present}
                      onClick={(e) => {
                        e.stopPropagation()
                        onEdgeToggle?.(bottomEdge!.a, bottomEdge!.b)
                      }}
                      className={`${BOTTOM_WALL_RECT_CLASS} cursor-pointer ${
                        present ? 'bg-transparent hover:bg-slate-600/40' : 'bg-slate-200 hover:bg-slate-400'
                      }`}
                    />
                  )
                })()}
            </div>
          )
        }),
      )}
    </div>
  )
}
