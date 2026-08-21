import { Fragment, useEffect, useMemo, useState } from 'react'
import { MONTH_NAMES } from '../types/maze'
import { hydrateDraftFromMazeData } from '../registry/pickaxe/wizardMaze'
import { coverContentFor, type CoverExample } from './coverTutorial'
import WallGrid from './WallGrid'

// The cover page, built on the designer's real `Front Cover.svg` used AS-IS.
//
// This replaces the approximated cover markup that used to live inline in
// PdfPreviewSpikePage.tsx (hand-rebuilt header/banner/direction-box that only
// resembled the template). pdf_export_spec.md §3's "build-from-template note"
// and pdf_design_spec.md §12.2 called this out as the intended end state.
//
// Structure, per the project owner's 2026-08-21 four-part breakdown:
//
//   Part 1  Header      — logo · "Name: ...." · level / month-week    } all three
//   Part 2  Title band  — gray full-width bar, "Let's do it", mascot  } live in
//   Part 4  Direction   — the white rounded container + its pill tab   } the SVG
//   Part 3  Body        — the watermark maze (added here)
//
// So the template supplies almost everything; only two things get composited:
// the watermark (Part 3) and the Direction box's contents (Part 4).
//
// **Layer order is what makes Part 3 / Part 4 behave as described.** The owner's
// requirement was "the 4th part will always be on the top hiding some part of
// the watermark background." That falls out for free from putting the watermark
// UNDERNEATH the template rather than compositing it in: the template already
// paints an opaque white rect over the header and an opaque white fill inside
// the Direction container (and an opaque gray fill for the title band), while
// the rest of the body area is transparent. So:
//
//   z0  watermark maze, page-width, low opacity
//   z1  Front Cover.svg, untouched          <- masks z0 exactly where required
//   z2  Direction-box contents
//
// No clip paths, no manual masking, and no edits to the designer's file. If the
// designer ships a new version of Front Cover.svg, it drops in and the masking
// keeps working.
//
// **Coordinate system.** The page wrapper is exactly 210mm x 297mm, and the
// template's viewBox is `0 0 595.28 841.89` — A4 at 72pt/in. 210mm is exactly
// 595.276pt, so **1 SVG user unit == 1 CSS pt** here. Every offset below is
// therefore written in `pt` and can be read straight off the template's own path
// data (see the measured region table). No conversion math anywhere.

const TEMPLATE_URL = '/components/svg/Front%20Cover.svg'
const PICKAXE_URL = '/components/svg/symbol-26.svg'

// The template's own palette, read out of its <style> block — deliberately NOT
// icons.tsx's INK/GRAY (#111111/#9D9F9E), which were pixel-measured off the
// raster sample. Text and borders added on top of this vector file should match
// the vector file. (The maze panels themselves keep icons.tsx's colors, since
// those must match real question pages, not the cover chrome.)
const TPL_INK = '#231f20'
const TPL_MID_GRAY = '#808285'
// Roboto is self-hosted as of 2026-08-21 — see the @font-face block in
// src/index.css, which also explains why families literally named `Roboto-Bold`
// and `Roboto-Medium` exist. Because of those, the template's own text now
// resolves correctly with no override from here, so this stack applies only to
// the text added on top of it. The fallbacks are belt-and-braces: this page is
// also the PDF's cover, and a missing font would show up as wrong metrics in a
// printed worksheet rather than as an obvious error.
const SANS_STACK = "Roboto, 'Helvetica Neue', Helvetica, Arial, sans-serif"

// --- Measured regions of Front Cover.svg (user units == pt) -----------------
// Page border rect:      x 23.96 .. 571.33   y  25.70 .. 816.03
// Header white rect:     x 23.96 .. 571.32   y  25.70 .. 139.78
// Title band (polyline): x 24.09 .. 571.18   y 130.80 .. 213.01
// Direction container:   x 70.87 .. 524.41   y 272.25 .. 669.10  (rx 13.26)
// "Direction" pill:      x 94.75 .. 186.19   y 290.31 .. 312.99
const BODY = { x: 23.96, y: 213.01, w: 547.37, h: 603.02 }
const BOX = { x: 70.87, y: 272.25, w: 453.54, h: 396.85 }

