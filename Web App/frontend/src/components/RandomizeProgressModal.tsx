import { useEffect, useState } from 'react'
import type { StarParams, WizardDraft, WizardGrid } from '../types/maze'
import type { GenerateResult } from '../api/mazeApi'
import PickaxeGrid from '../registry/pickaxe/PickaxeGrid'
import {
  applyPathToGrid,
  clearPathAndWalls,
  clearWalls,
  createEmptyGrid,
  findCell,
  hydrateDraftFromMazeData,
  listWallEdges,
  pathEdgeList,
  pointKey,
  setCellKind,
  setWall,
  type Point,
} from '../registry/pickaxe/wizardMaze'

export type RandomizeReplayFrom = 1 | 2 | 3 | 4

export interface RandomizeProgressModalProps {
  starParams: StarParams
  replayFrom: RandomizeReplayFrom
  baselineDraft: WizardDraft | null
  run: () => Promise<GenerateResult>
  onSettled: (result: GenerateResult) => void
  onCancel: () => void
}

type Phase = 'waiting' | 'sizeCount' | 'placeSG' | 'drawPath' | 'scatterWalls' | 'done' | 'errored'

// Dev-only speed multiplier so a Playwright/manual click-through doesn't have
// to sit through real multi-second animations every time: set
// VITE_FAST_ANIM=1 to shrink every duration below to ~5% — real timers still
// fire, nothing about the production timing path changes.
const SPEED = import.meta.env.VITE_FAST_ANIM ? 0.05 : 1
const ms = (n: number) => Math.max(1, Math.round(n * SPEED))

const SIZE_COUNT_MS = 900
const PLACE_SG_GAP_MS = 650
const DRAW_PATH_TOTAL_MS = 1800
const SCATTER_WALLS_TOTAL_MS = 3200
const DONE_MS = 700

function sleep(msValue: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, msValue))
}

function edgeKey(a: Point, b: Point): string {
  return [pointKey(a), pointKey(b)].sort().join('|')
}

const PHASE_LABEL: Record<Phase, string> = {
  waiting: 'Generating the maze…',
  sizeCount: 'Sizing the maze…',
  placeSG: 'Placing start & goal…',
  drawPath: 'Drawing the ideal path…',
  scatterWalls: 'Placing walls…',
  done: 'Completed!',
  errored: 'Something went wrong',
}

