import { Link, Navigate, useParams } from 'react-router-dom'
import { getMazeType } from '../registry/mazeTypes'
import { useLevelStore } from '../store/levelStore'
import QuestionSlotCard from '../components/QuestionSlotCard'
import AddQuestionCard from '../components/AddQuestionCard'
import { downloadLevelProgress } from '../storage/fileAdapter'
import { MONTH_NAMES } from '../types/maze'
import type { MazeQuestion } from '../types/maze'

export default function LevelDashboardPage() {
  const { mazeTypeId } = useParams<{ mazeTypeId: string }>()
  const mazeType = mazeTypeId ? getMazeType(mazeTypeId) : undefined
  const current = useLevelStore((s) => s.current)
  const updateSheetInfo = useLevelStore((s) => s.updateSheetInfo)
  const addQuestion = useLevelStore((s) => s.addQuestion)
  const setQuestionStar = useLevelStore((s) => s.setQuestionStar)
  const removeQuestion = useLevelStore((s) => s.removeQuestion)

  if (!mazeType) return <Navigate to="/" replace />
  if (!current || current.mazeType !== mazeType.id) return <Navigate to={`/${mazeType.id}/new`} replace />

  const completeCount = current.questions.filter((q) => q.status === 'complete').length
  const allComplete = completeCount === current.questions.length
  const starOptions = Object.keys(mazeType.starParams)
    .map(Number)
    .sort((a, b) => a - b)

  function handleChangeStar(question: MazeQuestion, star: number) {
    if (star === question.difficulty_star) return
    if (
      question.maze &&
      !window.confirm('This question already has a maze. Changing its difficulty will erase it. Continue?')
    ) {
      return
    }
    setQuestionStar(question.question_id, star)
  }

  function handleRemove(question: MazeQuestion) {
    if (question.maze && !window.confirm('This question already has a maze. Remove it anyway?')) {
      return
    }
    removeQuestion(question.question_id)
  }

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

      <div className="mt-6 grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-4">
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs font-medium text-slate-500">Sheet name</span>
          <input
            type="text"
            value={current.sheetName}
            onChange={(e) => updateSheetInfo({ sheetName: e.target.value })}
            placeholder="e.g. Kinder Week 2"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-300 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500">Year</span>
          <input
            type="number"
            value={current.year}
            onChange={(e) => updateSheetInfo({ year: Number(e.target.value) })}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-300 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500">Month</span>
          <select
            value={current.month}
            onChange={(e) => updateSheetInfo({ month: Number(e.target.value) })}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-300 focus:outline-none"
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={name} value={i + 1}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500">Week</span>
          <input
            type="number"
            min={1}
            value={current.week}
            onChange={(e) => updateSheetInfo({ week: Number(e.target.value) })}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-300 focus:outline-none"
          />
        </label>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {current.questions.map((question) => (
          <QuestionSlotCard
            key={question.question_id}
            mazeTypeId={mazeType.id}
            question={question}
            starOptions={starOptions}
            onChangeStar={(star) => handleChangeStar(question, star)}
            onRemove={() => handleRemove(question)}
          />
        ))}
        <AddQuestionCard starOptions={starOptions} onAdd={addQuestion} />
      </div>
    </main>
  )
}
