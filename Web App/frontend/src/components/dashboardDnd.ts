// Shared drag/drop payloads for the Level Dashboard's page rows
// (level_dashboard_pagination_spec.md §5).
//
// Why `@dnd-kit/core` alone and NOT `@dnd-kit/sortable`, which §5.2 left as an
// open "if the semantics map cleanly" — they don't, on two counts:
//
//   1. §5's gesture 1 is a *swap* (two questions trade places). Sortable models
//      insert-and-shift, so a cross-row sortable drop would push a question out
//      of the target row rather than exchange with it.
//   2. §5's other two drop targets aren't list items at all — one is a row's
//      "+ Add question" slot, the other the sheet-level "+ Add new page" button.
//      A sortable container can't express "drop here to create a new container".
//
// So each droppable declares what it is via `DropData` and one `onDragEnd`
// switch routes to the matching store action. Both `kind: 'question'` cases
// carry `pageId` even though the store looks a question's row up by id: the
// dashboard needs it to grey out drops that would be no-ops before the store
// ever sees them.

export interface QuestionDragData {
  kind: 'question'
  questionId: string
  pageId: string
}

export type DropData =
  // Gesture 1 — swap with the question on this card.
  | { kind: 'question'; questionId: string; pageId: string }
  // Gesture 2 — move into this row's free second slot.
  | { kind: 'addSlot'; pageId: string }
  // Gesture 3 — move onto a new row appended at the end of pages[].
  | { kind: 'newPage' }

// dnd-kit hands `data` back as `Record<string, unknown> | undefined`, so every
// read is a runtime narrowing rather than a cast.
export function asQuestionDrag(data: Record<string, unknown> | undefined): QuestionDragData | null {
  if (!data || data.kind !== 'question') return null
  const { questionId, pageId } = data
  if (typeof questionId !== 'string' || typeof pageId !== 'string') return null
  return { kind: 'question', questionId, pageId }
}

export function asDropData(data: Record<string, unknown> | undefined): DropData | null {
  if (!data) return null
  if (data.kind === 'newPage') return { kind: 'newPage' }
  if (data.kind === 'addSlot' && typeof data.pageId === 'string') {
    return { kind: 'addSlot', pageId: data.pageId }
  }
  return asQuestionDrag(data)
}

// A question card is both a draggable and a droppable, and dnd-kit keeps those
// in separate id namespaces, so both can safely use the question's own id. The
// two non-question drop targets need ids that cannot collide with a question_id
// (`${level}-${star}star-${n}`, e.g. "kinder-1star-1") — hence the prefixes.
export const ADD_SLOT_DROP_ID = (pageId: string) => `add-slot:${pageId}`
export const NEW_PAGE_DROP_ID = 'new-page'
