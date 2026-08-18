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
}: {
  mazeTypeId: string
  question: MazeQuestion
}) {
  return (
    <Link
      to={`/${mazeTypeId}/dashboard/${question.question_id}`}
      className="flex flex-col items-start gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-300 hover:shadow-md"
    >
      {question.maze && (
        <div className="mx-auto w-24">
          <PickaxeGrid grid={hydrateDraftFromMazeData(question.maze, null).grid} mode="view" />
        </div>
      )}
      <span className="text-sm font-medium text-slate-900">
        {'★'.repeat(question.difficulty_star)} ({question.difficulty_star})
      </span>
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[question.status]}`}>
        {STATUS_LABEL[question.status]}
      </span>
    </Link>
  )
}
