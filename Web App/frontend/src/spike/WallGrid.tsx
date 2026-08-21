import { useMemo } from 'react'
import type { WizardGrid } from '../types/maze'
import { findCell, wallBetween, type Point } from '../registry/pickaxe/wizardMaze'
import { GRAY, PATH_GRAY, StartIcon, GoalIcon, SparkleIcon, BreakCallout } from './icons'

// pdf_design_spec.md §6 — the core maze-panel renderer. Replaces this spike's
// first pass (PrintGrid/PrintCellRenderer, now deleted): that version drew a
// light dotted line for every cell edge and reused the production
// CellRenderer's per-cell-div layout. The measured sample has **no background
// grid at all** — open edges are blank white, only actual walls are drawn,
// full-length along the shared edge, distinctly thinner than the outer
// border, with dots at interior wall endpoints only. That can't be expressed
// as "one CSS border per cell div" the way the production wizard's grid is,
// so this is a single SVG computing wall/dot geometry directly from the
// WizardGrid — the same approach render_reportlab.py takes on the backend
// side, kept deliberately parallel so the two spikes stay comparable.

// Measured pdf_design_spec.md §6.1/§6.2, expressed as fractions of the panel
// size so the SVG scales cleanly at any on-screen/print size.
const BORDER_W_FRAC = 1.6 / 80 // ~1.6mm border on an ~80mm panel
const WALL_W_FRAC = 0.9 / 80
const DOT_R_FRAC = 1.1 / 80

// How far short of the Start and Goal cell centres the path stops, in cell
// widths (project owner, 2026-08-21). Drawing all the way to the centre buried
// the line under the Start figure and the Goal flag; stopping a quarter-cell out
// leaves both icons sitting clear of it. Only the two ends are inset — every
// interior vertex stays on its cell centre, so the path's shape is unchanged.
const ENDPOINT_INSET = 0.25

export interface WallGridProps {
  grid: WizardGrid
  path?: Point[] // draft.path, in cell coordinates — omit for a bare question panel
  wavy?: boolean // cover tutorial's hand-drawn stroke vs. the answer-key's plain line
  tutorialDecorations?: boolean // sparkle + pickaxe-bubble callouts — cover only, see icons.tsx
  // Overrides the default responsive sizing. The cover (CoverPage.tsx) needs
  // panels at exact pt sizes to line up with Front Cover.svg's coordinate
  // system, and its page-width watermark is far wider than the default
  // `max-w-md` cap allows — both pass `block h-full w-full` and size the
  // wrapping element instead.
  className?: string
  // Draws the panel's thick outer frame (pdf_design_spec.md §6.1). On by
  // default — every real question panel has it. The cover's watermark turns it
  // off: blown up to the full page width that 1.6mm frame becomes a ~11pt pale
  // grey rule spanning the whole sheet and hugging the page border, and since
  // the Direction box masks the maze's interior, that rule is one of the few
  // parts of the watermark still visible. It reads as a stray printing rule
  // rather than as part of a maze. Owner's call, 2026-08-21: the scaled-up maze
  // used as the watermark carries no outer border.
  showBorder?: boolean
}

// Moves `from` a quarter-cell towards `toward`. Moves are always orthogonal, so
// exactly one of the two signs is non-zero — this yields the owner's
// (±0.25, 0) / (0, ±0.25) offsets for the four directions.
function insetTowards(
  from: { x: number; y: number },
  toward: { x: number; y: number },
  cellW: number,
  cellH: number,
) {
  return {
    x: from.x + Math.sign(toward.x - from.x) * ENDPOINT_INSET * cellW,
    y: from.y + Math.sign(toward.y - from.y) * ENDPOINT_INSET * cellH,
  }
}

function wavyPathD(points: { x: number; y: number }[], amplitude: number) {
  if (points.length < 2) return ''
  const out: string[] = [`M ${points[0].x} ${points[0].y}`]
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len
    const ny = dx / len
    const steps = 10
    for (let s = 1; s <= steps; s++) {
      const t = s / steps
      const perp = Math.sin(t * Math.PI * 3) * amplitude
      out.push(`L ${a.x + dx * t + nx * perp} ${a.y + dy * t + ny * perp}`)
    }
  }
  return out.join(' ')
}

const DEFAULT_CLASS = 'mx-auto block aspect-square w-full max-w-md'

