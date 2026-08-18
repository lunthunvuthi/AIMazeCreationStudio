import { Link, Navigate, useParams } from 'react-router-dom'
import { getMazeType } from '../registry/mazeTypes'

export default function MazeTypeHomePage() {
  const { mazeTypeId } = useParams<{ mazeTypeId: string }>()
  const mazeType = mazeTypeId ? getMazeType(mazeTypeId) : undefined

  if (!mazeType) return <Navigate to="/" replace />

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <Link to="/" className="text-sm text-indigo-600 hover:underline">
        &larr; All maze types
      </Link>
      <h1 className="mt-4 text-3xl font-semibold text-slate-900">{mazeType.label}</h1>

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
