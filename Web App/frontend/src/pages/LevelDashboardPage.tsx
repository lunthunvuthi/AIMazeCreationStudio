import { Link, Navigate, useParams } from 'react-router-dom'
import { getMazeType } from '../registry/mazeTypes'
import { useLevelStore } from '../store/levelStore'
import QuestionSlotCard from '../components/QuestionSlotCard'
import { downloadLevelProgress } from '../storage/fileAdapter'

export default function LevelDashboardPage() {
  const { mazeTypeId } = useParams<{ mazeTypeId: string }>()
  const mazeType = mazeTypeId ? getMazeType(mazeTypeId) : undefined
  const current = useLevelStore((s) => s.current)

  if (!mazeType) return <Navigate to="/" replace />
  if (!current || current.mazeType !== mazeType.id) return <Navigate to={`/${mazeType.id}/new`} replace />

  const completeCount = current.questions.filter((q) => q.status === 'complete').length
  const allComplete = completeCount === current.questions.length

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <Link to={`/${mazeType.id}`} className="text-sm text-indigo-600 hover:underline">
        &larr; {mazeType.label}
      </Link>

      <div className="mt-4 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold capitalize text-slate-900">{current.level} level</h1>
          <p className="mt-1 text-sm text-slate-600">
            {completeCount} / {current.questions.length} complete
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => downloadLevelProgress(current)}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:border-indigo-300 hover:text-indigo-600"
          >
            Save Progress
          </button>
          <button
            type="button"
            onClick={() => downloadLevelProgress(current)}
            disabled={!allComplete}
            title={allComplete ? undefined : 'Complete every question first'}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:border-indigo-300 hover:text-indigo-600 disabled:text-slate-400 disabled:hover:border-slate-200 disabled:hover:text-slate-400"
          >
            Export JSON
          </button>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {current.questions.map((question) => (
          <QuestionSlotCard key={question.question_id} mazeTypeId={mazeType.id} question={question} />
        ))}
      </div>
    </main>
  )
}
