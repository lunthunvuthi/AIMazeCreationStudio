import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { MazeQuestion } from '../types/maze'
import PickaxeGrid from '../registry/pickaxe/PickaxeGrid'
import { hydrateDraftFromMazeData } from '../registry/pickaxe/wizardMaze'

const STATUS_LABEL: Record<MazeQuestion['status'], string> = {
  empty: 'Empty',
  in_progress: 'In Progress',
  randomized: 'Randomized',
  complete: 'Complete',
}

const STATUS_CLASSES: Record<MazeQuestion['status'], string> = {
  empty: 'bg-slate-100 text-slate-600',
  in_progress: 'bg-amber-100 text-amber-700',
  randomized: 'bg-sky-100 text-sky-700',
  complete: 'bg-emerald-100 text-emerald-700',
}

export default function QuestionSlotCard({
  mazeTypeId,
  question,
  starOptions,
  onChangeStar,
  onRemove,
  dragHandle,
}: {
  mazeTypeId: string
  question: MazeQuestion
  starOptions: number[]
  onChangeStar: (star: number) => void
  // Required: the Remove button below is rendered unconditionally, so a caller
  // that omitted this would ship an enabled control that does nothing. It was
  // optional only for §4.1's locked cover row, which rendered a card with no
  // Remove control at all — that row is gone (2026-08-21).
  onRemove: () => void
  // level_dashboard_pagination_spec.md §5's drag grip, supplied by
  // DraggableQuestionSlot. Optional so this card stays usable on its own — the
  // drag wiring lives entirely in the wrapper, and a card rendered without one
  // simply isn't draggable.
  dragHandle?: ReactNode
}) {
  return (
    <div className="flex h-full flex-col items-stretch gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-300 hover:shadow-md">
      {dragHandle && <div className="-mt-2 -ml-2 flex">{dragHandle}</div>}
      <Link to={`/${mazeTypeId}/dashboard/${question.question_id}`} className="flex flex-col items-center gap-2">
        {question.maze && (
          <div className="mx-auto w-24">
            <PickaxeGrid grid={hydrateDraftFromMazeData(question.maze, null).grid} mode="view" />
          </div>
        )}
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[question.status]}`}>
          {STATUS_LABEL[question.status]}
        </span>
      </Link>

      <label className="flex items-center justify-between gap-2 text-xs text-slate-500">
        <span>Difficulty</span>
        <select
          value={question.difficulty_star}
          onChange={(e) => onChangeStar(Number(e.target.value))}
          className="rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-900 focus:border-indigo-300 focus:outline-none"
        >
          {starOptions.map((s) => (
            <option key={s} value={s}>
              {'★'.repeat(s)} ({s})
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={onRemove}
        className="self-end text-xs font-medium text-slate-400 hover:text-red-500"
      >
        Remove
      </button>
    </div>
  )
}
