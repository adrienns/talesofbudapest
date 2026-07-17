'use client'

import { useTranslations } from 'next-intl'
import { QuickStartTourCarousel, type CarouselCard } from '@/components/narrative/QuickStartTourCarousel'
import { TOUR_STYLES, formatMinutesShort } from '@/constants/questionnaire'
import type { QuestionnaireLocationStatus } from '@/hooks/useQuestionnaire'
import { DurationPicker } from './DurationPicker'
import { LocationToggle } from './LocationToggle'
import { QuestionnaireChoiceCard } from './QuestionnaireChoiceCard'
import { QuestionnaireWaveSeparator } from './QuestionnaireWaveSeparator'

type SetupStepProps = {
  curatedTours: CarouselCard[]
  selectedStyleId: string | null
  minutes: number
  nearMe: boolean
  locationStatus: QuestionnaireLocationStatus
  canContinue: boolean
  onSelectCuratedTour: (slug: string) => void
  onSelectStyle: (styleId: string) => void
  onSetMinutes: (minutes: number) => void
  onToggleNearMe: () => Promise<void>
  onNext: () => void
}

export const SetupStep = ({
  curatedTours,
  selectedStyleId,
  minutes,
  nearMe,
  locationStatus,
  canContinue,
  onSelectCuratedTour,
  onSelectStyle,
  onSetMinutes,
  onToggleNearMe,
  onNext,
}: SetupStepProps) => {
  const t = useTranslations('questionnaire')

  return (
    <div className="-mx-5 -my-6 flex min-h-full flex-col">
      <section className="bg-[#cad9db] px-5 pb-7 pt-6">
        <div className="mx-auto max-w-md">
          <h2 className="mb-4 text-xl font-extrabold text-slate-800">{t('readyMadeTours')}</h2>
          <QuickStartTourCarousel
            tours={curatedTours}
            onSelect={onSelectCuratedTour}
          />
        </div>
      </section>
      <QuestionnaireWaveSeparator label={t('or')} />
      <section className="flex-1 bg-[var(--color-ai-chat-bg)] px-5 pb-8 pt-1">
        <div className="mx-auto flex max-w-md flex-col gap-7">
          <div className="text-center">
            <h2 className="text-xl font-extrabold text-on-surface">{t('styleQuestion')}</h2>
            <p className="mt-1 text-sm text-on-surface/55">{t('styleHelper')}</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {TOUR_STYLES.map((style, index) => (
              <QuestionnaireChoiceCard
                key={style.id}
                icon={style.icon}
                label={style.label}
                description={style.blurb}
                colorIndex={index}
                selected={selectedStyleId === style.id}
                onSelect={() => onSelectStyle(style.id)}
                variant="style"
              />
            ))}
          </div>
          <DurationPicker
            value={minutes}
            onChange={onSetMinutes}
            label={t('durationQuestion')}
            hint={t('durationHint', { minutes: formatMinutesShort(minutes) })}
            headerAction={(
              <LocationToggle
                nearMe={nearMe}
                locationStatus={locationStatus}
                onToggle={onToggleNearMe}
                label={t('startNearMe')}
                requestingLabel={t('locationRequesting')}
              />
            )}
          />
          <button type="button" disabled={!canContinue} onClick={onNext} className="q-start-btn rounded-full py-3.5 font-bold text-white disabled:opacity-35">
            {t('continue')}
          </button>
        </div>
      </section>
    </div>
  )
}