// Part 3 — "scale it to the width of the page", vertically centered in the body
// band. The maze is square, so page width fixes both dimensions; the body is
// taller than it is wide, which leaves ~28pt of breathing room top and bottom.
const WATERMARK = { x: BODY.x, y: BODY.y + (BODY.h - BODY.w) / 2, size: BODY.w }
const WATERMARK_OPACITY = 0.12

// Part 4 — Direction-box-local layout. The pill tab ends 40.74pt down; the whole
// content block (instruction lines + examples row, 247pt tall) is centered in
// the 337pt of box left below it.
// Vertically centered as one block in the 356pt of box below the pill:
// 48pt of instruction + 24pt gap + a 175pt examples row = 247pt, leaving 54.5pt
// above and below.
const INSTRUCTION = { top: 95.5, fontSize: 17, lineHeight: 24 }
const ROW = { top: 167.5, height: 175 }
const CORRECT = { left: 22, size: ROW.height }
// Horizontal budget: 22 + 175 (correct) + 20 (gap) + 214.54 (wrong) + 22 = 453.54.
// Inside the wrong container: 9 + 104 (caption) + 6 + 86 (maze) + 9 = 214.
const WRONG = { left: 217, w: 214.54, h: 108, pad: 9, textW: 104, gap: 6, mazeSize: 86, fontSize: 8, lineHeight: 11 }

// Inline pickaxe for the `{pickaxe}` token in the instruction/caption strings.
// Sized in `em` so it tracks whatever font size its line is set at.
function PickaxeInline() {
  return <img src={PICKAXE_URL} alt="" style={{ display: 'inline-block', height: '0.95em', verticalAlign: '-0.12em' }} />
}

// Splits on the `{pickaxe}` token and interleaves the real vector. Kept in
// normal inline flow (not flex) so the space before the token survives — a flex
// container would trim it off the end of the preceding item.
function LineWithPickaxe({ line }: { line: string }) {
  const parts = line.split('{pickaxe}')
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {part}
          {i < parts.length - 1 && <PickaxeInline />}
        </Fragment>
      ))}
    </>
  )
}

// One example maze, sized in pt. `decorated` turns on the cover-only sparkle +
// pickaxe-bubble callouts at each broken wall (pdf_design_spec.md §5).
function ExampleMaze({ example, size, decorated }: { example: CoverExample; size: number; decorated: boolean }) {
  const draft = useMemo(
    () => hydrateDraftFromMazeData(example.maze, example.solutionTrace),
    [example],
  )
  return (
    <div style={{ width: `${size}pt`, height: `${size}pt` }}>
      <WallGrid grid={draft.grid} path={draft.path} wavy tutorialDecorations={decorated} className="block h-full w-full" />
    </div>
  )
}

// Rewrites the designer's file for safe inlining, and fills in the two header
// fields that ship with sample placeholder values ("Kinder", "Aug / Week1").
//
// Why inline the markup instead of pointing an <img> at the file: an <img> is
// opaque to us, so the placeholder header text could not be replaced — it would
// have to be covered with a white patch rect and redrawn, which breaks the
// moment the designer nudges that text. Inlining keeps the file itself untouched
// on disk while still letting the real LevelProgress values land in the real
// text nodes.
function patchTemplate(raw: string, level: string, month: number, week: number): string {
  let svg = raw.slice(raw.indexOf('<svg'))

  // An inline <svg>'s <style> block is document-global, and the designer's
  // export uses maximally-generic class names (.cls-1 ... .cls-16). Namespace
  // them, plus the clipPath id and the layer id, so nothing leaks onto the
  // question pages sharing this document.
  svg = svg
    .replace(/cls-(\d+)/g, 'fcv-cls-$1')
    .replace(/clippath/g, 'fcv-clippath')
    .replace(/id="Layer_1"/, 'id="fcv-layer"')
    .replace('<svg ', '<svg width="100%" height="100%" ')

  const monthAbbr = MONTH_NAMES[month - 1].slice(0, 3)
  // Abbreviated deliberately: the field starts at x=460.72 and the page border
  // is at x=571.33, so a full month name ("September / Week4" at 14px) overflows
  // off the page. The template's own placeholder is abbreviated for the same
  // reason. pdf_export_spec.md §3 suggests also showing the year here; there is
  // no room for it in this field, so that stays an open question.
  return replaceTspan(
    replaceTspan(svg, 'Kinder', level.charAt(0).toUpperCase() + level.slice(1)),
    'Aug / Week1',
    `${monthAbbr} / Week${week}`,
  )
}

