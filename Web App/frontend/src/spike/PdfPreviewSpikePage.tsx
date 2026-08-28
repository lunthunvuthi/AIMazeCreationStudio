import { useCallback, useMemo, useState, type CSSProperties } from 'react'
import type { LevelName } from '../types/maze'
import CoverPage from './CoverPage'
import { INK, LaurelWreath } from './icons'
import LastPage from './LastPage'
import { QuestionPanel } from './pdfMazeTypeRegistry'
import { sampleFixture } from './sampleFixture'
import type { SpikeFixture } from './types'

// render_via_browser.mjs's --data flag and pdf-service/render.js both inject a
// real LevelProgress payload here via page.addInitScript before navigation
// (LevelProgress is a structural superset of SpikeFixture — see types.ts).
// Falls back to the hardcoded sample fixture when nothing was injected, so the
// plain `npm run dev` / manual-browser path is unchanged.
declare global {
  interface Window {
    __PDF_FIXTURE_DATA__?: SpikeFixture
  }
}

function readFixture(): SpikeFixture {
  return window.__PDF_FIXTURE_DATA__ ?? sampleFixture
}

// The print view the PDF service drives. Page sequence (pdf_export_spec.md §2):
//
//   1        cover / direction page   — CoverPage.tsx, from the real
//                                      Front Cover.svg template
//   2..N-1   question pages           — one per authored PageRow
//   N        last page                — LastPage.tsx, a fixed per-level image
//
// 2026-08-21 rework #4 — the owner's content-production process, which fixes
// both static pages so they are authored once per maze type / per level and
// then reused by every sheet:
//
//   * The cover moved out of this file into CoverPage.tsx and is now built on
//     the designer's actual vector template instead of markup that approximated
//     it. Its tutorial mazes are fixed constants (coverTutorial.ts), not data.
//   * The hand-coded Bonus page moved out into LastPage.tsx and is now the
//     designer's supplied full-bleed A4 image for the sheet's level.
//   * **Every row in `pages[]` is a question page.** This used to be
//     `pages.slice(1)`, because `pages[0]` was a "cover row" whose question fed
//     the cover illustration. Now that the cover's tutorial is fixed, consuming
//     pages[0] that way would silently drop an authored question from the
//     output. The Level Dashboard was brought in line on 2026-08-21: it renders
//     every row uniformly and labels each one with the same `i + 1` over
//     `pages[]` that the badge loop below uses, so a row's dashboard label and
//     its printed page number cannot drift apart.
//
// Earlier reworks, for context: #1 rebuilt the maze panels against
// pdf_design_spec.md's measured sample (WallGrid/icons.tsx) after the first pass
// used a dotted background grid and emoji; #2 pulled the PickAxe-specific
// "badge + grid" composition out into pdfMazeTypeRegistry.tsx's QuestionPanel,
// so this file has zero maze-type-specific layout knowledge; #3 swapped
// hand-drawn icons for the designer's real vectors.

