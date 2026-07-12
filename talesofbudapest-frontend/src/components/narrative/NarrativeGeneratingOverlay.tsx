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
}

export const NarrativeGeneratingOverlay = ({
  isVisible,
  mode = 'generating',
  error,
  onRetry,
  onDismiss,
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
          </>
        )}
      </div>
    </div>
  )
}
