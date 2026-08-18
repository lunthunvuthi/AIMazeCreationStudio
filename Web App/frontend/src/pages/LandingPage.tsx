import { Link } from 'react-router-dom'
import { MAZE_TYPES } from '../registry/mazeTypes'

export default function LandingPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold text-slate-900">Maze Studio</h1>
      <p className="mt-2 text-slate-600">Choose a maze type to get started.</p>

      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {MAZE_TYPES.map((mazeType) => (
          <Link
            key={mazeType.id}
            to={`/${mazeType.id}`}
            className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-indigo-300 hover:shadow-md"
          >
            <h2 className="text-lg font-medium text-slate-900">{mazeType.label}</h2>
          </Link>
        ))}
      </div>
    </main>
  )
}
