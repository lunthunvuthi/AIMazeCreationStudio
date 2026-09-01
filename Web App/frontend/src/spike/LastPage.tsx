// The worksheet's final page: a fixed, full-bleed A4 raster per level.
//
// Confirmed by the project owner 2026-08-21: "we will also use the same page
// for all content. So we don't have to create it again as well. just use this."
// So unlike the cover — whose header still carries live level/month/week data —
// this page is a pure static asset with nothing composited onto it.
//
// This replaces the hand-coded "Bonus page" that used to live inline in
// PdfPreviewSpikePage.tsx (Bonus Challenge banner + "Be a mission maker!" +
// blank draw area + mascot, all rebuilt in JSX from pdf_export_spec.md §5).
// Both supplied images ARE that page, rendered by the designer at 2480x3508px —
// A4 at exactly 300dpi — so there is nothing left for a renderer to approximate.
// Worth knowing: they are not merely two crops of one design. Kinder ends on
// Hatenyan alone, holding a pencil, with "I did it!"; Primary ends on two
// Hatenyan flanking a third, larger bear-like figure with "Well done! You did
// it!". The per-level split is real content, not branding.
//
// Do NOT name that third figure. These comments used to call it Posuru, which
// came from reading the JPEG rather than from the owner and contradicts the
// owner's standing rule (2026-08-19, reconfirmed 2026-09-01): this maze type
// uses Hatenyan and only Hatenyan. See `pdf_export_spec.md` §5.

import { useEffect } from 'react'
import type { LevelName } from '../types/maze'

// Filenames are the designer's own, kept verbatim so they still match the files
// the owner sent. Note they read "August-week4" even though these pages are
// reused for every month and week — the date in the name is an artifact of the
// sheet they were exported from, not a constraint. Renaming them to something
// like `last-page-kinder.jpg` would remove that trap, but would also break the
// owner's own references to them, so it's left as a suggestion.
const PRIMARY_LAST_PAGE = 'Primary August-week4-08 2.jpg'

const LAST_PAGE_IMAGES: Partial<Record<LevelName, string>> = {
  kinder: 'Kinder August-week4-08.jpg',
  primary: PRIMARY_LAST_PAGE,
  // Advanced has no artwork of its own yet. Reusing Primary's is the project
  // owner's explicit instruction (2026-08-21), not a silent guess by this
  // renderer — worth stating, because the two supplied pages differ in content
  // and not just branding (Kinder closes on Hatenyan alone with "I did it!",
  // Primary on a three-mascot group with "Well done! You did it!"), so which one
  // Advanced borrows is a real editorial choice. Replace with a dedicated file
  // when one arrives.
  advanced: PRIMARY_LAST_PAGE,
}

export interface LastPageProps {
  level: LevelName
  // Fired once the image has actually decoded. The PDF service must not call
  // page.pdf() before this, or the final page comes out blank.
  onReady?: () => void
}

export default function LastPage({ level, onReady }: LastPageProps) {
  const file = LAST_PAGE_IMAGES[level]

  // Every LevelName is mapped today, so the placeholder below is unreachable
  // via the type — but `level` arrives from a JSON save file at runtime, so a
  // malformed or future value can still land here. Kept as a real guard, and it
  // must signal readiness: with no <img> nothing would fire onLoad, and the PDF
  // service would wait for a signal that can never arrive and time out instead
  // of printing the placeholder.
  useEffect(() => {
    if (!file) onReady?.()
  }, [file, onReady])

  if (!file) {
    return (
      <div
        className="print-page flex items-center justify-center bg-white"
        style={{ width: '210mm', height: '297mm', border: '2pt solid #231f20' }}
      >
        <p className="max-w-xs text-center text-sm font-semibold text-red-700">
          No last-page artwork is registered for the “{level}” level. Add the file to
          <code> public/components/images/ </code> and register it in <code>LastPage.tsx</code>.
        </p>
      </div>
    )
  }

  return (
    <div className="print-page bg-white" style={{ width: '210mm', height: '297mm' }}>
      <img
        src={`/components/images/${encodeURIComponent(file)}`}
        alt=""
        onLoad={() => onReady?.()}
        // Full-bleed: the image already contains the page's own inset border
        // and margins, so it fills the sheet edge to edge with no padding.
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
    </div>
  )
}
