import { Link, Navigate, useParams } from 'react-router-dom'
import { getMazeType } from '../registry/mazeTypes'
import { useLevelStore } from '../store/levelStore'
import { flattenPages, MONTH_NAMES } from '../types/maze'

export default function MazeTypeHomePage() {
  const { mazeTypeId } = useParams<{ mazeTypeId: string }>()
  const mazeType = mazeTypeId ? getMazeType(mazeTypeId) : undefined
  const current = useLevelStore((s) => s.current)
  const clearLevel = useLevelStore((s) => s.clearLevel)

  if (!mazeType) return <Navigate to="/" replace />

  // Roadmap step 6. `current` is now hydrated from the localStorage autosave at
  // store construction, so on a fresh page load this is last session's sheet —
  // which is the whole point of showing it here. Two entry points existed
  // before ("Create New Maze" wipes it, "Modify Maze" wants a file), and
  // neither said the work was still sitting there.
  const resumable = current && current.mazeType === mazeType.id ? current : null
  const resumableQuestions = resumable ? flattenPages(resumable.pages) : []
  const resumableComplete = resumableQuestions.filter((q) => q.status === 'complete').length

  function handleDiscard() {
    if (!window.confirm('Discard the in-progress sheet? Anything not saved to a file is lost.')) return
    clearLevel()
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <Link to="/" className="text-sm text-indigo-600 hover:underline">
        &larr; All maze types
      </Link>
      <h1 className="mt-4 text-3xl font-semibold text-slate-900">{mazeType.label}</h1>

      {resumable && (
        <div className="mt-8 rounded-xl border border-indigo-200 bg-indigo-50 p-6">
          <p className="text-xs font-medium uppercase tracking-wide text-indigo-600">In progress</p>
          <h2 className="mt-1 text-lg font-medium capitalize text-slate-900">
            {resumable.sheetName || `${resumable.level} level`}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {resumableComplete} / {resumableQuestions.length} questions complete &middot;{' '}
            {MONTH_NAMES[resumable.month - 1]} {resumable.year}, week {resumable.week} &middot; last edited{' '}
            {new Date(resumable.updatedAt).toLocaleString()}
          </p>
          <div className="mt-4 flex gap-2">
            <Link
              to={`/${mazeType.id}/dashboard`}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
            >
              Resume
            </Link>
            <button
              type="button"
              onClick={handleDiscard}
              className="rounded-lg border border-indigo-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-red-300 hover:text-red-600"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          to={`/${mazeType.id}/new`}
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-indigo-300 hover:shadow-md"
        >
          <h2 className="text-lg font-medium text-slate-900">Create New Maze</h2>
          <p className="mt-1 text-sm text-slate-600">Start a new level from scratch.</p>
        </Link>
        <Link
          to={`/${mazeType.id}/modify`}
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-indigo-300 hover:shadow-md"
        >
          <h2 className="text-lg font-medium text-slate-900">Modify Maze</h2>
          <p className="mt-1 text-sm text-slate-600">Resume from a saved level file.</p>
        </Link>
      </div>
    </main>
  )
}
