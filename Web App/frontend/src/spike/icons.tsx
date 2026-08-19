// Spike-only SVG icon set matching Web App/docs/pdf_design_spec.md's measured
// vector designs — replaces this spike's first pass, which used generic emoji
// (🚶/🏁/⛏️) that didn't match the sample's actual icon shapes at all. Mirrors
// the backend spike's reportlab drawing functions
// (../../../spikes/pdf-renderer/backend/render_reportlab.py) shape-for-shape
// so the two renderer-tech spikes are a fair comparison again.
//
// 2026-08-19 rework #3: the designer dropped real vector source files at
// Web App/frontend/public/components/svg/ (see pdf_design_spec.md §12 for the
// full per-file catalog). Start/Goal/pickaxe/laurel/both mascots below are now
// that real artwork (served statically from /components/svg/... via Vite's
// public dir) instead of hand-drawn approximations of the measured shapes.
// BrokenFlagIcon/SparkleIcon/BreakCallout stay hand-drawn — no vector source
// covers the cover's tutorial-only decorations.

export const INK = '#111111'
export const GRAY = '#9D9F9E'

const SVG_BASE = '/components/svg'

// Fits a real vector asset's own viewBox into a `size`-diameter box centered
// on (cx, cy), preserving aspect ratio — the shared primitive every icon
// below is built from.
function VectorAsset({
  file,
  cx,
  cy,
  size,
  vbW,
  vbH,
}: {
  file: string
  cx: number
  cy: number
  size: number
  vbW: number
  vbH: number
}) {
  const scale = size / Math.max(vbW, vbH)
  const w = vbW * scale
  const h = vbH * scale
  const href = `${SVG_BASE}/${file}`
  return <image href={href} xlinkHref={href} x={cx - w / 2} y={cy - h / 2} width={w} height={h} />
}

