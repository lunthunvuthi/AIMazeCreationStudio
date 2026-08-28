import { Fragment, useEffect, useMemo, useState } from 'react'
import { MONTH_NAMES } from '../types/maze'
import { hydrateDraftFromMazeData } from '../registry/pickaxe/wizardMaze'
import { coverContentFor, type CoverExample } from './coverTutorial'
import { Badge } from './pdfMazeTypeRegistry'
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
// Header divider (line): x 450.30            y  63.81 .. 106.33
// Level field text:      translate(473.92 82.49)   18px Roboto-Bold
// Period field text:     translate(460.72 102.53)  14px Roboto-Bold
// The level / period block lives between the header's vertical divider and the
// page border, so this is the horizontal room it actually has. Both header lines
// are re-anchored to its centre — see `fillHeaderField`.
const HEADER_FIELD = { left: 450.3, right: 571.33 }
const HEADER_CENTRE = (HEADER_FIELD.left + HEADER_FIELD.right) / 2 // 510.815

const BODY = { x: 23.96, y: 213.01, w: 547.37, h: 603.02 }
const BOX = { x: 70.87, y: 272.25, w: 453.54, h: 396.85 }

// Part 3 — the watermark, sized and placed against three constraints the owner
// set on 2026-08-21:
//   * bigger than the page, not merely page-width;
//   * the Start figure's head and body must clear the Direction box (which
//     covers y 272.25..669.10) — only its legs may be cut off;
//   * it carries the pickaxe badge, like a real question panel.
// Those pull against each other: scaling up alone pushes the figure's head
// *further* under the box, because the figure sits in the bottom row and grows
// upward from its cell centre. So the panel is pushed down as it grows, and the
// overflow is clipped to the body band rather than left to run off the sheet —
// unclipped overflow on a fixed-height print page can spill into an extra blank
// PDF page.
//   maze top 267 + 0.7 x 620 puts the figure's head at y 703, 34pt clear of the box;
//   maze bottom 887 is clipped at the body's 816 — that clip is the legs.
// `left` is negative so the 620pt maze stays centred on the 547.37pt body and
// bleeds equally off both sides.
const WATERMARK = {
  size: 620,
  left: (BODY.w - 620) / 2,
  top: 54,
  badgeTop: 6,
  badgeHeight: 40,
  // The badge can't sit directly above the maze — that lands it under the title
  // band, which is opaque. It goes in the 59pt strip between the band and the
  // Direction box, aligned to the body's visible left edge rather than to the
  // maze's clipped one.
  badgeLeft: 10,
  opacity: 0.12,
}

// Part 4 — Direction-box-local layout. The pill tab ends 40.74pt down.
// Vertical rhythm: 23pt pill -> instruction (tightened on the owner's request,
// 2026-08-21), 24pt instruction -> examples, 46pt below. Closing the pill gap
// without also closing the one below it just moves the empty space into the
// middle of the box, which looks worse than having it at the bottom — so both
// gaps are set together.
const INSTRUCTION = { top: 64, fontSize: 17, lineHeight: 24 }
// Each example is a full question unit now — badge above, maze below — so the
// row is 20 + 4 + 191 = 215pt tall.
const ROW = { top: 136, height: 215 }
const CORRECT = { left: 14, size: 191, badgeHeight: 20, badgeGap: 4 }
// Horizontal budget: 14 + 191 (correct) + 20 (gap) + 214.54 (wrong) + 14 = 453.54.
// Side padding came down from 22 to 14 to buy the correct example those extra
// 16pt — it is the panel a child actually reads, so it gets the width.
// Inside the wrong container: 9 + 104 (caption) + 6 + 86 (maze) + 9 = 214.
// Height: 9 + (14 badge + 3 + 86 maze) + 9 = 121.
const WRONG = {
  left: 225, w: 214.54, h: 121, pad: 9, textW: 104, gap: 6,
  mazeSize: 86, badgeHeight: 14, badgeGap: 3, fontSize: 8, lineHeight: 11,
  cornerMark: 22,
}

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

