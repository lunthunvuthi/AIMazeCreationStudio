import type { ComponentType } from 'react'
import type { MazeQuestion } from '../types/maze'
import { hydrateDraftFromMazeData } from '../registry/pickaxe/wizardMaze'
import WallGrid from './WallGrid'
import { INK, PickaxeIcon } from './icons'

// A "question" is the full self-contained unit a page arranges N of — for
// PickAxe that's the pickaxe-count badge plus the maze panel beneath it
// (pdf_design_spec.md §6.4 + §6), not just the bare grid. A different maze
// type could compose an entirely different unit (no badge, a non-square
// panel, its own data-driven decoration) — this registry is the
// extensibility seam a real renderer needs as more maze types ship,
// mirroring the same MazeTypeDefinition pattern the real app already uses
// for the interactive wizard (registry/mazeTypes.ts's CellRenderer/
// WizardSteps per maze type) rather than hardcoding PickAxe's layout into
// the page-composition component. Deliberately kept parallel to the
// backend spike's QUESTION_TYPES dict (render_reportlab.py) so the two
// renderer-tech spikes stay a fair comparison on this question too.

export interface PdfQuestionPanelProps {
  question: MazeQuestion
  size: 'large' | 'small'
  answerKey: boolean
  tutorialDecorations?: boolean
}

function Badge({ pickaxeCount }: { pickaxeCount: number }) {
  const bubbleW = 22
  const iconSize = 16
  return (
    <svg
      viewBox={`0 0 ${pickaxeCount * iconSize + bubbleW + 6} ${iconSize}`}
      className="mb-1 h-6"
      style={{ width: `${pickaxeCount * iconSize + bubbleW + 6}px` }}
    >
      {Array.from({ length: pickaxeCount }, (_, i) => (
        <PickaxeIcon key={i} cx={iconSize * (i + 0.5)} cy={iconSize / 2} size={iconSize} />
      ))}
      <g transform={`translate(${pickaxeCount * iconSize + 3}, 0)`}>
        <rect x={0} y={0} width={bubbleW - 3} height={iconSize} rx={4} fill="white" stroke={INK} strokeWidth={1} />
        <polygon points={`0,${iconSize * 0.35} 0,${iconSize * 0.65} ${-5},${iconSize * 0.5}`} fill="white" stroke={INK} strokeWidth={1} />
        <text x={(bubbleW - 3) / 2} y={iconSize * 0.72} textAnchor="middle" fontSize={11} fontWeight="bold" fill={INK}>
          {pickaxeCount}
        </text>
      </g>
    </svg>
  )
}

// PickAxe's PDF question unit: badge above, WallGrid below. `size` maps to a
// width class rather than a fixed pixel value so it drops cleanly into
// either page layout (pdf_design_spec.md §7) without the page composer
// needing to know PickAxe's own proportions.
function PickaxeQuestionPanel({ question, size, answerKey, tutorialDecorations }: PdfQuestionPanelProps) {
  const draft = hydrateDraftFromMazeData(question.maze!, answerKey || tutorialDecorations ? question.solutionTrace : null)
  const widthClass = size === 'large' ? 'w-full max-w-md' : 'w-full max-w-xs'
  return (
    <div className={widthClass}>
      <Badge pickaxeCount={question.maze!.pickaxe_count} />
      <WallGrid grid={draft.grid} path={answerKey || tutorialDecorations ? draft.path : undefined} wavy={tutorialDecorations} tutorialDecorations={tutorialDecorations} />
    </div>
  )
}

export const PDF_QUESTION_PANELS: Record<string, ComponentType<PdfQuestionPanelProps>> = {
  pickaxe: PickaxeQuestionPanel,
}

// Generic lookup a page-composition component calls — has NO PickAxe-specific
// knowledge itself, same contract a second maze type would need to satisfy.
export function QuestionPanel({ mazeType, ...props }: PdfQuestionPanelProps & { mazeType: string }) {
  const Panel = PDF_QUESTION_PANELS[mazeType]
  if (!Panel) throw new Error(`no PDF question panel registered for maze type "${mazeType}"`)
  return <Panel {...props} />
}
