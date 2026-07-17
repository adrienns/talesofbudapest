'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'

type NarrativeGeneratingOverlayProps = {
  isVisible: boolean
  /** 'planning' shows the (faster) route-planning message set. */
  mode?: 'planning' | 'generating'
  error?: string | null
  onRetry?: () => void
  onDismiss?: () => void
  stage?: string | null
  progress?: { current: number; total: number }
}

export const NarrativeGeneratingOverlay = ({
  isVisible,
  mode = 'generating',
  error,
  onRetry,
  onDismiss,
  stage,
  progress,
}: NarrativeGeneratingOverlayProps) => {
  const t = useTranslations('narrative')
  const generatingMessages = useMemo(
    () => t.raw(mode === 'planning' ? 'planningMessages' : 'generatingMessages') as string[],
    [mode, t],
  )
  const [messageIndex, setMessageIndex] = useState(0)

  useEffect(() => {
    if (!isVisible || error) {
      return
    }

    const interval = window.setInterval(() => {
      setMessageIndex((current) => (current + 1) % generatingMessages.length)
    }, 2800)

    return () => window.clearInterval(interval)
  }, [error, generatingMessages.length, isVisible])

  if (!isVisible) {
    return null
  }

  return (
    <div className="generating-overlay fixed inset-0 z-50 flex items-center justify-center backdrop-blur-md">
      <div className="flex max-w-sm flex-col items-center gap-6 px-8 text-center">
        {error ? (
          <>
            <p className="text-headline text-on-primary">{error}</p>
            <div className="flex gap-3">
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="rounded-xl bg-gradient-to-r from-[var(--color-sunset-start)] to-[var(--color-accent)] px-5 py-3 text-body font-semibold text-on-primary shadow-[0_0_20px_var(--color-accent-glow)]"
                >
                  {t('tryAgain')}
                </button>
              )}
              {onDismiss && (
                <button
                  type="button"
                  onClick={onDismiss}
                  className="rounded-xl border border-on-primary/30 px-5 py-3 text-body text-on-primary/80"
                >
                  {t('cancel')}
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="narrative-orb" aria-hidden="true">
              <div className="narrative-orb__core" />
              <div className="narrative-orb__ring narrative-orb__ring--one" />
              <div className="narrative-orb__ring narrative-orb__ring--two" />
            </div>
            <div className="narrative-wave" aria-hidden="true">
              {Array.from({ length: 5 }).map((_, index) => (
                <span key={index} className="narrative-wave__bar" style={{ animationDelay: `${index * 0.12}s` }} />
              ))}
            </div>
            <p className="text-headline text-on-primary">
              {generatingMessages[messageIndex]}
            </p>
            {mode === 'generating' && stage && (
              <div className="w-full rounded-2xl border border-on-primary/20 bg-on-primary/10 px-4 py-3 text-on-primary">
                <p className="text-sm font-semibold">{t(`generationStages.${stage}`)}</p>
                {Boolean(progress?.total) && (
                  <>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-on-primary/20">
                      <div
                        className="h-full rounded-full bg-on-primary transition-all"
                        style={{ width: `${Math.min(100, ((progress?.current ?? 0) / (progress?.total ?? 1)) * 100)}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-on-primary/75">
                      {t('generationProgress', { current: progress?.current ?? 0, total: progress?.total ?? 0 })}
                    </p>
                  </>
                )}
                <p className="mt-2 text-xs text-on-primary/65">{t('safeToLeave')}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
