'use client'

import { ChevronLeft } from 'lucide-react'
import type { QuestionnaireStep } from '@/hooks/useQuestionnaire'
import { IconButton } from '@/components/ui/IconButton'

type QuestionnaireStepHeaderProps = {
  step: QuestionnaireStep
  closeLabel: string
  previousLabel: string
  onClose: () => void
  onBack: () => void
}

export const QuestionnaireStepHeader = ({
  step,
  closeLabel,
  previousLabel,
  onClose,
  onBack,
}: QuestionnaireStepHeaderProps) => {
  const isSetup = step === 'setup'

  return (
    <header className={`flex items-center justify-between px-4 pt-[max(0.875rem,env(safe-area-inset-top))] ${isSetup ? 'bg-[#cad9db]' : 'bg-[var(--color-ai-chat-bg)]'}`}>
      <IconButton
        icon={ChevronLeft}
        onClick={isSetup ? onClose : onBack}
        ariaLabel={isSetup ? closeLabel : previousLabel}
        size="lg"
      />
      <div className="flex gap-1.5" aria-hidden="true">
        <span className={`h-1.5 rounded-full ${isSetup ? 'w-6 bg-[var(--map-teal)]' : 'w-1.5 bg-on-surface/20'}`} />
        <span className={`h-1.5 rounded-full ${!isSetup ? 'w-6 bg-[var(--map-teal)]' : 'w-1.5 bg-on-surface/20'}`} />
      </div>
      <div className="h-11 w-11" aria-hidden="true" />
    </header>
  )
}
