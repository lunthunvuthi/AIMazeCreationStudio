export type WizardStepStatus = 'not-started' | 'complete' | 'wrong'

const STATUS_CLASSES: Record<WizardStepStatus, string> = {
  complete: 'bg-emerald-600 text-white',
  wrong: 'bg-red-500 text-white',
  'not-started': 'bg-slate-200 text-slate-500',
}

export interface WizardStepperProps {
  count: number
  currentStep: number
  maxReachedStep: number
  getStatus: (index: number) => WizardStepStatus
  onStepClick: (index: number) => void
}

// Clickable step breadcrumb for the wizard footer — green once a step's data
// is valid, red once it's been reached but currently isn't, grey until
// reached. Jumping is only allowed up to the furthest step reached so far
// (via Next), so a later step can never be opened with missing upstream data.
export default function WizardStepper({ count, currentStep, maxReachedStep, getStatus, onStepClick }: WizardStepperProps) {
  return (
    <div className="flex items-center">
      {Array.from({ length: count }, (_, i) => i).map((i) => {
        const status = getStatus(i)
        const reachable = i <= maxReachedStep
        return (
          <div key={i} className="flex items-center">
            <button
              type="button"
              disabled={!reachable}
              onClick={() => onStepClick(i)}
              aria-current={i === currentStep ? 'step' : undefined}
              title={`Step ${i + 1}`}
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition ${STATUS_CLASSES[status]} ${
                reachable ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
              } ${i === currentStep ? 'ring-2 ring-indigo-500 ring-offset-2' : ''}`}
            >
              {i + 1}
            </button>
            {i < count - 1 && (
              <div className={`h-0.5 w-8 ${status === 'complete' ? 'bg-emerald-400' : 'bg-slate-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}
