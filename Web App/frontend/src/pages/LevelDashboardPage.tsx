import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { Announcements, DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { getMazeType } from '../registry/mazeTypes'
import { useLevelStore } from '../store/levelStore'
import AddQuestionCard from '../components/AddQuestionCard'
import DashboardDropZone from '../components/DashboardDropZone'
import DraggableQuestionSlot from '../components/DraggableQuestionSlot'
import {
  ADD_SLOT_DROP_ID,
  NEW_PAGE_DROP_ID,
  asDropData,
  asQuestionDrag,
} from '../components/dashboardDnd'
import type { QuestionDragData } from '../components/dashboardDnd'
import { buildExportFilename, downloadBlob, downloadLevelProgress } from '../storage/fileAdapter'
import { renderPdf } from '../api/pdfApi'
import { flattenPages, MONTH_NAMES } from '../types/maze'
import type { MazeQuestion } from '../types/maze'

// level_dashboard_pagination_spec.md §3 — page-row list replacing the old
// flat 3-column question grid. §5's drag-and-drop landed 2026-08-26: each
// question card carries a grip, and the three gestures route to the three
// store actions in handleDragEnd below. Whole-row dragging stays out of scope
// per §5.1 — only individual questions move.
//
// 2026-08-21: every row in pages[] is now an ordinary question page, rendered
// by one uniform loop. Row 0 used to render as a locked "Cover / Tutorial"
// card because the PDF cover's tutorial illustration was built from its
// question; the cover's tutorial is a fixed constant now (spike/coverTutorial.ts)
// and consumes no question, so treating row 0 specially both hid controls that
// apply to it and — because the loop below started at pages[1] — labelled every
// row one page number lower than the PDF actually prints it.
export default function LevelDashboardPage() {
  const { mazeTypeId } = useParams<{ mazeTypeId: string }>()
  const mazeType = mazeTypeId ? getMazeType(mazeTypeId) : undefined
  const current = useLevelStore((s) => s.current)
  const updateSheetInfo = useLevelStore((s) => s.updateSheetInfo)
  const addQuestionToRow = useLevelStore((s) => s.addQuestionToRow)
  const addNewPage = useLevelStore((s) => s.addNewPage)
  const toggleRowBonus = useLevelStore((s) => s.toggleRowBonus)
  const setQuestionStar = useLevelStore((s) => s.setQuestionStar)
  const removeQuestion = useLevelStore((s) => s.removeQuestion)
  const swapQuestions = useLevelStore((s) => s.swapQuestions)
  const moveQuestionToRow = useLevelStore((s) => s.moveQuestionToRow)
  const moveQuestionToNewPage = useLevelStore((s) => s.moveQuestionToNewPage)

  // What is currently in the air, tracked here rather than read off
  // useDndContext() because two separate things need it: the DragOverlay's
  // contents, and deciding which drop zones are inert for this particular
  // question (see the `disabled` props below).
  const [activeDrag, setActiveDrag] = useState<QuestionDragData | null>(null)
  const [isRendering, setIsRendering] = useState(false)
  const [previewedSnapshot, setPreviewedSnapshot] = useState<string | null>(null)
  const [previewedBlob, setPreviewedBlob] = useState<Blob | null>(null)
  const [isRenderingKey, setIsRenderingKey] = useState(false)

  const sensors = useSensors(
    // A 5px threshold rather than an instant grab. The grip lives inside a card
    // whose body is a Link to the wizard and whose footer has a Remove button —
    // a pointerdown that never moves has to stay a plain click.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // Keyboard dragging: Space/Enter on a grip picks the question up, arrow keys
    // move the drag position in dnd-kit's default 25px steps, Space/Enter drops,
    // Escape cancels. Coarse, but it means every gesture below is reachable
    // without a pointer.
    useSensor(KeyboardSensor),
  )

  if (!mazeType) return <Navigate to="/" replace />
  if (!current || current.mazeType !== mazeType.id) return <Navigate to={`/${mazeType.id}/new`} replace />

  const allQuestions = flattenPages(current.pages)
  const completeCount = allQuestions.filter((q) => q.status === 'complete').length
  // `allQuestions.length > 0` matters now that row 0 self-deletes like any other
  // row (2026-08-21): removing every question leaves `pages: []`, and without
  // this guard 0 === 0 would report an empty sheet as fully complete and offer
  // it for export — the pdf-service rejects a payload with no pages.
  const allComplete = allQuestions.length > 0 && completeCount === allQuestions.length
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

  // level_dashboard_pagination_spec.md §5. This routes and nothing more: each
  // droppable declares what it is, and the matching store action owns every
  // guard that protects the data model (capacity, no-op drops, §4.3's
  // self-delete). Keeping the rules there means a drop and the equivalent
  // click-driven edit cannot diverge.
  const handleDragStart = (event: DragStartEvent) => {
    setActiveDrag(asQuestionDrag(event.active.data.current))
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDrag(null)
    const dragged = asQuestionDrag(event.active.data.current)
    const target = asDropData(event.over?.data.current)
    if (!dragged || !target) return
    if (target.kind === 'question') {
      swapQuestions(dragged.questionId, target.questionId)
    } else if (target.kind === 'addSlot') {
      moveQuestionToRow(dragged.questionId, target.pageId)
    } else {
      moveQuestionToNewPage(dragged.questionId)
    }
  }

  // Page numbers are 1-based over pages[] here exactly as they are in the row
  // labels and in the renderer — see the note on the row list below.
  const pageNumberOf = (pageId: string) => current.pages.findIndex((row) => row.pageId === pageId) + 1

  const describeQuestion = (questionId: string) => {
    const question = allQuestions.find((q) => q.question_id === questionId)
    return question ? `${question.difficulty_star}-star question` : 'question'
  }

  const describeDrop = (data: Record<string, unknown> | undefined) => {
    const target = asDropData(data)
    if (!target) return null
    if (target.kind === 'question') {
      return `the ${describeQuestion(target.questionId)} on page ${pageNumberOf(target.pageId)}`
    }
    if (target.kind === 'addSlot') return `the free slot on page ${pageNumberOf(target.pageId)}`
    return 'a new page at the end'
  }

  // dnd-kit's default announcements read out raw droppable ids, which here are
  // question_ids like "kinder-3star-2" — accurate but unusable aloud. These say
  // what the drop would actually do instead.
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Picked up the ${describeQuestion(String(active.id))}. Use the arrow keys to move it over another question, a free slot, or Add new page.`,
    onDragOver: ({ active, over }) => {
      // A card is its own drop target (that's how gesture 1's swap works), so a
      // question is already "over" itself the instant it is picked up. Saying so
      // would wipe out the pickup instructions above before they were read —
      // returning undefined leaves them standing instead.
      if (over?.id === active.id) return undefined
      if (!over) return 'Not over a drop target.'
      const where = describeDrop(over.data.current)
      return where ? `Over ${where}.` : 'Not over a drop target.'
    },
    onDragEnd: ({ active, over }) => {
      const what = describeQuestion(String(active.id))
      if (!over || over.id === active.id) return `Dropped the ${what} where it was. Nothing changed.`
      const where = describeDrop(over.data.current)
      return where ? `Moved the ${what} to ${where}.` : `Dropped the ${what} outside any target. Nothing changed.`
    },
    onDragCancel: ({ active }) => `Cancelled. The ${describeQuestion(String(active.id))} stayed where it was.`,
  }

  const draggedRowIndex = activeDrag ? current.pages.findIndex((row) => row.pageId === activeDrag.pageId) : -1
  // Gesture 3 would rebuild an identical sheet when the dragged question is
  // already alone on the last row, so that target goes inert — the store
  // rejects the move anyway, this just stops it looking droppable.
  const newPageDropDisabled =
    !activeDrag ||
    (draggedRowIndex === current.pages.length - 1 &&
      current.pages[draggedRowIndex]?.questions.length === 1)

  function handleRemove(question: MazeQuestion) {
    if (question.maze && !window.confirm('This question already has a maze. Remove it anyway?')) {
      return
    }
    removeQuestion(question.question_id)
  }

  const currentSnapshot = JSON.stringify(current)
  const canDownload = allComplete && previewedBlob !== null && previewedSnapshot === currentSnapshot

  // Arrow consts, not `function` declarations, on purpose. The guard above
  // narrows `current` to non-null, but a hoisted function declaration is
  // considered created before that narrowing, so TypeScript re-widens `current`
  // to `LevelProgress | null` inside one — which is what broke `npm run build`
  // (three TS2345 errors) even though `tsc --noEmit` reported clean — see the
  // warning in tsconfig.json for why that command proves nothing here.
  const handlePreview = async () => {
    setIsRendering(true)
    try {
      const blob = await renderPdf(current)
      setPreviewedSnapshot(currentSnapshot)
      setPreviewedBlob(blob)
      window.open(URL.createObjectURL(blob), '_blank')
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'PDF preview failed.')
    } finally {
      setIsRendering(false)
    }
  }

  const handleDownload = () => {
    if (!previewedBlob) return
    downloadBlob(previewedBlob, buildExportFilename(current, 'pdf'))
    downloadLevelProgress(current)
  }

  // PRODUCTION_PROCESS.md §4 step 3 / pdf_export_spec.md §6 — the answer key is
  // the same page sequence with solution paths overlaid, delivered as its own
  // download. Deliberately NOT routed through the Preview/Download pair: the
  // key is never the thing being proofed on screen, so caching a blob and
  // gating the save on a matching snapshot would only add a step. It renders
  // and saves in one click, and takes the render cost every time.
  const handleAnswerKey = async () => {
    setIsRenderingKey(true)
    try {
      const blob = await renderPdf(current, { answerKey: true })
      downloadBlob(blob, buildExportFilename(current, 'pdf', '-answer-key'))
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Answer key render failed.')
    } finally {
      setIsRenderingKey(false)
    }
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
            {completeCount} / {allQuestions.length} complete
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
          {/* An empty sheet is reachable now that row 0 self-deletes like any
              other row (2026-08-21): removing every question leaves
              `pages: []`, which pdf-service rejects outright. Guarding here
              keeps that from surfacing as a raw backend message in an alert. */}
          <button
            type="button"
            onClick={handlePreview}
            disabled={isRendering || allQuestions.length === 0}
            title={allQuestions.length === 0 ? 'Add a question first' : undefined}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:border-indigo-300 hover:text-indigo-600 disabled:text-slate-400 disabled:hover:border-slate-200 disabled:hover:text-slate-400"
          >
            {isRendering ? 'Rendering…' : 'Preview'}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={!canDownload}
            title={
              !allComplete
                ? 'Complete every question first'
                : !canDownload
                  ? 'Preview the sheet before downloading'
                  : undefined
            }
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:border-indigo-300 hover:text-indigo-600 disabled:text-slate-400 disabled:hover:border-slate-200 disabled:hover:text-slate-400"
          >
            Download
          </button>
          {/* Gated on allComplete, like Download and unlike Preview. An empty
              slot carries no maze, so the renderer's question panel has nothing
              to draw and the page never signals ready — the service then spends
              its full timeout before failing. Refusing the click is the only
              honest answer until Preview is gated the same way. */}
          <button
            type="button"
            onClick={handleAnswerKey}
            disabled={isRenderingKey || !allComplete}
            title={!allComplete ? 'Complete every question first' : undefined}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:border-indigo-300 hover:text-indigo-600 disabled:text-slate-400 disabled:hover:border-slate-200 disabled:hover:text-slate-400"
          >
            {isRenderingKey ? 'Rendering…' : 'Answer Key'}
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

      <DndContext
        sensors={sensors}
        accessibility={{ announcements }}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveDrag(null)}
      >
        <div className="mt-8 flex flex-col gap-4">
          {/* One row per PageRow, no special-cased first row. "Page {i + 1}"
              matches the number the renderer stamps on that row's page —
              PdfPreviewSpikePage.tsx numbers fixture.pages as i + 1 over the same
              array, so these two indices have to be read off pages[] identically. */}
          {current.pages.map((row, i) => (
            <div key={row.pageId} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-3">
                <span className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600">
                  Page {i + 1}
                </span>
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                  <input
                    type="checkbox"
                    checked={row.isBonus}
                    onChange={() => toggleRowBonus(row.pageId)}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-400"
                  />
                  Bonus
                </label>
              </div>
              <div className="grid grid-cols-2 items-stretch gap-4 sm:grid-cols-3">
                {row.questions.map((question) => (
                  <DraggableQuestionSlot
                    key={question.question_id}
                    mazeTypeId={mazeType.id}
                    question={question}
                    pageId={row.pageId}
                    starOptions={starOptions}
                    onChangeStar={(star) => handleChangeStar(question, star)}
                    onRemove={() => handleRemove(question)}
                  />
                ))}
                {/* §4.2 — the free-slot drop target only exists while the row
                    holds exactly 1 question, which is the same condition that
                    shows the "+ Add question" card. Dropping a question back
                    into its own row is a no-op, so that case goes inert. */}
                {row.questions.length === 1 && (
                  <DashboardDropZone
                    id={ADD_SLOT_DROP_ID(row.pageId)}
                    data={{ kind: 'addSlot', pageId: row.pageId }}
                    disabled={!activeDrag || activeDrag.pageId === row.pageId}
                  >
                    <AddQuestionCard starOptions={starOptions} onAdd={(star) => addQuestionToRow(row.pageId, star)} />
                  </DashboardDropZone>
                )}
              </div>
            </div>
          ))}

          <DashboardDropZone id={NEW_PAGE_DROP_ID} data={{ kind: 'newPage' }} disabled={newPageDropDisabled}>
            <button
              type="button"
              onClick={() => addNewPage(3)}
              className="flex w-full items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 p-4 text-slate-400 transition hover:border-indigo-300 hover:text-indigo-500"
            >
              <span className="text-xl leading-none">+</span>
              <span className="text-sm font-medium">Add new page</span>
            </button>
          </DashboardDropZone>
        </div>

        {/* The card that follows the pointer. Deliberately a compact summary
            rather than a clone of the real card: the real one carries a maze
            thumbnail and two controls, and dragging a full-size copy of that
            obscures the very drop targets it is being aimed at. */}
        <DragOverlay dropAnimation={null}>
          {activeDrag && (
            <div className="rounded-lg border border-indigo-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-lg">
              {describeQuestion(activeDrag.questionId)}
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </main>
  )
}
