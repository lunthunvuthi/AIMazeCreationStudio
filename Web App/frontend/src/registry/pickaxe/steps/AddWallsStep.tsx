import type { WizardStepProps } from '../../../types/maze'
import PickaxeGrid from '../PickaxeGrid'
import { countPathWalls, countTotalWalls, toggleWall, type Point } from '../wizardMaze'

// §6.7.4 — sub-step A (required walls on the path) and sub-step B (manual-
// only distraction walls elsewhere) are both just "toggle any edge"; which
// counter an edge affects is derived from whether it lies on the path.
export default function AddWallsStep({
  starParams,
  draft,
  updateDraft,
  onValidate,
  validating,
  validation,
  onComplete,
}: WizardStepProps) {
  const pathWalls = countPathWalls(draft.grid, draft.path)
  const totalWalls = countTotalWalls(draft.grid)
  const pathWallsOk = pathWalls === draft.pickaxeCount
  const totalWallsOk = totalWalls >= starParams.minWalls
  const canValidate = pathWallsOk && totalWallsOk

  function handleEdgeToggle(a: Point, b: Point) {
    updateDraft((d) => ({ ...d, grid: toggleWall(d.grid, a, b) }))
  }

  return (
    <div className="space-y-4">
      <p className="text-slate-600">
        Click edges to add or remove walls. Walls placed on the path you drew count toward the
        required pickaxe count; walls anywhere else are distraction walls.
      </p>
      <PickaxeGrid grid={draft.grid} mode="place-walls" onEdgeToggle={handleEdgeToggle} />
      <div className="flex flex-wrap gap-4 text-sm">
        <span className={pathWallsOk ? 'text-emerald-700' : 'animate-pulse font-medium text-red-600'}>
          Path walls: {pathWalls} / {draft.pickaxeCount}
        </span>
        <span className={totalWallsOk ? 'text-emerald-700' : 'animate-pulse font-medium text-red-600'}>
          Total walls: {totalWalls} / {starParams.minWalls} minimum
        </span>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!canValidate || validating}
          onClick={onValidate}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {validating ? 'Validating…' : 'Validate'}
        </button>
        {validation && validation.solutionCount === 1 && (
          <button
            type="button"
            onClick={onComplete}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
          >
            Complete
          </button>
        )}
      </div>

      {validation &&
        (validation.solutionCount === 1 ? (
          <p className="text-sm text-emerald-700">Unique solution found: {validation.trace}</p>
        ) : (
          <p className="text-sm text-red-600">{validation.diagnostic}</p>
        ))}
    </div>
  )
}
