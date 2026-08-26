import { useDraggable, useDroppable } from '@dnd-kit/core'
import type { MazeQuestion } from '../types/maze'
import QuestionSlotCard from './QuestionSlotCard'
import type { QuestionDragData } from './dashboardDnd'

// A question card wired for level_dashboard_pagination_spec.md §5: draggable by
// its grip, and simultaneously a drop target for gesture 1's swap.
//
// The grip exists because the card is not a plain tile — it wraps a Link to the
// wizard, a difficulty <select> and a Remove button. Making the whole card the
// drag activator would put a pointer-capturing listener over all three. A
// dedicated handle keeps every existing control clickable and gives the
// keyboard sensor a real focusable element to attach to, which is also what
// makes the drag reachable without a pointer at all.
export default function DraggableQuestionSlot({
  mazeTypeId,
  question,
  pageId,
  starOptions,
  onChangeStar,
  onRemove,
}: {
  mazeTypeId: string
  question: MazeQuestion
  pageId: string
  starOptions: number[]
  onChangeStar: (star: number) => void
  onRemove: () => void
}) {
  const data: QuestionDragData = { kind: 'question', questionId: question.question_id, pageId }

  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: question.question_id,
    data,
  })
  const { setNodeRef: setDropRef, isOver, active } = useDroppable({ id: question.question_id, data })

  // `isOver` is true for the card being dragged as well, since it sits under
  // its own pointer — but dropping a question on itself is the no-op the store
  // rejects, so it must not light up as a target.
  const isSwapTarget = isOver && active?.id !== question.question_id

  return (
    <div ref={setDropRef} className="relative">
      <div
        ref={setNodeRef}
        // No transform is applied here on purpose: the moving card is drawn by
        // the DragOverlay in LevelDashboardPage, so translating the source too
        // would move it twice. The source just fades in place to show where the
        // question came from.
        className={`h-full rounded-xl transition ${isDragging ? 'opacity-40' : ''} ${
          isSwapTarget ? 'ring-2 ring-indigo-400 ring-offset-2' : ''
        }`}
      >
        <QuestionSlotCard
          mazeTypeId={mazeTypeId}
          question={question}
          starOptions={starOptions}
          onChangeStar={onChangeStar}
          onRemove={onRemove}
          dragHandle={
            <button
              type="button"
              ref={setActivatorNodeRef}
              {...listeners}
              {...attributes}
              aria-label={`Move this ${question.difficulty_star}-star question`}
              title="Drag to swap with another question, or onto an empty slot / Add new page"
              className="cursor-grab touch-none rounded px-1 text-sm leading-none text-slate-300 hover:text-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 active:cursor-grabbing"
            >
              ⠿
            </button>
          }
        />
      </div>
    </div>
  )
}
