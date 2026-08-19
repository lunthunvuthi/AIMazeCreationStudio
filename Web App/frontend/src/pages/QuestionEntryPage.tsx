import { Link, Navigate, useParams } from 'react-router-dom'
import { getMazeType } from '../registry/mazeTypes'
import { useLevelStore } from '../store/levelStore'
import { flattenPages } from '../types/maze'

// §6.5 — selecting an empty/in-progress slot opens the Create Myself vs
// Randomize choice; selecting an already-complete slot reopens it directly
// (at the wizard for manual-origin, or the read-only result view for
// randomized-origin, roadmap step 3).
export default function QuestionEntryPage() {
  const { mazeTypeId, questionId } = useParams<{ mazeTypeId: string; questionId: string }>()
  const mazeType = mazeTypeId ? getMazeType(mazeTypeId) : undefined
  const current = useLevelStore((s) => s.current)

  if (!mazeType) return <Navigate to="/" replace />
  if (!current || current.mazeType !== mazeType.id) return <Navigate to={`/${mazeType.id}/new`} replace />

  const question = flattenPages(current.pages).find((q) => q.question_id === questionId)
  if (!question) return <Navigate to={`/${mazeType.id}/dashboard`} replace />

  if (question.status === 'complete' && question.origin === 'manual') {
    return <Navigate to={`/${mazeType.id}/dashboard/${question.question_id}/create`} replace />
  }

  // Covers both a completed randomize and one that's mid-flight (a generate
  // resolved but the user hasn't clicked Complete yet) — either way, the
  // result screen is what resumes.
  if (question.origin === 'random' && (question.status === 'complete' || question.status === 'randomized')) {
    return <Navigate to={`/${mazeType.id}/dashboard/${question.question_id}/randomize`} replace />
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <Link to={`/${mazeType.id}/dashboard`} className="text-sm text-indigo-600 hover:underline">
        &larr; Level Dashboard
      </Link>
      <h1 className="mt-4 text-3xl font-semibold text-slate-900">
        {question.question_id} ({'★'.repeat(question.difficulty_star)})
      </h1>

      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          to={`/${mazeType.id}/dashboard/${question.question_id}/create`}
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-indigo-300 hover:shadow-md"
        >
          <h2 className="text-lg font-medium text-slate-900">Create Myself</h2>
          <p className="mt-1 text-sm text-slate-600">Build this maze by hand, step by step.</p>
        </Link>
        <Link
          to={`/${mazeType.id}/dashboard/${question.question_id}/randomize`}
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-indigo-300 hover:shadow-md"
        >
          <h2 className="text-lg font-medium text-slate-900">Randomize</h2>
          <p className="mt-1 text-sm text-slate-600">Let the generator build one for you.</p>
        </Link>
      </div>
    </main>
  )
}
