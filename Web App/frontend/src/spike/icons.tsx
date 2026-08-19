// Spike-only SVG icon set matching Web App/docs/pdf_design_spec.md's measured
// vector designs — replaces this spike's first pass, which used generic emoji
// (🚶/🏁/⛏️) that didn't match the sample's actual icon shapes at all. Mirrors
// the backend spike's reportlab drawing functions
// (../../../spikes/pdf-renderer/backend/render_reportlab.py) shape-for-shape
// so the two renderer-tech spikes are a fair comparison again.

export const INK = '#111111'
export const GRAY = '#9D9F9E'

function starPoints(cx: number, cy: number, n: number, rOuter: number, rInner: number, phaseDeg = -90) {
  const points: string[] = []
  for (let i = 0; i < n * 2; i++) {
    const angle = ((phaseDeg + (i * 180) / n) * Math.PI) / 180
    const r = i % 2 === 0 ? rOuter : rInner
    points.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`)
  }
  return points.join(' ')
}

// pdf_design_spec.md §6.3 — walking stick figure, Start icon on every panel.
export function StartIcon({ cx, cy, size }: { cx: number; cy: number; size: number }) {
  const headR = size * 0.14
  const headCy = cy - size * 0.28
  const bodyTop = headCy + headR
  const bodyBottom = cy + size * 0.22
  return (
    <g stroke={INK} strokeWidth={size * 0.05} fill="none" strokeLinecap="round">
      <circle cx={cx} cy={headCy} r={headR} fill={INK} stroke="none" />
      <line x1={cx} y1={bodyTop} x2={cx} y2={bodyBottom} />
      <line x1={cx} y1={bodyTop + size * 0.08} x2={cx - size * 0.18} y2={bodyTop + size * 0.22} />
      <line x1={cx} y1={bodyTop + size * 0.08} x2={cx + size * 0.18} y2={bodyTop + size * 0.22} />
      <line x1={cx} y1={bodyBottom} x2={cx - size * 0.16} y2={cy + size * 0.4} />
      <line x1={cx} y1={bodyBottom} x2={cx + size * 0.16} y2={cy + size * 0.4} />
    </g>
  )
}

// pdf_design_spec.md §6.3 — pole + square frame + star. The ONLY goal icon
// used on real question/answer-key panels (contrast with BrokenFlagIcon,
// which is the cover's deliberately-"damaged" incorrect-example-only shape).
export function GoalIcon({ cx, cy, size }: { cx: number; cy: number; size: number }) {
  const poleBottom = cy + size * 0.32
  const poleTop = cy - size * 0.34
  const ballR = size * 0.045
  const frameSize = size * 0.44
  const frameX = cx - size * 0.05
  const frameY = poleTop
  return (
    <g>
      <line x1={cx - size * 0.22} y1={poleBottom} x2={cx - size * 0.22} y2={poleTop} stroke={INK} strokeWidth={size * 0.05} />
      <circle cx={cx - size * 0.22} cy={poleTop - ballR} r={ballR} fill={INK} />
      <rect x={frameX} y={frameY} width={frameSize} height={frameSize} fill="none" stroke={INK} strokeWidth={size * 0.045} />
      <polygon
        points={starPoints(frameX + frameSize / 2, frameY + frameSize / 2, 5, frameSize * 0.34, frameSize * 0.15)}
        fill={INK}
      />
    </g>
  )
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

// pdf_design_spec.md §6.4 — single pickaxe glyph, repeated per pickaxe_count
// in the badge above each panel.
export function PickaxeIcon({ cx, cy, size }: { cx: number; cy: number; size: number }) {
  return (
    <g stroke={INK} strokeLinecap="round" fill="none">
      <line x1={cx - size * 0.28} y1={cy + size * 0.32} x2={cx + size * 0.3} y2={cy - size * 0.32} strokeWidth={size * 0.16} />
      <line x1={cx - size * 0.4} y1={cy - size * 0.1} x2={cx - size * 0.08} y2={cy - size * 0.42} strokeWidth={size * 0.22} />
    </g>
  )
}

// pdf_design_spec.md §7 — plain ink-black laurel sprigs flanking the page
// number on the sheet's highest-star row(s). half_h keeps the whole sprig
// within the number box's own vertical span.
export function LaurelWreath({ cx, cy, halfH }: { cx: number; cy: number; halfH: number }) {
  const leafW = halfH * 0.32
  const leafH = halfH * 0.14
  const sides = [-1, 1] as const
  return (
    <g>
      {sides.map((side) => {
        const stemX = cx + side * halfH * 0.75
        const points = [0, 1, 2, 3].map((i) => ({ x: stemX, y: cy + halfH * 0.85 - i * halfH * 0.55 }))
        return (
          <g key={side}>
            <polyline points={points.map((p) => `${p.x},${p.y}`).join(' ')} stroke={INK} strokeWidth={0.5} fill="none" />
            {points.slice(1).map((p, i) => (
              <ellipse
                key={i}
                cx={p.x + side * leafW * 0.3}
                cy={p.y}
                rx={leafW / 2}
                ry={leafH / 2}
                fill={INK}
                transform={`rotate(${side * 35}, ${p.x + side * leafW * 0.3}, ${p.y})`}
              />
            ))}
          </g>
        )
      })}
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

// pdf_design_spec.md §4 — Hatenyan, bust/chest crop, title-banner pose. This
// company's own confirmed-safe-to-reproduce IP (see pdf_export_spec.md §0),
// simplified to flat vector shapes for this spike.
export function MascotBust({ cx, cy, size }: { cx: number; cy: number; size: number }) {
  const headR = size * 0.42
  const headCy = cy - size * 0.15
  return (
    <g>
      <circle cx={cx} cy={headCy} r={headR} fill={INK} />
      <polygon
        points={`${cx - headR * 0.7},${headCy - headR} ${cx - headR * 1.15},${headCy - headR * 1.7} ${cx - headR * 0.15},${headCy - headR * 1.15}`}
        fill={INK}
      />
      <polygon
        points={`${cx + headR * 0.7},${headCy - headR} ${cx + headR * 1.15},${headCy - headR * 1.7} ${cx + headR * 0.15},${headCy - headR * 1.15}`}
        fill={INK}
      />
      <rect x={cx - size * 0.42} y={cy - size * 0.15} width={size * 0.85} height={size * 0.55} rx={size * 0.17} fill={INK} />
      {[-1, 1].map((side) => (
        <g key={side}>
          <circle cx={cx + side * headR * 0.42} cy={headCy - size * 0.18} r={headR * 0.22} fill="white" />
          <circle cx={cx + side * headR * 0.42} cy={headCy - size * 0.18} r={headR * 0.1} fill={INK} />
          <rect
            x={cx + side * headR * 0.42 - headR * 0.13}
            y={headCy - size * 0.18 - headR * 1.6 - headR * 0.026}
            width={headR * 0.26}
            height={headR * 0.052}
            fill={INK}
            transform={`rotate(${side * 12}, ${cx + side * headR * 0.42}, ${headCy - size * 0.18 - headR * 1.6})`}
          />
        </g>
      ))}
      <ellipse cx={cx} cy={headCy + headR * 0.1} rx={headR * 0.3} ry={headR * 0.15} fill="#f5f5f5" />
      <line x1={cx - size * 0.3} y1={cy + size * 0.1} x2={cx - size * 0.55} y2={cy + size * 0.5} stroke={INK} strokeWidth={size * 0.05} />
    </g>
  )
}

// pdf_design_spec.md §9 — Hatenyan, full-body pose with squinting ">"/"<"
// eyes, bonus page footer.
export function MascotFull({ cx, cy, size }: { cx: number; cy: number; size: number }) {
  const headR = size * 0.32
  const headCy = cy - size * 0.05
  return (
    <g>
      <ellipse cx={cx} cy={cy + size * 0.57} rx={size * 0.4} ry={size * 0.05} fill="#d9d9d9" />
      <circle cx={cx} cy={headCy} r={headR} fill={INK} />
      <polygon
        points={`${cx - headR * 0.7},${headCy - headR * 0.9} ${cx - headR * 1.15},${headCy - headR * 1.6} ${cx - headR * 0.15},${headCy - headR * 1.1}`}
        fill={INK}
      />
      <polygon
        points={`${cx + headR * 0.7},${headCy - headR * 0.9} ${cx + headR * 1.15},${headCy - headR * 1.6} ${cx + headR * 0.15},${headCy - headR * 1.1}`}
        fill={INK}
      />
      <rect x={cx - size * 0.3} y={cy - size * 0.05} width={size * 0.6} height={size * 0.45} rx={size * 0.15} fill={INK} />
      <text x={cx - headR * 0.4} y={headCy + headR * 0.12} fontSize={headR * 0.55} fontWeight="bold" fill="white" textAnchor="middle">
        &gt;
      </text>
      <text x={cx + headR * 0.4} y={headCy + headR * 0.12} fontSize={headR * 0.55} fontWeight="bold" fill="white" textAnchor="middle">
        &lt;
      </text>
      <ellipse cx={cx} cy={headCy + headR * 0.2} rx={headR * 0.28} ry={headR * 0.15} fill="#f5f5f5" />
    </g>
  )
}
