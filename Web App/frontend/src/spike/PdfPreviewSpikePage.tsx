import { useMemo, useState } from 'react'
import { MONTH_NAMES } from '../types/maze'
import { GRAY, INK, LaurelWreath, MascotBust, MascotFull } from './icons'
import { QuestionPanel } from './pdfMazeTypeRegistry'
import { sampleFixture } from './sampleFixture'
import type { SpikeFixture } from './types'

// render_via_browser.mjs's --data flag injects a real LevelProgress payload
// here via page.addInitScript before navigation (LevelProgress is a
// structural superset of SpikeFixture — see types.ts). Falls back to the
// hardcoded sample fixture when nothing was injected, so the plain `npm run
// dev` / manual-browser path (and the no-`--data` hybrid render) are
// unchanged.
declare global {
  interface Window {
    __PDF_FIXTURE_DATA__?: SpikeFixture
  }
}

function readFixture(): SpikeFixture {
  return window.__PDF_FIXTURE_DATA__ ?? sampleFixture
}

// Spike: renders the same fixture as ../../spikes/pdf-renderer/backend/render_reportlab.py
// using real app components plus browser print CSS, for comparing renderer
// technology per pdf_export_spec.md §7 item 5. Not a real route for the
// finished app — temporary, remove (or promote) once the tech decision
// lands. See this page's sibling README in the spikes/ folder for how to run
// the backend half and a side-by-side writeup.
//
// 2026-08-19 rework #1: this page previously used a dotted-background grid
// and emoji icons that didn't match the real sample (see Web App/docs/
// pdf_design_spec.md, written from directly measuring the sample's raster
// pages). Rebuilt against that doc via WallGrid/icons.tsx.
//
// 2026-08-19 rework #2: pulled the PickAxe-specific "badge + grid" question
// composition out into pdfMazeTypeRegistry.tsx's QuestionPanel, mirroring
// the backend spike's QUESTION_TYPES dict — this page (and the backend's
// compose_question_page) now have zero PickAxe-specific layout knowledge,
// just "arrange N of whatever this maze type's question unit is." Also
// added the single-question preview mode below, matching the backend's
// `--preview-question` flag — a new maze type's question design can be
// built and checked in isolation before it's ever arranged onto a sheet.

