'use client'

import { useEffect, useState } from 'react'
import { GENERATING_MESSAGES } from '@/constants/narrative'

type NarrativeGeneratingOverlayProps = {
  isVisible: boolean
  error?: string | null
  onRetry?: () => void
  onDismiss?: () => void
}

export const NarrativeGeneratingOverlay = ({
  isVisible,
  error,
  onRetry,
  onDismiss,
}: NarrativeGeneratingOverlayProps) => {
  const [messageIndex, setMessageIndex] = useState(0)

  useEffect(() => {
    if (!isVisible || error) {
      return
    }

    const interval = window.setInterval(() => {
      setMessageIndex((current) => (current + 1) % GENERATING_MESSAGES.length)
    }, 2800)

    return () => window.clearInterval(interval)
  }, [error, isVisible])

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
                  Try again
                </button>
              )}
              {onDismiss && (
                <button
                  type="button"
                  onClick={onDismiss}
                  className="rounded-xl border border-on-primary/30 px-5 py-3 text-body text-on-primary/80"
                >
                  Cancel
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
              {GENERATING_MESSAGES[messageIndex]}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
