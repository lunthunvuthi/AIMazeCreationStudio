import { useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { getMazeType } from '../registry/mazeTypes'
import { useLevelStore } from '../store/levelStore'
import { parseLevelProgressFile } from '../storage/fileAdapter'

export default function ModifyMazePage() {
  const { mazeTypeId } = useParams<{ mazeTypeId: string }>()
  const mazeType = mazeTypeId ? getMazeType(mazeTypeId) : undefined
  const loadLevel = useLevelStore((s) => s.loadLevel)
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!mazeType) return <Navigate to="/" replace />

  async function handleFile(file: File) {
    setError(null)
    try {
      const progress = await parseLevelProgressFile(file)
      if (progress.mazeType !== mazeType!.id) {
        throw new Error('This file is for a different maze type.')
      }
      loadLevel(progress)
      navigate(`/${mazeType!.id}/dashboard`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file.')
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDraggingOver(false)
    const file = event.dataTransfer.files[0]
    if (file) void handleFile(file)
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <Link to={`/${mazeType.id}`} className="text-sm text-indigo-600 hover:underline">
        &larr; {mazeType.label}
      </Link>
      <h1 className="mt-4 text-3xl font-semibold text-slate-900">Modify Maze</h1>
      <p className="mt-1 text-sm text-slate-600">
        Drop a saved level JSON file below, or browse for one, to resume it on the Level Dashboard.
      </p>

      <div
        onDragOver={(event) => {
          event.preventDefault()
          setIsDraggingOver(true)
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={handleDrop}
        className={`mt-10 rounded-xl border-2 border-dashed p-16 text-center transition ${
          isDraggingOver ? 'border-indigo-400 bg-indigo-50 text-indigo-600' : 'border-slate-300 text-slate-500'
        }`}
      >
        <p>Drag and drop a level JSON file here</p>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-indigo-300 hover:text-indigo-600"
        >
          Browse for a file
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void handleFile(file)
          }}
        />
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    </main>
  )
}
