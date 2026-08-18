import type { WizardStepProps } from '../../../types/maze'
import PickaxeGrid from '../PickaxeGrid'
import { clearPathAndWalls, findCell, type Point } from '../wizardMaze'

// §6.7.2 — no column restriction in manual mode (that only applies to the
// Randomize pipeline). Click an empty cell to place S then G; click an
// existing S/G to remove it.
export default function PlaceStartGoalStep({ draft, updateDraft }: WizardStepProps) {
  const start = findCell(draft.grid, 'start')
  const goal = findCell(draft.grid, 'goal')

  function handleCellClick(p: Point) {
    updateDraft((d) => {
      const grid = d.grid.map((row) => row.map((c) => ({ ...c })))
      const cell = grid[p.y][p.x]

      if (cell.kind === 'start' || cell.kind === 'goal') {
        cell.kind = 'normal'
      } else {
        const hasStart = findCell(grid, 'start')
        const hasGoal = findCell(grid, 'goal')
        if (hasStart && hasGoal) return d // both already placed — clicking empty cells does nothing
        cell.kind = hasStart ? 'goal' : 'start'
      }

      // Changing S/G invalidates any path/walls drawn against the old placement.
      return { pickaxeCount: d.pickaxeCount, grid: clearPathAndWalls(grid), path: [] }
    })
  }

  return (
    <div className="space-y-4">
      <p className="text-slate-600">
        Click an empty cell to place <span className="font-semibold">S</span>, then click another
        empty cell to place <span className="font-semibold">G</span>. Click S or G again to remove
        it.
      </p>
      <PickaxeGrid grid={draft.grid} mode="place-sg" onCellClick={handleCellClick} />
      <p className="text-sm text-slate-500">
        {start ? 'Start placed.' : 'Start not placed yet.'} {goal ? 'Goal placed.' : 'Goal not placed yet.'}
      </p>
    </div>
  )
}