function starPoints(cx: number, cy: number, n: number, rOuter: number, rInner: number, phaseDeg = -90) {
  const points: string[] = []
  for (let i = 0; i < n * 2; i++) {
    const angle = ((phaseDeg + (i * 180) / n) * Math.PI) / 180
    const r = i % 2 === 0 ? rOuter : rInner
    points.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`)
  }
  return points.join(' ')
}

// pdf_design_spec.md §6.3 / §12.1 — real vector, symbol-16.svg. Walking stick
// figure, Start icon on every panel.
export function StartIcon({ cx, cy, size }: { cx: number; cy: number; size: number }) {
  return <VectorAsset file="symbol-16.svg" cx={cx} cy={cy} size={size} vbW={49.21} vbH={75.75} />
}

// pdf_design_spec.md §6.3 / §12.1 — real vector, symbol-17.svg. Pole + square
// frame + star. The ONLY goal icon used on real question/answer-key panels
// (contrast with BrokenFlagIcon, which is the cover's deliberately-"damaged"
// incorrect-example-only shape, still hand-drawn — no vector source for it).
export function GoalIcon({ cx, cy, size }: { cx: number; cy: number; size: number }) {
  return <VectorAsset file="symbol-17.svg" cx={cx} cy={cy} size={size} vbW={122.02} vbH={122.02} />
}

// pdf_design_spec.md §5 — deliberately tilted/"broken" pennant, cover
// incorrect-example only. Not a general-purpose alternate Goal icon.
export function BrokenFlagIcon({ cx, cy, size }: { cx: number; cy: number; size: number }) {
  return (
    <g transform={`translate(${cx},${cy}) rotate(-18)`} stroke={INK} fill={INK}>
      <line x1={-size * 0.1} y1={size * 0.32} x2={-size * 0.1} y2={-size * 0.3} strokeWidth={size * 0.045} />
      <polygon points={`${-size * 0.1},${-size * 0.3} ${-size * 0.1},${-size * 0.08} ${size * 0.3},${-size * 0.2}`} />
    </g>
  )
}

// pdf_design_spec.md §6.4 / §12.1 — real vector, symbol-26.svg. Single
// pickaxe glyph, repeated per pickaxe_count in the badge above each panel.
export function PickaxeIcon({ cx, cy, size }: { cx: number; cy: number; size: number }) {
  return <VectorAsset file="symbol-26.svg" cx={cx} cy={cy} size={size} vbW={28.86} vbH={30.04} />
}

// pdf_design_spec.md §7 / §12.1 — real vector, symbol-19.svg (the laurel
// wreath with NO number baked in — symbol-18.svg's baked "5" is a worked
// example, not a reusable template, see §7). This is what a "Bonus" page's
// number box renders instead of the plain rectangle (level_dashboard_
// pagination_spec.md §4.4) — the wreath plus the row's real page number,
// positioned at roughly the same relative anchor symbol-18.svg's live text
// sits at within its 57.96×47.08 viewBox. `width` is the wreath's rendered
// width; height follows from its own aspect ratio.
export function LaurelWreath({ cx, cy, width, number }: { cx: number; cy: number; width: number; number: number }) {
  const vbW = 57.96
  const vbH = 47.08
  const scale = width / vbW
  const height = vbH * scale
  const x = cx - width / 2
  const y = cy - height / 2
  const href = `${SVG_BASE}/symbol-19.svg`
  return (
    <g>
      <image href={href} xlinkHref={href} x={x} y={y} width={width} height={height} />
      <text
        x={x + 19.83 * scale}
        y={y + 26.42 * scale}
        fontSize={30 * scale}
        fontWeight="600"
        fontFamily="'Futura', 'Century Gothic', sans-serif"
        fill={INK}
      >
        {number}
      </text>
    </g>
  )
}

// pdf_design_spec.md §5 — 8-point sparkle/burst marking a wall-break point.
// Cover tutorial illustration only.
export function SparkleIcon({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return <polygon points={starPoints(cx, cy, 8, r, r * 0.55)} fill="white" stroke={GRAY} strokeWidth={0.8} />
}

// pdf_design_spec.md §5 — pickaxe-in-speech-bubble callout at a wall-break
// point. Cover tutorial illustration only.
export function BreakCallout({ x, y, size }: { x: number; y: number; size: number }) {
  const w = size
  const h = size * 0.85
  const r = size * 0.22
  return (
    <g>
      <path
        d={`M ${x + r} ${y} H ${x + w - r} A ${r} ${r} 0 0 1 ${x + w} ${y + r} V ${y + h - r} A ${r} ${r} 0 0 1 ${x + w - r} ${y + h} H ${x + r} A ${r} ${r} 0 0 1 ${x} ${y + h - r} V ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`}
        fill="white"
        stroke={GRAY}
      />
      <polygon points={`${x + w * 0.15},${y + h} ${x + w * 0.35},${y + h} ${x - w * 0.05},${y + h + size * 0.35}`} fill="white" stroke={GRAY} />
      <PickaxeIcon cx={x + w / 2} cy={y + h / 2} size={size * 0.55} />
    </g>
  )
}

// pdf_design_spec.md §4 / §12.1 — real vector, symbol.svg. Hatenyan,
// bust/chest crop, title-banner pose. This company's own
// confirmed-safe-to-reproduce IP (see pdf_export_spec.md §0) — already
// embedded directly inside Front Cover.svg itself (§12.2); this component is
// for anywhere the cover is built up programmatically instead.
export function MascotBust({ cx, cy, size }: { cx: number; cy: number; size: number }) {
  return <VectorAsset file="symbol.svg" cx={cx} cy={cy} size={size} vbW={89.43} vbH={113.05} />
}

// pdf_design_spec.md §9 / §12.1 — real vector, symbol-22.svg. Full-body
// Hatenyan — a different pose than the sample's squinting ">"/"<" eyes, but
// approved 2026-08-19 as the interim placeholder for this slot regardless
// (see §9's note — swap for a pose-accurate vector later if one shows up).
export function MascotFull({ cx, cy, size }: { cx: number; cy: number; size: number }) {
  return <VectorAsset file="symbol-22.svg" cx={cx} cy={cy} size={size} vbW={85.04} vbH={85.04} />
}
