'use client'

import { ArrowUp, Footprints } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useRef } from 'react'
import { MAX_TOPICS, TOUR_TOPICS } from '@/constants/questionnaire'
import { QuestionnaireChoiceCard } from './QuestionnaireChoiceCard'

type InterestsStepProps = {
  topicIds: string[]
  intent: string
  canStart: boolean
  focusInput: boolean
  onToggleTopic: (topicId: string) => void
  onIntentChange: (intent: string) => void
  onStart: () => void
}

export const InterestsStep = ({
  topicIds,
  intent,
  canStart,
  focusInput,
  onToggleTopic,
  onIntentChange,
  onStart,
}: InterestsStepProps) => {
  const t = useTranslations('questionnaire')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (focusInput) {
      inputRef.current?.focus()
    }
  }, [focusInput])

  return (
    <div className="-mx-5 -my-6 flex min-h-full bg-[var(--color-ai-chat-bg)] px-5 py-8">
      <div className="q-bubble-in mx-auto flex w-full max-w-md flex-col gap-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-on-surface">{t('topicsQuestion')}</h2>
          <p className="mt-1 text-sm text-on-surface/55">{t('topicsHelper', { max: MAX_TOPICS })}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {TOUR_TOPICS.map((topic, index) => (
            <QuestionnaireChoiceCard
              key={topic.id}
              icon={topic.icon}
              label={topic.label}
              colorIndex={index}
              selected={topicIds.includes(topic.id)}
              onSelect={() => onToggleTopic(topic.id)}
              variant="topic"
            />
          ))}
        </div>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-bold text-on-surface">{t('intentLabel')}</span>
          <div className="prompt-bar-glass flex items-center gap-3 rounded-2xl px-4 py-3">
            <input
              ref={inputRef}
              value={intent}
              onChange={(event) => onIntentChange(event.target.value)}
              placeholder={t('intentPlaceholder')}
              aria-label={t('intentAriaLabel')}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
            <ArrowUp className="h-4 w-4 text-accent" aria-hidden="true" />
          </div>
        </label>
        <button
          type="button"
          onClick={onStart}
          disabled={!canStart}
          className="q-start-btn mt-2 flex items-center justify-center gap-2 rounded-full py-4 font-bold text-white disabled:opacity-35"
        >
          <Footprints className="h-5 w-5" aria-hidden="true" />
          {t('startTour')}
        </button>
      </div>
    </div>
  )
}
