'use client'

import { ArrowLeft, ArrowUp, Check, Clock3, Footprints, MapPin, Minus, Plus, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { useTranslations } from 'next-intl'
import { QuickStartTourCarousel } from '@/components/narrative/QuickStartTourCarousel'
import {
  CURATED_STARTERS,
  MAX_TOPICS,
  MAX_TOUR_MINUTES,
  MIN_TOUR_MINUTES,
  TOPIC_COLORS,
  TOUR_MINUTES_STEP,
  TOUR_STYLES,
  TOUR_TOPICS,
  buildRecap,
  composeNarrativePrompt,
  estimateTourMinutes,
  formatMinutesShort,
  type CuratedStarter,
  type TourStyle,
} from '@/constants/questionnaire'

export type QuestionnaireExtras = {
  timeBudgetMinutes: number
  styleId: string
  topicIds: string[]
  nearMe: boolean
}

type NarrativeQuestionnaireProps = {
  isOpen: boolean
  onClose: () => void
  /** Style → Topics → Recap flow, or the free-text intent bar. Goes through the route preview. */
  onPlan: (prompt: string, extras?: QuestionnaireExtras) => void
  /** One-tap curated starters. Skips the preview — the prompt is pre-vetted. */
  onStartCurated: (starter: CuratedStarter) => void
  focusInput?: boolean
}

type Step = 'style' | 'topics' | 'recap'

const STEPS: Step[] = ['style', 'topics', 'recap']

const pillStyle = (index: number): CSSProperties => {
  const colorVar = TOPIC_COLORS[index % TOPIC_COLORS.length]
  return {
    backgroundColor: `var(${colorVar})`,
    boxShadow: `4px 10px 22px -4px color-mix(in srgb, var(${colorVar}) 55%, transparent)`,
    animationDelay: `${index * 45}ms`,
  }
}

const QuestionnaireWaveSeparator = () => (
  <div className="q-wave-container" aria-hidden="true">
    <svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
      <path
        d="M0 0H1440V40C1320 85 1080 85 960 40C840 -5 600 -5 480 40C360 85 120 85 0 40V0Z"
        fill="#E1F3FD"
      />
      <path
        d="M0 40C120 85 360 85 480 40C600 -5 840 -5 960 40C1080 85 1320 85 1440 40"
        stroke="#0D47A1"
        strokeWidth={6}
        strokeLinecap="round"
      />
    </svg>
  </div>
)

export const NarrativeQuestionnaire = ({
  isOpen,
  onClose,
  onPlan,
  onStartCurated,
  focusInput = false,
}: NarrativeQuestionnaireProps) => {
  const t = useTranslations('questionnaire')
  const [step, setStep] = useState<Step>('style')
  const [style, setStyle] = useState<TourStyle | null>(null)
  const [topicIds, setTopicIds] = useState<string[]>([])
  const [minutes, setMinutes] = useState<number>(MIN_TOUR_MINUTES)
  const [nearMe, setNearMe] = useState(true)
  const [customPrompt, setCustomPrompt] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const topics = TOUR_TOPICS.filter((topic) => topicIds.includes(topic.id))
  const liveEstimate = style && topics.length > 0 ? estimateTourMinutes(style, topics) : null

  useEffect(() => {
    if (!isOpen) {
      setStep('style')
      setStyle(null)
      setTopicIds([])
      setNearMe(true)
      setCustomPrompt('')
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen && focusInput) {
      inputRef.current?.focus()
    }
  }, [isOpen, focusInput])

  useEffect(() => {
    if (!isOpen) {
      return
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  const handleStyleSelect = useCallback((selected: TourStyle) => {
    setStyle(selected)
    setStep('topics')
  }, [])

  const handleTopicToggle = useCallback((topicId: string) => {
    setTopicIds((current) => {
      if (current.includes(topicId)) {
        return current.filter((id) => id !== topicId)
      }
      // Cap reached: the oldest pick makes room for the new one.
      const next = current.length >= MAX_TOPICS ? current.slice(1) : current
      return [...next, topicId]
    })
  }, [])

  const handleContinue = useCallback(() => {
    if (liveEstimate === null) {
      return
    }
    setMinutes(liveEstimate)
    setStep('recap')
  }, [liveEstimate])

  const handleBack = useCallback(() => {
    setStep((current) => (current === 'recap' ? 'topics' : 'style'))
  }, [])

  const adjustMinutes = useCallback((delta: number) => {
    setMinutes((current) =>
      Math.min(MAX_TOUR_MINUTES, Math.max(MIN_TOUR_MINUTES, current + delta)),
    )
  }, [])

  const handleStart = useCallback(() => {
    if (!style || topics.length === 0) {
      return
    }
    onPlan(composeNarrativePrompt(style, topics, minutes), {
      timeBudgetMinutes: minutes,
      styleId: style.id,
      topicIds,
      nearMe,
    })
  }, [minutes, nearMe, onPlan, style, topicIds, topics])

  const handleCustomSubmit = useCallback(() => {
    const trimmed = customPrompt.trim()
    if (trimmed) {
      onPlan(trimmed, { timeBudgetMinutes: minutes, styleId: '', topicIds: [], nearMe })
    }
  }, [customPrompt, minutes, nearMe, onPlan])

  const handleCuratedSelect = useCallback(
    (starter: CuratedStarter) => {
      onStartCurated(starter)
    },
    [onStartCurated],
  )

  if (!isOpen) {
    return null
  }

  const stepIndex = STEPS.indexOf(step)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('title')}
      className="fixed inset-0 z-50 flex flex-col bg-[var(--color-ai-chat-bg)] animate-ai-chat-enter motion-reduce:animate-none"
    >
      <header className="flex items-center justify-between px-4 pt-[max(0.875rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={handleBack}
          disabled={step === 'style'}
          aria-label={t('previousQuestion')}
          className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface transition active:scale-95 disabled:opacity-0"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
        </button>

        <div className="flex items-center gap-1.5" aria-hidden="true">
          {STEPS.map((id, index) => (
            <span
              key={id}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                index <= stepIndex ? 'w-6 bg-accent' : 'w-1.5 bg-on-surface/20'
              }`}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label={t('close')}
          className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface transition active:scale-95"
        >
          <X className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 pt-6">
        {step === 'style' && (
          <div
            key="style"
            className="q-bubble-in -mx-5 flex flex-col bg-[var(--color-ai-chat-bg)]"
          >
            <div className="q-top-section">
              <div className="mx-auto max-w-md">
                <QuickStartTourCarousel
                  label={t('quickStart')}
                  tours={CURATED_STARTERS}
                  onSelect={(slug) => {
                    const starter = CURATED_STARTERS.find((item) => item.slug === slug)
                    if (starter) {
                      handleCuratedSelect(starter)
                    }
                  }}
                />
              </div>
            </div>

            <QuestionnaireWaveSeparator />

            <div className="q-bottom-section">
              <div className="mx-auto flex max-w-md flex-col items-center gap-7">
                <div className="text-center">
                  <h2 className="text-2xl font-bold tracking-tight text-on-surface">
                    {t('styleQuestion')}
                  </h2>
                  <p className="mt-1.5 text-sm text-on-surface/50">{t('styleHelper')}</p>
                </div>

                <div className="flex w-full flex-col gap-3">
                  {TOUR_STYLES.map((item, index) => {
                    const Icon = item.icon
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleStyleSelect(item)}
                        style={pillStyle(index)}
                        className="q-option-in flex w-full items-center gap-3 rounded-2xl px-5 py-4 text-left text-white transition active:scale-[0.98]"
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20">
                          <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-base font-bold leading-tight">{item.label}</span>
                          <span className="block text-xs text-white/75">{item.blurb}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 'topics' && (
          <div key="topics" className="q-bubble-in mx-auto flex max-w-md flex-col items-center gap-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold tracking-tight text-on-surface">
                {t('topicsQuestion')}
              </h2>
              <p className="mt-1.5 text-sm text-on-surface/50">
                {t('topicsHelper', { max: MAX_TOPICS })}
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-2.5">
              {TOUR_TOPICS.map((topic, index) => {
                const Icon = topic.icon
                const selected = topicIds.includes(topic.id)
                return (
                  <button
                    key={topic.id}
                    type="button"
                    onClick={() => handleTopicToggle(topic.id)}
                    aria-pressed={selected}
                    style={pillStyle(index)}
                    className={`q-option-in inline-flex w-fit items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white transition active:scale-95 ${
                      selected ? 'ring-2 ring-white/80 ring-offset-2 ring-offset-transparent' : 'opacity-90'
                    }`}
                  >
                    {selected ? (
                      <Check className="h-4 w-4 shrink-0 text-white" strokeWidth={2.5} aria-hidden="true" />
                    ) : (
                      <Icon className="h-4 w-4 shrink-0 text-white" strokeWidth={1.75} aria-hidden="true" />
                    )}
                    {topic.label}
                  </button>
                )
              })}
            </div>

            <div className="flex min-h-[6.5rem] flex-col items-center gap-4">
              {liveEstimate !== null && (
                <div key={liveEstimate} className="q-chip-pop q-duration-chip flex items-center gap-2 rounded-full px-4 py-2">
                  <Clock3 className="h-4 w-4 text-accent" strokeWidth={2} aria-hidden="true" />
                  <span className="text-sm font-bold tabular-nums text-on-surface">
                    ≈ {formatMinutesShort(liveEstimate)}
                  </span>
                  <span className="text-xs text-on-surface/50">{t('idealTime')}</span>
                </div>
              )}

              {topics.length > 0 && (
                <button
                  type="button"
                  onClick={handleContinue}
                  className="q-start-btn flex items-center justify-center gap-2 rounded-full px-8 py-3.5 text-base font-bold text-white active:scale-[0.98]"
                >
                  {t('continue')}
                </button>
              )}
            </div>
          </div>
        )}

        {step === 'recap' && style && (
          <div key="recap" className="q-bubble-in mx-auto flex max-w-md flex-col items-center gap-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold tracking-tight text-on-surface">
                {t('recapTitle')}
              </h2>
              <p className="mt-3 text-balance text-[0.95rem] leading-relaxed text-on-surface/70">
                {buildRecap(style, topics, minutes)}
              </p>
            </div>

            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => adjustMinutes(-TOUR_MINUTES_STEP)}
                disabled={minutes <= MIN_TOUR_MINUTES}
                aria-label={t('shorterTour')}
                className="glass-surface flex h-11 w-11 items-center justify-center rounded-full text-on-surface transition active:scale-95 disabled:opacity-30"
              >
                <Minus className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
              </button>
              <div className="q-duration-chip flex min-w-[7rem] items-center justify-center gap-2 rounded-full px-5 py-2.5">
                <Clock3 className="h-4 w-4 text-accent" strokeWidth={2} aria-hidden="true" />
                <span className="text-base font-bold tabular-nums text-on-surface">
                  {formatMinutesShort(minutes)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => adjustMinutes(TOUR_MINUTES_STEP)}
                disabled={minutes >= MAX_TOUR_MINUTES}
                aria-label={t('longerTour')}
                className="glass-surface flex h-11 w-11 items-center justify-center rounded-full text-on-surface transition active:scale-95 disabled:opacity-30"
              >
                <Plus className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setNearMe((current) => !current)}
              aria-pressed={nearMe}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition active:scale-95 ${
                nearMe ? 'bg-accent text-white' : 'glass-surface text-on-surface/60'
              }`}
            >
              <MapPin className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              {t('startNearMe')}
            </button>

            <button
              type="button"
              onClick={handleStart}
              className="q-start-btn q-start-pulse flex w-full items-center justify-center gap-2.5 rounded-full px-6 py-4 text-base font-bold text-white active:scale-[0.98]"
            >
              <Footprints className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
              {t('startTour')}
            </button>
          </div>
        )}
      </div>

      {step !== 'recap' && (
        <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
          <form
            className="prompt-bar-glass flex h-14 w-full items-center gap-3 rounded-full px-5"
            onSubmit={(event) => {
              event.preventDefault()
              handleCustomSubmit()
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={customPrompt}
              onChange={(event) => setCustomPrompt(event.target.value)}
              placeholder={t('intentPlaceholder')}
              aria-label={t('intentAriaLabel')}
              className="min-w-0 flex-1 bg-transparent text-body text-on-surface placeholder:text-on-surface/40 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!customPrompt.trim()}
              aria-label={t('intentSubmit')}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-white transition active:scale-95 disabled:opacity-30"
            >
              <ArrowUp className="h-5 w-5" strokeWidth={2.25} aria-hidden="true" />
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