export default function WallGrid({ grid, path, wavy, tutorialDecorations, className = DEFAULT_CLASS, showBorder = true }: WallGridProps) {
  const height = grid.length
  const width = grid[0]?.length ?? 0
  const size = 100 // viewBox units — panel is always a square, scales via CSS
  const cellW = size / width
  const cellH = size / height
  const borderW = BORDER_W_FRAC * size
  const wallW = WALL_W_FRAC * size
  const dotR = DOT_R_FRAC * size

  const lattice = (gx: number, gy: number) => ({ x: gx * cellW, y: gy * cellH })
  const cellCenter = (gx: number, gy: number) => ({ x: (gx + 0.5) * cellW, y: (gy + 0.5) * cellH })

  const { wallLines, dots } = useMemo(() => {
    const lines: { x1: number; y1: number; x2: number; y2: number }[] = []
    const dotSet = new Map<string, { x: number; y: number }>()
    const addDot = (gx: number, gy: number) => {
      const p = lattice(gx, gy)
      dotSet.set(`${gx},${gy}`, p)
    }
    for (let gy = 0; gy < height; gy++) {
      for (let gx = 0; gx < width; gx++) {
        const cell = grid[gy][gx]
        if (cell.rightWall) {
          const top = lattice(gx + 1, gy)
          const bottom = lattice(gx + 1, gy + 1)
          lines.push({ x1: top.x, y1: top.y, x2: bottom.x, y2: bottom.y })
          if (gy > 0) addDot(gx + 1, gy)
          if (gy + 1 < height) addDot(gx + 1, gy + 1)
        }
        if (cell.bottomWall) {
          const left = lattice(gx, gy + 1)
          const right = lattice(gx + 1, gy + 1)
          lines.push({ x1: left.x, y1: left.y, x2: right.x, y2: right.y })
          if (gx > 0) addDot(gx, gy + 1)
          if (gx + 1 < width) addDot(gx + 1, gy + 1)
        }
      }
    }
    return { wallLines: lines, dots: [...dotSet.values()] }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid, width, height])

  const start = findCell(grid, 'start')
  const goal = findCell(grid, 'goal')

  // A solution trace runs Start -> Goal, so the first and last entries are
  // always the two icon cells — inset both. Interior points are untouched.
  const pathCenters = (() => {
    const centers = path?.map((p) => cellCenter(p.x, p.y))
    if (!centers || centers.length < 2) return centers
    const out = [...centers]
    out[0] = insetTowards(centers[0], centers[1], cellW, cellH)
    out[out.length - 1] = insetTowards(centers[centers.length - 1], centers[centers.length - 2], cellW, cellH)
    return out
  })()
  const breakPoints =
    tutorialDecorations && path
      ? path.slice(0, -1).flatMap((a, i) => {
          const b = path[i + 1]
          const wall = wallBetween(grid, a, b)
          if (!wall) return []
          const ca = cellCenter(a.x, a.y)
          const cb = cellCenter(b.x, b.y)
          return [{ x: (ca.x + cb.x) / 2, y: (ca.y + cb.y) / 2 }]
        })
      : []

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className={className}>
      {pathCenters && pathCenters.length > 1 && (
        <path
          d={wavy ? wavyPathD(pathCenters, size * 0.018) : `M ${pathCenters.map((p) => `${p.x} ${p.y}`).join(' L ')}`}
          fill="none"
          stroke={PATH_GRAY}
          strokeWidth={wavy ? size * 0.045 : borderW}
          strokeLinecap={wavy ? 'round' : 'square'}
          strokeLinejoin={wavy ? 'round' : 'miter'}
        />
      )}

      {showBorder && <rect x={0} y={0} width={size} height={size} fill="none" stroke={GRAY} strokeWidth={borderW} />}
      {wallLines.map((l, i) => (
        <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={GRAY} strokeWidth={wallW} />
      ))}
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={dotR} fill={GRAY} />
      ))}

      {start && <StartIcon cx={cellCenter(start.x, start.y).x} cy={cellCenter(start.x, start.y).y} size={Math.min(cellW, cellH) * 0.8} />}
      {goal && <GoalIcon cx={cellCenter(goal.x, goal.y).x} cy={cellCenter(goal.x, goal.y).y} size={Math.min(cellW, cellH) * 0.85} />}

      {breakPoints.map((p, i) => (
        <g key={i}>
          <SparkleIcon cx={p.x} cy={p.y} r={Math.min(cellW, cellH) * 0.16} />
          <BreakCallout x={p.x - size * 0.06} y={p.y + size * 0.05} size={Math.min(cellW, cellH) * 0.5} />
        </g>
      ))}
    </svg>
  )
}
