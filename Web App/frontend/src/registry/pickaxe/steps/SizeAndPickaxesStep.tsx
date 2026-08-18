import type { WizardStepProps } from '../../../types/maze'

// §6.7.1 — grid size is always fixed/read-only; pickaxe count is only user-
// choosable where difficulty_setting.md defines a range (stars 6-8).
export default function SizeAndPickaxesStep({ starParams, draft, updateDraft }: WizardStepProps) {
  const hasRange = starParams.pickaxeMin !== starParams.pickaxeMax

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-medium text-slate-900">Grid size</h2>
        <p className="mt-1 text-slate-600">
          {starParams.width} &times; {starParams.height} — fixed for this difficulty.
        </p>
      </div>

      <div>
        <h2 className="text-lg font-medium text-slate-900">Pickaxes</h2>
        {hasRange ? (
          <div className="mt-2 flex items-center gap-4">
            <button
              type="button"
              disabled={draft.pickaxeCount <= starParams.pickaxeMin}
              onClick={() =>
                updateDraft((d) => ({ ...d, pickaxeCount: Math.max(starParams.pickaxeMin, d.pickaxeCount - 1) }))
              }
              className="h-8 w-8 rounded-lg border border-slate-300 text-lg font-medium text-slate-700 disabled:opacity-30"
            >
              −
            </button>
            <span className="w-6 text-center text-xl font-semibold text-slate-900">{draft.pickaxeCount}</span>
            <button
              type="button"
              disabled={draft.pickaxeCount >= starParams.pickaxeMax}
              onClick={() =>
                updateDraft((d) => ({ ...d, pickaxeCount: Math.min(starParams.pickaxeMax, d.pickaxeCount + 1) }))
              }
              className="h-8 w-8 rounded-lg border border-slate-300 text-lg font-medium text-slate-700 disabled:opacity-30"
            >
              +
            </button>
            <span className="text-sm text-slate-500">
              ({starParams.pickaxeMin}-{starParams.pickaxeMax} allowed)
            </span>
          </div>
        ) : (
          <p className="mt-1 text-slate-600">
            {starParams.pickaxeMin} pickaxe{starParams.pickaxeMin === 1 ? '' : 's'} — fixed for this difficulty.
          </p>
        )}
      </div>
    </div>
  )
}
