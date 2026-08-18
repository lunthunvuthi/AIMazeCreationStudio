import { useState } from 'react'

// §6.5 — the trailing "+" slot in the Level Dashboard grid. Lets a sheet grow
// past whatever difficulty_setting.md's starting distribution seeded it with.
export default function AddQuestionCard({
  starOptions,
  onAdd,
}: {
  starOptions: number[]
  onAdd: (star: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [star, setStar] = useState(starOptions[0])

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-[9rem] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 p-4 text-slate-400 transition hover:border-indigo-300 hover:text-indigo-500"
      >
        <span className="text-3xl leading-none">+</span>
        <span className="text-sm font-medium">Add question</span>
      </button>
    )
  }

  return (
    <div className="flex min-h-[9rem] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50/40 p-4">
      <label className="flex flex-col items-center gap-1">
        <span className="text-xs font-medium text-slate-500">Difficulty</span>
        <select
          value={star}
          onChange={(e) => setStar(Number(e.target.value))}
          className="rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-900 focus:border-indigo-300 focus:outline-none"
        >
          {starOptions.map((s) => (
            <option key={s} value={s}>
              {'★'.repeat(s)} ({s})
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            onAdd(star)
            setOpen(false)
          }}
          className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700"
        >
          Add
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:border-slate-300"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
