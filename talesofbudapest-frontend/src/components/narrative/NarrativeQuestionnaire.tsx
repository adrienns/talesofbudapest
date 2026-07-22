'use client'

import { useTranslations } from 'next-intl'
import { TourDetailView } from '@/components/narrative/TourDetailView'
import { InterestsStep } from '@/components/narrative/questionnaire/InterestsStep'
import { QuestionnaireStepHeader } from '@/components/narrative/questionnaire/QuestionnaireStepHeader'
import { SetupStep } from '@/components/narrative/questionnaire/SetupStep'
import { CURATED_STARTERS, type CuratedStarter } from '@/constants/questionnaire'
import {
  useQuestionnaire,
  type QuestionnaireLocationStatus,
} from '@/hooks/useQuestionnaire'
import type { QuestionnaireExtras } from '@/types/narrative'

export type { QuestionnaireExtras } from '@/types/narrative'

type Props = {
  isOpen: boolean
  onClose: () => void
  onPlan: (extras: QuestionnaireExtras) => void
  onStartCurated: (starter: CuratedStarter, initialChapterIndex?: number) => void
  onRequestLocation: () => Promise<boolean>
  locationStatus: QuestionnaireLocationStatus
  focusInput?: boolean
  initialIntent?: string
  curatedOnly?: boolean
}

export const NarrativeQuestionnaire = ({
  isOpen,
  onClose,
  onPlan,
  onStartCurated,
  onRequestLocation,
  locationStatus,
  focusInput = false,
  initialIntent = '',
  curatedOnly = false,
}: Props) => {
  const t = useTranslations('questionnaire')
  const questionnaire = useQuestionnaire({ isOpen, initialIntent, locationStatus, onRequestLocation })

  if (!isOpen) return null

  const isSetupStep = questionnaire.step === 'setup'
  const curatedTours = CURATED_STARTERS.filter((starter) => !curatedOnly || starter.kind === 'fixed').map((starter) => (
    starter.kind === 'fixed'
      ? {
          slug: starter.slug,
          title: t(starter.titleKey),
          tagline: t(starter.taglineKey),
          imageSrc: starter.imageSrc,
          imageAlt: t(starter.imageAltKey),
        }
      : starter
  ))

  const handleStart = () => {
    const extras = questionnaire.getSubmission()
    if (extras) onPlan(extras)
  }

  const handleCuratedTourSelect = (slug: string) => {
    const starter = CURATED_STARTERS.find((candidate) => candidate.slug === slug)
    if (starter) questionnaire.selectCuratedTour(starter)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('title')}
      className={`fixed inset-0 z-50 flex flex-col animate-ai-chat-enter motion-reduce:animate-none ${
        isSetupStep ? 'bg-[#cad9db]' : 'bg-[var(--color-ai-chat-bg)]'
      }`}
    >
      <QuestionnaireStepHeader
        step={questionnaire.step}
        closeLabel={t('close')}
        previousLabel={t('previousQuestion')}
        onClose={onClose}
        onBack={questionnaire.previousStep}
      />
      <main className="flex-1 overflow-y-auto bg-[var(--color-ai-chat-bg)] px-5 py-6">
        {questionnaire.step === 'setup' ? (
          <SetupStep
            curatedTours={curatedTours}
            selectedStyleId={questionnaire.styleId}
            minutes={questionnaire.minutes}
            nearMe={questionnaire.nearMe}
            locationStatus={locationStatus}
            curatedOnly={curatedOnly}
            canContinue={questionnaire.canContinue}
            onSelectCuratedTour={handleCuratedTourSelect}
            onSelectStyle={questionnaire.selectStyle}
            onSetMinutes={questionnaire.setMinutes}
            onToggleNearMe={questionnaire.toggleNearMe}
            onNext={questionnaire.nextStep}
          />
        ) : (
          <InterestsStep
            topicIds={questionnaire.topicIds}
            intent={questionnaire.intent}
            canStart={questionnaire.canStart}
            focusInput={focusInput}
            onToggleTopic={questionnaire.toggleTopic}
            onIntentChange={questionnaire.setIntent}
            onStart={handleStart}
          />
        )}
      </main>
      {questionnaire.selectedCuratedTour && (
        <TourDetailView
          starter={questionnaire.selectedCuratedTour}
          title={questionnaire.selectedCuratedTour.kind === 'fixed'
            ? t(questionnaire.selectedCuratedTour.titleKey)
            : questionnaire.selectedCuratedTour.title}
          onClose={() => questionnaire.selectCuratedTour(null)}
          onStart={(index) => onStartCurated(questionnaire.selectedCuratedTour!, index)}
        />
      )}
    </div>
  )
}