// Throws rather than silently leaving the placeholder in place: if a future
// version of Front Cover.svg renames or restructures these fields, a failed
// export is a much better outcome than a worksheet that says "Kinder" on every
// Primary sheet.
function replaceTspan(svg: string, placeholder: string, value: string): string {
  const needle = `<tspan x="0" y="0">${placeholder}</tspan>`
  if (!svg.includes(needle)) {
    throw new Error(`Front Cover.svg has no "${placeholder}" header field to fill in — template changed shape?`)
  }
  const escaped = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return svg.replace(needle, `<tspan x="0" y="0">${escaped}</tspan>`)
}

export interface CoverPageProps {
  mazeType: string
  level: string
  month: number
  week: number
  // Fired once the template markup is in the DOM *and* webfonts have finished
  // loading. The PDF service must not call page.pdf() before this: the template
  // arrives via fetch (after both `load` and `networkidle`), and printing before
  // Roboto resolves would lay the whole cover out on fallback metrics.
  onReady?: () => void
}

export default function CoverPage({ mazeType, level, month, week, onReady }: CoverPageProps) {
  const content = coverContentFor(mazeType)
  const [template, setTemplate] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(TEMPLATE_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`${TEMPLATE_URL} -> HTTP ${res.status}`)
        return res.text()
      })
      .then((raw) => {
        if (cancelled) return
        setTemplate(patchTemplate(raw, level, month, week))
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [level, month, week])

  useEffect(() => {
    if (!template) return
    let cancelled = false
    // document.fonts.ready settles once every font used by the current layout
    // has loaded or definitively failed, so this waits without hardcoding which
    // faces matter. It resolves immediately when they are already cached.
    document.fonts.ready.then(() => {
      if (!cancelled) onReady?.()
    })
    return () => {
      cancelled = true
    }
  }, [template, onReady])

  const watermarkDraft = useMemo(
    () => hydrateDraftFromMazeData(content.watermark.maze, content.watermark.solutionTrace),
    [content],
  )

  if (error) {
    return (
      <div className="print-page flex items-center justify-center bg-white" style={{ width: '210mm', height: '297mm' }}>
        <p className="max-w-sm text-center text-sm font-semibold text-red-700">Could not load the cover template: {error}</p>
      </div>
    )
  }

  return (
    <div className="print-page relative bg-white" style={{ width: '210mm', height: '297mm' }}>
      {/* z0 — Part 3, the watermark. Sits below the template, which masks it
          inside the header, the title band, and the Direction container. Drawn
          in the plain question-panel style (straight ideal line, no tutorial
          decorations): it is a scaled-up sample question, not a second teaching
          illustration. `showBorder={false}` — see WallGrid's prop docs; the
          panel frame does not survive being blown up to page width. */}
      <div
        style={{
          position: 'absolute',
          left: `${WATERMARK.x}pt`,
          top: `${WATERMARK.y}pt`,
          width: `${WATERMARK.size}pt`,
          height: `${WATERMARK.size}pt`,
          opacity: WATERMARK_OPACITY,
        }}
      >
        <WallGrid grid={watermarkDraft.grid} path={watermarkDraft.path} className="block h-full w-full" showBorder={false} />
      </div>

      {/* z1 — Parts 1, 2 and 4's shell: the designer's file, as-is. */}
      {template && (
        <div
          style={{ position: 'absolute', inset: 0 }}
          // Local static asset, authored by the project's own designer and
          // rewritten only by patchTemplate above — no user-supplied input
          // reaches this string.
          dangerouslySetInnerHTML={{ __html: template }}
        />
      )}

      {/* z2 — Part 4's contents, positioned in Direction-box-local pt. */}
      <div style={{ position: 'absolute', left: `${BOX.x}pt`, top: `${BOX.y}pt`, width: `${BOX.w}pt`, height: `${BOX.h}pt` }}>
        <div
          style={{
            position: 'absolute',
            top: `${INSTRUCTION.top}pt`,
            width: '100%',
            textAlign: 'center',
            fontFamily: SANS_STACK,
            fontWeight: 700,
            fontSize: `${INSTRUCTION.fontSize}pt`,
            lineHeight: `${INSTRUCTION.lineHeight}pt`,
            color: TPL_INK,
          }}
        >
          {/* The two lines are authored content, not reflowed text — the owner
              specified where the break falls ("...with a pickaxe" / "and reach
              the goal!"). nowrap keeps a font-metric change from silently
              re-breaking them somewhere else. */}
          {content.instructionLines.map((line) => (
            <div key={line} style={{ whiteSpace: 'nowrap' }}>
              <LineWithPickaxe line={line} />
            </div>
          ))}
        </div>

        {/* The correct example — hand-drawn wavy ideal line plus a sparkle and
            pickaxe-bubble callout at the one wall it breaks. */}
        <div style={{ position: 'absolute', left: `${CORRECT.left}pt`, top: `${ROW.top}pt` }}>
          <ExampleMaze example={content.correct} size={CORRECT.size} decorated />
        </div>

        {/* The counter-example, in its own bordered container: caption on the
            left, the over-breaking route on the right under a big ✗. */}
        <div
          style={{
            position: 'absolute',
            left: `${WRONG.left}pt`,
            top: `${ROW.top + (ROW.height - WRONG.h) / 2}pt`,
            width: `${WRONG.w}pt`,
            height: `${WRONG.h}pt`,
            boxSizing: 'border-box',
            padding: `${WRONG.pad}pt`,
            border: `1.5pt solid ${TPL_MID_GRAY}`,
            borderRadius: '8pt',
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            gap: `${WRONG.gap}pt`,
          }}
        >
          <div
            style={{
              width: `${WRONG.textW}pt`,
              fontFamily: SANS_STACK,
              fontWeight: 700,
              fontSize: `${WRONG.fontSize}pt`,
              lineHeight: `${WRONG.lineHeight}pt`,
              color: TPL_INK,
            }}
          >
            {/* Same reasoning as the instruction lines: three authored lines,
                not one paragraph. At 9pt these reflowed into five. */}
            {content.wrong.captionLines.map((line) => (
              <div key={line} style={{ whiteSpace: 'nowrap' }}>
                <LineWithPickaxe line={line} />
              </div>
            ))}
          </div>
          <div style={{ position: 'relative', width: `${WRONG.mazeSize}pt`, height: `${WRONG.mazeSize}pt` }}>
            {/* No sparkle/pickaxe-bubble callouts here — at this panel size two
                sets of them are unreadable, and the caption plus the ✗ already
                carry the point. */}
            <ExampleMaze example={content.wrong} size={WRONG.mazeSize} decorated={false} />
            <svg viewBox="0 0 100 100" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
              <g stroke={TPL_MID_GRAY} strokeWidth={5.5} strokeLinecap="round" opacity={0.85}>
                <line x1={18} y1={18} x2={82} y2={82} />
                <line x1={82} y1={18} x2={18} y2={82} />
              </g>
            </svg>
          </div>
        </div>
      </div>
    </div>
  )
}
