import { useState } from 'react'
import type { WizardStepProps } from '../../../types/maze'
import PickaxeGrid from '../PickaxeGrid'
import { applyPathToGrid, getInvalidPathCells, isAdjacentPoint, isPathComplete, pointKey, type Point } from '../wizardMaze'

// §6.7.3 — drag and tap/click both drive the same underlying path state:
// starting a fresh path requires pointer-down/click on S or G; extending
// requires the target cell be orthogonally adjacent to the current open end
// and not already visited; clicking/dragging back onto the immediate
// predecessor undoes the last segment (retrace-to-shorten).
export default function DrawPathStep({ draft, updateDraft }: WizardStepProps) {
  const [dragging, setDragging] = useState(false)

  function attemptStep(p: Point) {
    updateDraft((d) => {
      const path = d.path

      if (path.length === 0) {
        const cell = d.grid[p.y][p.x]
        if (cell.kind !== 'start' && cell.kind !== 'goal') return d
        return { ...d, path: [p] }
      }

      const openEnd = path[path.length - 1]
      if (pointKey(p) === pointKey(openEnd)) return d

      const predecessor = path.length >= 2 ? path[path.length - 2] : null
      if (predecessor && pointKey(predecessor) === pointKey(p)) {
        const newPath = path.slice(0, -1)
        return { pickaxeCount: d.pickaxeCount, grid: applyPathToGrid(d.grid, newPath), path: newPath }
      }

      const alreadyVisited = path.some((q) => pointKey(q) === pointKey(p))
      if (alreadyVisited || !isAdjacentPoint(openEnd, p)) return d

      const newPath = [...path, p]
      return { pickaxeCount: d.pickaxeCount, grid: applyPathToGrid(d.grid, newPath), path: newPath }
    })
  }

  function handlePointerDown(p: Point) {
    const path = draft.path
    const isValidStart = path.length === 0 || pointKey(path[path.length - 1]) === pointKey(p)
    if (!isValidStart) return
    setDragging(true)
    attemptStep(p)
  }

  const invalidCells = getInvalidPathCells(draft.grid)
  const complete = isPathComplete(draft.grid)

  return (
    <div className="space-y-4">
      <p className="text-slate-600">
        Drag from S (or G) through the maze to draw the ideal path, or tap adjacent cells one at
        a time. Tap/drag back onto the previous cell to undo a step.
      </p>
      <PickaxeGrid
        grid={draft.grid}
        mode="draw-path"
        invalidCells={invalidCells}
        onCellClick={attemptStep}
        onCellPointerDown={handlePointerDown}
        onCellPointerEnter={(p) => dragging && attemptStep(p)}
        onPointerUp={() => setDragging(false)}
      />
      <p className={`text-sm ${complete ? 'text-emerald-700' : 'text-slate-500'}`}>
        {complete
          ? 'Path complete.'
          : invalidCells.size > 0
            ? 'Fix the highlighted cells before continuing.'
            : 'Path not complete yet.'}
      </p>
    </div>
  )
}