// level_dashboard_pagination_spec.md §4.4 — `isBonus` is a manual per-row
// flag now, not computed from star rating (pdf_design_spec.md §7's laurel
// wreath replaces the plain box entirely on a Bonus row, it doesn't overlay
// on top of it).
function PageNumberBadge({ number, isBonus }: { number: number; isBonus: boolean }) {
  if (isBonus) {
    return (
      <svg viewBox="0 0 48 48" className="mb-4 block h-12 w-12">
        <LaurelWreath cx={24} cy={24} width={40} number={number} />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 48 48" className="mb-4 block h-12 w-12">
      <rect x={2} y={2} width={44} height={44} fill="white" stroke={INK} strokeWidth={0.8} />
      <text x={24} y={31} textAnchor="middle" fontSize={20} fontWeight="bold" fill={INK}>
        {number}
      </text>
    </svg>
  )
}

export default function PdfPreviewSpikePage() {
  const [answerKey, setAnswerKey] = useState(false)
  const [previewIndex, setPreviewIndex] = useState<number | 'sheet'>('sheet')
  const fixture = useMemo(readFixture, [])

  const coverQuestion = fixture.pages[0].questions[0]
  const questionPages = fixture.pages.slice(1)
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

  // Shared print/screen CSS — hoisted above the branch below (rather than
  // living only in the "full sheet" return) so a headless browser printing
  // ANY view of this page (including the single-question preview) still
  // hides the .no-print toolbar. Missing that on the single-question branch
  // was a real bug caught while building the hybrid renderer spike: a
  // headless-browser PDF of a "Question 3" preview was including the
  // toolbar controls in the printed output.
  const printStyle = (
    <style>{`
      @media print {
        @page { size: A4; margin: 10mm; }
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
  // page/badge-position/wreath chrome, no sheet context. Mirrors the
  // backend's render_question_preview: build and check a maze type's
  // question design on its own before it's arranged onto a sheet page.
  if (previewIndex !== 'sheet') {
    const question = allQuestions[previewIndex]
    return (
      <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:p-0">
        {printStyle}
        {toolbar}
        <div className="print-page mx-auto w-96 rounded bg-white p-8 shadow">
          <QuestionPanel mazeType={fixture.mazeType} question={question} size="large" answerKey={answerKey} />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:p-0">
      {printStyle}

      {toolbar}

      {/* Cover / Direction page */}
      <div className="print-page min-h-[277mm] w-[210mm] border-2 bg-white p-[10mm]" style={{ borderColor: INK }}>
        <div className="flex items-baseline justify-between border-b pb-2" style={{ borderColor: INK }}>
          <div>
            <div className="text-[9px]" style={{ color: INK }}>
              Think! Think!
            </div>
            <div className="text-xl font-bold leading-tight" style={{ color: INK }}>
              Think!
              <br />
              Think!
            </div>
          </div>
          <span className="text-sm" style={{ color: INK }}>
            Name: <span className="border-b border-dashed border-slate-400 pb-0.5">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
          </span>
          <div className="border-l pl-4 text-right" style={{ borderColor: INK }}>
            <div className="text-sm font-bold" style={{ color: INK }}>
              {fixture.level.charAt(0).toUpperCase() + fixture.level.slice(1)}
            </div>
            <div className="text-xs font-bold text-slate-600">
              {MONTH_NAMES[fixture.month - 1]} / Week{fixture.week}
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between px-4 py-5" style={{ backgroundColor: GRAY }}>
          <span className="text-3xl font-bold text-white">Let&apos;s do it</span>
          <svg viewBox="0 0 100 100" className="h-16 w-16">
            <MascotBust cx={50} cy={50} size={80} />
          </svg>
        </div>

        <div className="relative mt-4 rounded-2xl border-2 p-4 pt-6" style={{ borderColor: GRAY }}>
          <span className="absolute -top-3 left-4 rounded-full px-3 py-1 text-xs font-bold text-white" style={{ backgroundColor: GRAY }}>
            Direction
          </span>
          <p className="text-center text-sm font-bold" style={{ color: INK }}>
            Let&apos;s break the walls with a pickaxe and reach the goal!
          </p>
          <div className="mt-4 flex items-start justify-center gap-10">
            <div className="w-48">
              {/* Reuses the same registered PickAxe question unit as every real
                  question page — the cover's "correct example" is literally one
                  instance of it with tutorialDecorations turned on, not a
                  separately-coded illustration. */}
              <QuestionPanel mazeType={fixture.mazeType} question={coverQuestion} size="small" answerKey={false} tutorialDecorations />
            </div>
            <div className="flex w-48 flex-col items-center justify-center gap-2">
              <svg viewBox="0 0 60 60" className="h-14 w-14">
                <circle cx={30} cy={30} r={26} fill={GRAY} />
                <line x1={20} y1={20} x2={40} y2={40} stroke="white" strokeWidth={4} />
                <line x1={20} y1={40} x2={40} y2={20} stroke="white" strokeWidth={4} />
              </svg>
              <p className="text-center text-xs font-bold" style={{ color: INK }}>
                You can only break the same number of walls as the pickaxes you have.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Question pages, one per PageRow. This loop has NO PickAxe-specific
          layout knowledge — QuestionPanel looks up whichever maze type's
          question unit is registered, and the flex column below just stacks
          however many there are; unlike the backend spike's canvas, no
          manual height bookkeeping is needed here to center/stack correctly,
          the browser does that regardless of what a given maze type's panel
          renders internally (see this spike's README for why that matters). */}
      {questionPages.map((page, i) => {
        const pageNumber = i + 1
        const size = page.questions.length === 1 ? 'large' : 'small'
        return (
          <div key={page.pageId} className="print-page min-h-[277mm] w-[210mm] bg-white p-[10mm]">
            <PageNumberBadge number={pageNumber} isBonus={page.isBonus} />
            <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-10">
              {page.questions.map((question) => (
                <QuestionPanel key={question.question_id} mazeType={fixture.mazeType} question={question} size={size} answerKey={answerKey} />
              ))}
            </div>
          </div>
        )
      })}

      {/* Bonus page */}
      <div className="print-page flex min-h-[277mm] w-[210mm] flex-col items-center border-2 bg-white p-[10mm]" style={{ borderColor: INK }}>
        <svg viewBox="0 0 220 50" className="mb-4 h-12 w-56 self-start">
          <polygon points="0,0 200,0 185,25 200,50 0,50 15,25" fill={GRAY} />
          <text x={100} y={30} textAnchor="middle" fontSize={16} fontWeight="bold" fill="white">
            Bonus Challenge
          </text>
        </svg>
        <h2 className="text-2xl font-bold" style={{ color: INK, WebkitTextStroke: '1.5px white', paintOrder: 'stroke' }}>
          Be a mission maker!
        </h2>
        <p className="mt-1 flex items-center gap-3 text-sm font-bold" style={{ color: INK }}>
          <span className="h-px w-8" style={{ backgroundColor: INK }} />
          Let&apos;s create your own original mission!
          <span className="h-px w-8" style={{ backgroundColor: INK }} />
        </p>
        <div className="mt-8 h-[160mm] w-full" />
        <p className="text-lg font-bold" style={{ color: INK }}>
          I did it!
        </p>
        <svg viewBox="0 0 100 100" className="h-24 w-24">
          <MascotFull cx={50} cy={50} size={70} />
        </svg>
      </div>
    </div>
  )
}