// One example maze as a complete question unit — pickaxe badge above, maze
// below — matching how every real question page presents one (pdf_design_spec.md
// §6.4). The badge was missing here until the owner flagged it on 2026-08-21;
// without it the cover teaches the pickaxe rule using a panel that doesn't show
// how many pickaxes you get, which is the very thing the rule is about.
// `decorated` turns on the cover-only sparkle + pickaxe-bubble callouts at each
// broken wall (pdf_design_spec.md §5).
function ExampleMaze({
  example,
  size,
  decorated,
  badgeHeight,
  badgeGap,
}: {
  example: CoverExample
  size: number
  decorated: boolean
  badgeHeight: number
  badgeGap: number
}) {
  const draft = useMemo(
    () => hydrateDraftFromMazeData(example.maze, example.solutionTrace),
    [example],
  )
  return (
    <div style={{ width: `${size}pt` }}>
      <div style={{ marginBottom: `${badgeGap}pt` }}>
        <Badge pickaxeCount={example.maze.pickaxe_count} heightPt={badgeHeight} className="" />
      </div>
      <div style={{ width: `${size}pt`, height: `${size}pt` }}>
        <WallGrid grid={draft.grid} path={draft.path} wavy tutorialDecorations={decorated} className="block h-full w-full" />
      </div>
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
function patchTemplate(raw: string, level: string, year: number, month: number, week: number): string {
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
    // Thicken the "Name:" fill line. The designer draws it as `stroke-dasharray:
    // 0 5` with a round cap — i.e. a row of dots — but at 0.5px they are nearly
    // invisible in print, which read as "Name:" followed by blank space. 1.8px
    // in the mid grey renders as the row of dots a child can write on. Appended
    // after the designer's own <style> so it wins on a specificity tie; the file
    // on disk is still untouched.
    .replace('</defs>', '<style>.fcv-cls-2 { stroke-width: 1.8px; stroke: #808285; }</style></defs>')

  const monthAbbr = MONTH_NAMES[month - 1].slice(0, 3)
  // The month stays abbreviated: "September / Week1" measures 123.9pt against
  // 121pt of field, so a full month name overflows the page border even when
  // perfectly centred. The template's own placeholder is abbreviated for the
  // same reason.
  //
  // The YEAR is included as of 2026-08-28, closing pdf_export_spec.md §3's open
  // question. That question recorded "there is no room for it", which came from
  // an estimate; measured against the real Roboto-Bold at the designer's 14px,
  // the worst case of every month x week 1..52 is:
  //
  //     May 2026 / Week10   125.2pt   does NOT fit (121pt of field)
  //     May 2026 / Wk10     110.3pt   fits, 5.3pt clear each side   <- chosen
  //     May 2026 / W10      102.8pt   fits, but "W10" reads worse
  //     May 2026 / Week10   at 12px    99.1pt  fits, below designer's size
  //
  // So the year fits at full size only with "Week" shortened to "Wk". If the
  // owner prefers a different label, this template string is the only thing to
  // change — the centring below absorbs any width.
  return fillHeaderField(
    fillHeaderField(svg, 'Kinder', level.charAt(0).toUpperCase() + level.slice(1)),
    'Aug / Week1',
    `${monthAbbr} ${year} / Wk${week}`,
  )
}

// Substitutes one header field's placeholder text AND re-anchors that line to
// the centre of the field, so the string's width no longer decides where it
// sits.
//
// The designer left-anchors both lines ("Kinder" at x=473.92, "Aug / Week1" at
// x=460.72) at widths chosen for those exact sample strings — each is centred on
// x≈500.5 for the sample values and drifts as soon as the value changes length.
// "Advanced" and a two-digit week both push right, toward the page border. With
// `text-anchor="middle"` the line self-centres at any length, which is what
// makes the year affordable: the growth is shared between both margins instead
// of all landing on the border side.
//
// Both lines move to the same centre (510.815, the geometric middle of
// divider..border) rather than the designer's ~500.5, for two reasons: they must
// share a centre or they visually misalign with each other, and 500.5 leaves
// only 100.4pt of symmetric room — not enough for the year at full size. The
// visible effect is a ~10pt rightward shift of a two-line block that currently
// sits with a 10pt gap on its left and a 30pt gap on its right, so it reads as
// better balanced, not moved.
//
// Throws rather than silently leaving the placeholder in place: if a future
// version of Front Cover.svg renames or restructures these fields, a failed
// export is a much better outcome than a worksheet that says "Kinder" on every
// Primary sheet.
function fillHeaderField(svg: string, placeholder: string, value: string): string {
  // Matches the whole <text> wrapper so the transform can be rewritten with it.
  // The y offset is captured and kept — only x moves.
  const pattern = new RegExp(
    `<text([^>]*?)transform="translate\\(([\\d.]+) ([\\d.]+)\\)"([^>]*)><tspan x="0" y="0">${placeholder}</tspan></text>`,
  )
  const match = svg.match(pattern)
  if (!match) {
    throw new Error(`Front Cover.svg has no "${placeholder}" header field to fill in — template changed shape?`)
  }
  const [, before, , y, after] = match
  const escaped = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return svg.replace(
    pattern,
    `<text${before}transform="translate(${HEADER_CENTRE} ${y})"${after} text-anchor="middle">` +
      `<tspan x="0" y="0">${escaped}</tspan></text>`,
  )
}

export interface CoverPageProps {
  mazeType: string
  level: string
  year: number
  month: number
  week: number
  // Fired once the template markup is in the DOM *and* webfonts have finished
  // loading. The PDF service must not call page.pdf() before this: the template
  // arrives via fetch (after both `load` and `networkidle`), and printing before
  // Roboto resolves would lay the whole cover out on fallback metrics.
  onReady?: () => void
}

export default function CoverPage({ mazeType, level, year, month, week, onReady }: CoverPageProps) {
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
        setTemplate(patchTemplate(raw, level, year, month, week))
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [level, year, month, week])

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
          panel frame does not survive being blown up to page width.
          The wrapper is the body band with `overflow: hidden`, which is what
          lets the maze be larger than the page — see WATERMARK's comment. */}
      <div
        style={{
          position: 'absolute',
          left: `${BODY.x}pt`,
          top: `${BODY.y}pt`,
          width: `${BODY.w}pt`,
          height: `${BODY.h}pt`,
          overflow: 'hidden',
          opacity: WATERMARK.opacity,
        }}
      >
        <div style={{ position: 'absolute', left: `${WATERMARK.badgeLeft}pt`, top: `${WATERMARK.badgeTop}pt` }}>
          <Badge pickaxeCount={content.watermark.maze.pickaxe_count} heightPt={WATERMARK.badgeHeight} className="" />
        </div>
        <div
          style={{
            position: 'absolute',
            left: `${WATERMARK.left}pt`,
            top: `${WATERMARK.top}pt`,
            width: `${WATERMARK.size}pt`,
            height: `${WATERMARK.size}pt`,
          }}
        >
          <WallGrid grid={watermarkDraft.grid} path={watermarkDraft.path} className="block h-full w-full" showBorder={false} />
        </div>
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
          <ExampleMaze
            example={content.correct}
            size={CORRECT.size}
            decorated
            badgeHeight={CORRECT.badgeHeight}
            badgeGap={CORRECT.badgeGap}
          />
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
          {/* ✗-in-a-circle straddling the top-left corner, owner-requested
              2026-08-21. It labels the whole container as the counter-example
              — distinct from the large ✗ over the maze itself, which marks the
              specific answer as wrong. Centred on the corner rather than placed
              inside it: the container is only 121pt tall and its interior is
              fully spoken for by the caption and the maze. */}
          <svg
            viewBox="0 0 24 24"
            style={{
              position: 'absolute',
              left: `${-WRONG.cornerMark / 2}pt`,
              top: `${-WRONG.cornerMark / 2}pt`,
              width: `${WRONG.cornerMark}pt`,
              height: `${WRONG.cornerMark}pt`,
              overflow: 'visible',
            }}
          >
            <circle cx={12} cy={12} r={10.5} fill="#fff" stroke={TPL_MID_GRAY} strokeWidth={1.8} />
            <g stroke={TPL_MID_GRAY} strokeWidth={2.6} strokeLinecap="round">
              <line x1={7.5} y1={7.5} x2={16.5} y2={16.5} />
              <line x1={16.5} y1={7.5} x2={7.5} y2={16.5} />
            </g>
          </svg>
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
          <div style={{ position: 'relative', width: `${WRONG.mazeSize}pt` }}>
            {/* No sparkle/pickaxe-bubble callouts here — at this panel size two
                sets of them are unreadable, and the caption plus the ✗ already
                carry the point. The badge IS shown: the whole point of this
                panel is "you used 2 walls but have only 1 pickaxe", which is
                unreadable if the pickaxe count isn't on the panel. */}
            <ExampleMaze
              example={content.wrong}
              size={WRONG.mazeSize}
              decorated={false}
              badgeHeight={WRONG.badgeHeight}
              badgeGap={WRONG.badgeGap}
            />
            {/* Offset down by the badge's height so the ✗ covers the maze only,
                not the pickaxe count the reader needs to see. */}
            <svg
              viewBox="0 0 100 100"
              style={{
                position: 'absolute',
                left: 0,
                top: `${WRONG.badgeHeight + WRONG.badgeGap}pt`,
                width: `${WRONG.mazeSize}pt`,
                height: `${WRONG.mazeSize}pt`,
              }}
            >
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