// Every stage below animates strictly from the REAL generate result — nothing
// shown is ever a placeholder that later needs correcting. The fetch runs
// first (stage "waiting"), then the reveal plays using that exact data, so
// what the popup shows and what's left once it closes always match. A stage
// earlier than `replayFrom` didn't change this reroll, so it's shown fully
// resolved (from the real data) immediately rather than re-animated.
export default function RandomizeProgressModal({
  starParams,
  replayFrom,
  baselineDraft,
  run,
  onSettled,
  onCancel,
}: RandomizeProgressModalProps) {
  const [phase, setPhase] = useState<Phase>('waiting')
  const [grid, setGrid] = useState<WizardGrid>(() => initialGrid(replayFrom, starParams, baselineDraft))
  const [widthDisplay, setWidthDisplay] = useState(starParams.width)
  const [heightDisplay, setHeightDisplay] = useState(starParams.height)
  const [pickaxeDisplay, setPickaxeDisplay] = useState(baselineDraft?.pickaxeCount ?? 0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    // Scoped locally to this effect invocation (not a ref) so React
    // StrictMode's dev-only double-invoke — or a fast double-click that
    // re-triggers this effect — can't let a stale invocation's in-flight
    // `run()` write state after a newer invocation has already started;
    // each invocation gets its own independent flag instead of sharing one.
    let cancelled = false
    setPhase('waiting')
    setGrid(initialGrid(replayFrom, starParams, baselineDraft))
    setErrorMessage(null)

    async function playAnimation() {
      let result: GenerateResult
      try {
        result = await run()
      } catch (error) {
        if (cancelled) return
        setErrorMessage(error instanceof Error ? error.message : String(error))
        setPhase('errored')
        return
      }
      if (cancelled) return

      const realDraft = hydrateDraftFromMazeData(result.maze, result.solutionTrace)
      const realWidth = realDraft.grid[0]?.length ?? starParams.width
      const realHeight = realDraft.grid.length

      // Stage 1: size & pickaxe count — only re-decided by a fresh randomize.
      if (replayFrom === 1) {
        setPhase('sizeCount')
        const steps = 12
        for (let i = 1; i <= steps; i++) {
          if (cancelled) return
          setWidthDisplay(Math.round((realWidth * i) / steps))
          setHeightDisplay(Math.round((realHeight * i) / steps))
          setPickaxeDisplay(Math.round((realDraft.pickaxeCount * i) / steps))
          await sleep(ms(SIZE_COUNT_MS / steps))
        }
      } else {
        setWidthDisplay(realWidth)
        setHeightDisplay(realHeight)
        setPickaxeDisplay(realDraft.pickaxeCount)
      }
      if (cancelled) return

      const start = findCell(realDraft.grid, 'start')
      const goal = findCell(realDraft.grid, 'goal')

      // Stage 2: place S/G — re-decided by a fresh randomize or "reroll S/G".
      if (replayFrom <= 2 && start && goal) {
        setPhase('placeSG')
        setGrid(createEmptyGrid(realWidth, realHeight))
        setGrid((g) => setCellKind(g, start, 'start'))
        await sleep(ms(PLACE_SG_GAP_MS))
        if (cancelled) return
        setGrid((g) => setCellKind(g, goal, 'goal'))
        await sleep(ms(PLACE_SG_GAP_MS))
        if (cancelled) return
      } else {
        setGrid(clearPathAndWalls(realDraft.grid))
      }

      // Stage 3: draw the ideal path — re-decided by everything except
      // "reroll wall placement".
      if (replayFrom <= 3) {
        setPhase('drawPath')
        const path = realDraft.path
        const interval = ms(DRAW_PATH_TOTAL_MS / Math.max(1, path.length - 1))
        for (let i = 1; i < path.length; i++) {
          if (cancelled) return
          const revealed = path.slice(0, i + 1)
          setGrid((g) => applyPathToGrid(g, revealed))
          await sleep(interval)
        }
        if (cancelled) return
      } else {
        setGrid(clearWalls(realDraft.grid))
      }

      // Stage 4: walls — always re-decided by every reroll. Reveal the
      // required path-walls first (matches "the intended line" appearing
      // first), then the remaining distraction walls — every wall shown is
      // part of the real final maze, none are ever removed again.
      setPhase('scatterWalls')
      setGrid((g) => clearWalls(g))
      const pathEdgeKeys = new Set(pathEdgeList(realDraft.path).map(({ a, b }) => edgeKey(a, b)))
      const allWalls = listWallEdges(realDraft.grid)
      const onPathWalls = allWalls.filter((e) => pathEdgeKeys.has(edgeKey(e.a, e.b)))
      const otherWalls = allWalls.filter((e) => !pathEdgeKeys.has(edgeKey(e.a, e.b)))
      const orderedWalls = [...onPathWalls, ...otherWalls]
      const wallInterval = ms(SCATTER_WALLS_TOTAL_MS / Math.max(1, orderedWalls.length))
      for (const edge of orderedWalls) {
        if (cancelled) return
        setGrid((g) => setWall(g, edge.a, edge.b, true))
        await sleep(wallInterval)
      }
      if (cancelled) return

      setPhase('done')
      await sleep(ms(DONE_MS))
      if (cancelled) return
      onSettled(result)
    }

    playAnimation()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt])

  function handleRetry() {
    setAttempt((a) => a + 1)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">
          {phase === 'errored' ? PHASE_LABEL.errored : phase === 'done' ? PHASE_LABEL.done : 'Randomize in progress…'}
        </h2>

        {phase !== 'errored' && (
          <>
            <p className={`mt-1 text-sm text-slate-500 ${phase === 'waiting' ? 'animate-pulse' : ''}`}>
              {phase !== 'done' ? PHASE_LABEL[phase] : 'Locking it in.'}
            </p>
            <div className="mt-4 flex justify-center gap-4 text-sm text-slate-600">
              <span>
                Size: {widthDisplay} × {heightDisplay}
              </span>
              <span>Pickaxes: {pickaxeDisplay}</span>
            </div>
            <div className="mt-4">
              <PickaxeGrid grid={grid} mode="view" />
            </div>
          </>
        )}

        {phase === 'errored' && (
          <>
            <p className="mt-2 text-sm text-red-600">{errorMessage}</p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRetry}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
              >
                Retry
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function initialGrid(replayFrom: RandomizeReplayFrom, starParams: StarParams, baselineDraft: WizardDraft | null): WizardGrid {
  if (replayFrom <= 2 || !baselineDraft) return createEmptyGrid(starParams.width, starParams.height)
  if (replayFrom === 3) return clearPathAndWalls(baselineDraft.grid)
  return clearWalls(baselineDraft.grid)
}