// level_dashboard_pagination_spec.md §4.4 — `isBonus` is a manual per-row flag,
// not computed from star rating (pdf_design_spec.md §7's laurel wreath replaces
// the plain box entirely on a Bonus row, it doesn't overlay on top of it).
// Page-numbering rule: odd pages sit top-left, even pages top-right (per-project
// print convention, confirmed 2026-08-19 against the real output — not derivable
// from the sample, a direct rule from the owner).
function PageNumberBadge({ number, isBonus }: { number: number; isBonus: boolean }) {
  const alignClass = number % 2 === 0 ? 'ml-auto' : ''
  const badgeClass = `mb-4 block h-24 w-24 ${alignClass}`
  if (isBonus) {
    return (
      <svg viewBox="0 0 48 48" className={badgeClass}>
        <LaurelWreath cx={24} cy={24} width={40} number={number} />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 48 48" className={badgeClass}>
      <rect x={2} y={2} width={44} height={44} fill="white" stroke={INK} strokeWidth={0.8} />
      <text x={24} y={31} textAnchor="middle" fontSize={20} fontWeight="bold" fill={INK}>
        {number}
      </text>
    </svg>
  )
}

// Every sheet page is exactly A4 and carries its own padding, because @page's
// margin is now 0 (see printStyle). It used to be `@page { margin: 10mm }` with
// 210mm-wide page elements inside it, which overflowed the 190mm printable
// width and left Chromium to scale the result. Content box is unchanged at
// 190mm x 277mm.
const SHEET: CSSProperties = { width: '210mm', height: '297mm', boxSizing: 'border-box' }

export default function PdfPreviewSpikePage() {
  const [answerKey, setAnswerKey] = useState(false)
  const [previewIndex, setPreviewIndex] = useState<number | 'sheet'>('sheet')
  const fixture = useMemo(readFixture, [])

  // Both static pages load asynchronously — the cover fetches the SVG template,
  // the last page decodes a ~1MB JPEG — and both finish after `load` and after
  // `networkidle`. `data-pdf-ready` below is the signal pdf-service waits on;
  // printing earlier yields a cover with no template and a blank final page.
  // useCallback keeps these stable so CoverPage's onReady effect doesn't re-run
  // on every render.
  const [coverReady, setCoverReady] = useState(false)
  const [lastPageReady, setLastPageReady] = useState(false)
  const handleCoverReady = useCallback(() => setCoverReady(true), [])
  const handleLastPageReady = useCallback(() => setLastPageReady(true), [])

  const allQuestions = useMemo(() => fixture.pages.flatMap((p) => p.questions), [fixture])

  const toolbar = (
    <div className="no-print mb-6 flex flex-wrap items-center justify-center gap-4">
      <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <input type="checkbox" checked={answerKey} onChange={(e) => setAnswerKey(e.target.checked)} />
        Answer key (overlay solution path)
      </label>
      <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
        Preview:
        <select
          value={previewIndex}
          onChange={(e) => setPreviewIndex(e.target.value === 'sheet' ? 'sheet' : Number(e.target.value))}
          className="rounded border border-slate-300 px-2 py-1"
        >
          <option value="sheet">Full sheet</option>
          {allQuestions.map((q, i) => (
            <option key={q.question_id} value={i}>
              Question {i} ({q.question_id})
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        style={{ backgroundColor: INK }}
      >
        Print / Save as PDF
      </button>
    </div>
  )

  // Shared print/screen CSS — hoisted above the branch below (rather than living
  // only in the "full sheet" return) so a headless browser printing ANY view of
  // this page still hides the .no-print toolbar. Missing that on the
  // single-question branch was a real bug caught while building the hybrid
  // renderer spike.
  const printStyle = (
    <style>{`
      @media print {
        @page { size: A4; margin: 0; }
        .no-print { display: none !important; }
        .print-page { box-shadow: none !important; margin: 0 !important; page-break-after: always; }
        .print-page:last-child { page-break-after: auto; }
      }
      @media screen {
        .print-page { box-shadow: 0 2px 10px rgba(0,0,0,0.15); margin: 0 auto 24px; }
      }
    `}</style>
  )

  // Single-question preview — the per-maze-type unit in isolation, no
  // page/badge-position/wreath chrome, no sheet context. Mirrors the backend
  // spike's render_question_preview: a new maze type's question design can be
  // built and checked before it is ever arranged onto a sheet. Reports ready
  // immediately: neither static page is rendered in this mode.
  if (previewIndex !== 'sheet') {
    const question = allQuestions[previewIndex]
    return (
      <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:p-0" data-pdf-ready="true">
        {printStyle}
        {toolbar}
        <div className="print-page mx-auto w-96 rounded bg-white p-8 shadow">
          <QuestionPanel mazeType={fixture.mazeType} question={question} size="large" answerKey={answerKey} />
        </div>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen bg-slate-100 py-8 print:bg-white print:p-0"
      data-pdf-ready={coverReady && lastPageReady ? 'true' : 'false'}
    >
      {printStyle}

      {toolbar}

      <CoverPage
        mazeType={fixture.mazeType}
        level={fixture.level}
        year={fixture.year}
        month={fixture.month}
        week={fixture.week}
        onReady={handleCoverReady}
      />

      {/* Question pages, one per PageRow. This loop has NO maze-type-specific
          layout knowledge — QuestionPanel looks up whichever maze type's
          question unit is registered, and the flex column below just stacks
          however many there are; unlike the backend spike's canvas, no manual
          height bookkeeping is needed here to center/stack correctly. */}
      {fixture.pages.map((page, i) => {
        const size = page.questions.length === 1 ? 'large' : 'small'
        return (
          <div key={page.pageId} className="print-page bg-white" style={{ ...SHEET, padding: '10mm' }}>
            <PageNumberBadge number={i + 1} isBonus={page.isBonus} />
            <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-10">
              {page.questions.map((question) => (
                <QuestionPanel key={question.question_id} mazeType={fixture.mazeType} question={question} size={size} answerKey={answerKey} />
              ))}
            </div>
          </div>
        )
      })}

      <LastPage level={fixture.level as LevelName} onReady={handleLastPageReady} />
    </div>
  )
}
