import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { getMazeType } from '../registry/mazeTypes'
import { useLevelStore } from '../store/levelStore'
import type { LevelName } from '../types/maze'

const LEVELS: { id: LevelName; label: string }[] = [
  { id: 'kinder', label: 'Kinder' },
  { id: 'primary', label: 'Primary' },
  { id: 'advanced', label: 'Advanced' },
]

export default function NewLevelPage() {
  const { mazeTypeId } = useParams<{ mazeTypeId: string }>()
  const mazeType = mazeTypeId ? getMazeType(mazeTypeId) : undefined
  const startNewLevel = useLevelStore((s) => s.startNewLevel)
  const navigate = useNavigate()

  if (!mazeType) return <Navigate to="/" replace />

  function handleSelect(level: LevelName) {
    startNewLevel(mazeType!.id, level)
    navigate(`/${mazeType!.id}/dashboard`)
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <Link to={`/${mazeType.id}`} className="text-sm text-indigo-600 hover:underline">
        &larr; {mazeType.label}
      </Link>
      <h1 className="mt-4 text-3xl font-semibold text-slate-900">Choose a level</h1>

      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {LEVELS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => handleSelect(id)}
            className="rounded-xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-indigo-300 hover:shadow-md"
          >
            <h2 className="text-lg font-medium text-slate-900">{label}</h2>
            <p className="mt-1 text-sm text-slate-600">
              {mazeType.difficultyConfig[id].length} questions
            </p>
          </button>
        ))}
      </div>
    </main>
  )
}
