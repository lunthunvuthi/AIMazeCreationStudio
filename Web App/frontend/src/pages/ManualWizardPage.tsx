import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { getMazeType } from '../registry/mazeTypes'
import { useLevelStore } from '../store/levelStore'
import { validateMaze } from '../api/mazeApi'
import {
  createEmptyDraft,
  findCell,
  hydrateDraftFromQuestion,
  isPathComplete,
  serializeToMazeData,
} from '../registry/pickaxe/wizardMaze'
import WizardStepper, { type WizardStepStatus } from '../components/WizardStepper'
import { flattenPages, type ValidateResponse, type WizardDraft } from '../types/maze'

// The maze-type-agnostic wizard orchestrator (§6.7): owns the in-progress
// draft, drives Back/Next between `mazeType.WizardSteps`, and wires the
// terminal step's Validate/Complete to POST /api/maze/validate + the store.
export default function ManualWizardPage() {
  const { mazeTypeId, questionId } = useParams<{ mazeTypeId: string; questionId: string }>()
  const mazeType = mazeTypeId ? getMazeType(mazeTypeId) : undefined
  const current = useLevelStore((s) => s.current)
  const markInProgress = useLevelStore((s) => s.markInProgress)
  const completeQuestion = useLevelStore((s) => s.completeQuestion)
  const navigate = useNavigate()

  const question = current ? flattenPages(current.pages).find((q) => q.question_id === questionId) : undefined

  const [stepIndex, setStepIndex] = useState(0)
  const [maxReachedStep, setMaxReachedStep] = useState(0)
  const [validating, setValidating] = useState(false)
  const [validation, setValidation] = useState<ValidateResponse | null>(null)
  const [draft, setDraft] = useState<WizardDraft | null>(null)

  useEffect(() => {
    if (!mazeType || !question) return
    const starParams = mazeType.starParams[question.difficulty_star]
    const isHydrated = question.origin === 'manual' && !!question.maze
    const initial = isHydrated
      ? hydrateDraftFromQuestion(question)
      : createEmptyDraft(starParams.width, starParams.height, starParams.pickaxeMin)
    setDraft(initial)
    // Reopening an already-complete question means every step's data is
    // already valid, so the whole stepper is immediately jumpable.
    setMaxReachedStep(isHydrated ? mazeType.WizardSteps.length - 1 : 0)
    if (question.status === 'empty') markInProgress(question.question_id)
    // Only re-run if the wizard is opened for a different question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question?.question_id])

  if (!mazeType || !current || !question) return <Navigate to="/" replace />
  if (!draft) return null

  const starParams = mazeType.starParams[question.difficulty_star]
  const steps = mazeType.WizardSteps
  const StepComponent = steps[stepIndex]
  const isLastStep = stepIndex === steps.length - 1

  function updateDraft(updater: (d: WizardDraft) => WizardDraft) {
    setDraft((d) => (d ? updater(d) : d))
    setValidation(null) // any edit invalidates a prior Validate result
  }

  // Drives both the Next button's gate and the stepper's colors — a step
  // reached but not yet satisfying its own completion rule reads as "wrong"
  // rather than "not started" (e.g. going back and removing S after having
  // already moved on).
  function stepStatus(index: number): WizardStepStatus {
    if (index > maxReachedStep) return 'not-started'
    if (index === 0) return 'complete'
    if (index === 1) return findCell(draft!.grid, 'start') && findCell(draft!.grid, 'goal') ? 'complete' : 'wrong'
    if (index === 2) return isPathComplete(draft!.grid) ? 'complete' : 'wrong'
    // index === 3 (terminal step): "wrong" only once a Validate attempt has
    // actually failed — before that, it's just unresolved, not wrong.
    if (question!.status === 'complete' || validation?.solutionCount === 1) return 'complete'
    if (validation) return 'wrong'
    return 'not-started'
  }

  const canProceed = stepStatus(stepIndex) === 'complete'

  function handleNext() {
    const next = stepIndex + 1
    setStepIndex(next)
    setMaxReachedStep((m) => Math.max(m, next))
  }

  async function handleValidate() {
    if (!draft) return
    setValidating(true)
    try {
      const result = await validateMaze({ type: mazeType!.id, maze: serializeToMazeData(draft) })
      setValidation(result)
    } finally {
      setValidating(false)
    }
  }

  function handleComplete() {
    if (!draft || !validation || validation.solutionCount !== 1) return
    completeQuestion(question!.question_id, {
      maze: serializeToMazeData(draft),
      solutionTrace: validation.trace ?? '',
    })
    navigate(`/${mazeType!.id}/dashboard`)
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <Link to={`/${mazeType.id}/dashboard`} className="text-sm text-indigo-600 hover:underline">
        &larr; Level Dashboard
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-slate-900">
        {question.question_id} ({'★'.repeat(question.difficulty_star)})
      </h1>

      <div className="mt-8">
        <StepComponent
          star={question.difficulty_star}
          starParams={starParams}
          draft={draft}
          updateDraft={updateDraft}
          onValidate={handleValidate}
          validating={validating}
          validation={validation}
          onComplete={handleComplete}
        />
      </div>

      <div className="mt-8 flex items-center justify-between">
        <button
          type="button"
          disabled={stepIndex === 0}
          onClick={() => setStepIndex((i) => i - 1)}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 disabled:opacity-40"
        >
          Back
        </button>
        <WizardStepper
          count={steps.length}
          currentStep={stepIndex}
          maxReachedStep={maxReachedStep}
          getStatus={stepStatus}
          onStepClick={setStepIndex}
        />
        {!isLastStep ? (
          <button
            type="button"
            disabled={!canProceed}
            onClick={handleNext}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Next
          </button>
        ) : (
          <div className="w-[76px]" aria-hidden="true" />
        )}
      </div>
    </main>
  )
}
