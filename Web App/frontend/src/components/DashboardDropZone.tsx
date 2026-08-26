import type { ReactNode } from 'react'
import { useDroppable } from '@dnd-kit/core'
import type { DropData } from './dashboardDnd'

// Wrapper turning the "+ Add question" slot and the "+ Add new page" button into
// drop targets for level_dashboard_pagination_spec.md §5's gestures 2 and 3,
// without either of those components knowing about drag-and-drop.
//
// `disabled` is how a no-op drop is refused: the store rejects moving a question
// into the row it already sits in, and moving one that is already alone on the
// last row onto a new page, so those targets go inert rather than accepting a
// drop that silently does nothing. It is passed to useDroppable rather than only
// suppressing the highlight, which takes the zone out of collision detection
// entirely — so `isOver` can never be true for a target that would refuse.
export default function DashboardDropZone({
  id,
  data,
  disabled,
  children,
}: {
  id: string
  data: DropData
  disabled?: boolean
  children: ReactNode
}) {
  const { setNodeRef, isOver, active } = useDroppable({ id, data, disabled })
  const armed = active !== null && !disabled

  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl transition ${isOver ? 'ring-2 ring-indigo-400 ring-offset-2' : ''} ${
        armed && !isOver ? 'outline-2 outline-dashed outline-indigo-200 outline-offset-2' : ''
      }`}
    >
      {children}
    </div>
  )
}
