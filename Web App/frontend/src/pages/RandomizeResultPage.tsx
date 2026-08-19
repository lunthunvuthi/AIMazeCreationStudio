import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { getMazeType } from '../registry/mazeTypes'
import { useLevelStore } from '../store/levelStore'
import { generateMaze, type GenerateResult } from '../api/mazeApi'
import { hydrateDraftFromMazeData } from '../registry/pickaxe/wizardMaze'
import PickaxeGrid from '../registry/pickaxe/PickaxeGrid'
import RandomizeProgressModal, { type RandomizeReplayFrom } from '../components/RandomizeProgressModal'
import { flattenPages } from '../types/maze'

interface ActiveRandomize {
  replayFrom: RandomizeReplayFrom
  run: () => Promise<GenerateResult>
}

// development_plan.md §6.6 — Randomize This Question. Calls /api/maze/generate,
// lands on a read-only view equivalent to the manual wizard's Step 4 (already
// known-valid — the generator's pipeline guarantees a unique solution, so no
// separate /api/maze/validate round trip is needed), plus three reroll
// controls that each re-call generate with the previous result's other seeds
// pinned. The choreographed RandomizeProgressModal plays during the initial
// generate and every reroll.
export default function RandomizeResultPage() {
  const { mazeTypeId, questionId } = useParams<{ mazeTypeId: string; questionId: string }>()
  const mazeType = mazeTypeId ? getMazeType(mazeTypeId) : undefined
  const current = useLevelStore((s) => s.current)
  const setRandomized = useLevelStore((s) => s.setRandomized)
  const completeRandomizedQuestion = useLevelStore((s) => s.completeRandomizedQuestion)
  const navigate = useNavigate()

  const question = current ? flattenPages(current.pages).find((q) => q.question_id === questionId) : undefined

  const [activeRandomize, setActiveRandomize] = useState<ActiveRandomize | null>(() =>
    question && !question.maze
      ? { replayFrom: 1, run: () => generateMaze({ type: mazeType!.id, star: question.difficulty_star }) }
      : null,
  )

  if (!mazeType || !current || !question) return <Navigate to="/" replace />

  const starParams = mazeType.starParams[question.difficulty_star]
  const baselineDraft = question.maze ? hydrateDraftFromMazeData(question.maze, question.solutionTrace) : null

  function handleSettled(result: GenerateResult) {
    setRandomized(question!.question_id, { maze: result.maze, solutionTrace: result.solutionTrace, seeds: result.seeds })
    setActiveRandomize(null)
  }

  function handleCancel() {
    setActiveRandomize(null)
    if (!question!.maze) navigate(`/${mazeType!.id}/dashboard/${question!.question_id}`)
  }

  function handleComplete() {
    completeRandomizedQuestion(question!.question_id)
    navigate(`/${mazeType!.id}/dashboard`)
  }

  function rerollSG() {
    setActiveRandomize({
      replayFrom: 2,
      run: () => generateMaze({ type: mazeType!.id, star: question!.difficulty_star }),
    })
  }

  function rerollPath() {
    setActiveRandomize({
      replayFrom: 3,
      run: () => generateMaze({ type: mazeType!.id, star: question!.difficulty_star, sgSeed: question!.seeds.sgSeed! }),
    })
  }

  function rerollWalls() {
    setActiveRandomize({
      replayFrom: 4,
      run: () =>
        generateMaze({
          type: mazeType!.id,
          star: question!.difficulty_star,
          sgSeed: question!.seeds.sgSeed!,
          pathSeed: question!.seeds.pathSeed!,
        }),
    })
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <Link to={`/${mazeType.id}/dashboard`} className="text-sm text-indigo-600 hover:underline">
        &larr; Level Dashboard
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-slate-900">
        {question.question_id} ({'★'.repeat(question.difficulty_star)})
      </h1>

      {baselineDraft && !activeRandomize && (
        <div className="mt-8 space-y-4">
          <PickaxeGrid grid={baselineDraft.grid} mode="view" />
          <p className="text-sm text-emerald-700">Unique solution found: {question.solutionTrace}</p>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={rerollSG}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:border-indigo-300"
            >
              Reroll S/G placement
            </button>
            <button
              type="button"
              onClick={rerollPath}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:border-indigo-300"
            >
              Reroll ideal path
            </button>
            <button
              type="button"
              onClick={rerollWalls}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:border-indigo-300"
            >
              Reroll wall placement
            </button>
          </div>

          <div>
            <button
              type="button"
              onClick={handleComplete}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
            >
              Complete
            </button>
          </div>
        </div>
      )}

      {activeRandomize && (
        <RandomizeProgressModal
          starParams={starParams}
          replayFrom={activeRandomize.replayFrom}
          baselineDraft={baselineDraft}
          run={activeRandomize.run}
          onSettled={handleSettled}
          onCancel={handleCancel}
        />
      )}
    </main>
  )
}
