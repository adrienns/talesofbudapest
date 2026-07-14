'use client'

import { Mic, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'

type PromptBarProps = {
  onOpen: () => void
  onMicClick?: () => void
}

export const PromptBar = ({ onOpen, onMicClick }: PromptBarProps) => {
  const t = useTranslations('prompt')
  const placeholder = t('placeholder')

  return (
    <div className="map-search-pill flex h-12 w-full items-center gap-3 rounded-full px-4">
      <button
        type="button"
        onClick={onOpen}
        aria-label={placeholder}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <Sparkles className="h-5 w-5 shrink-0 text-[var(--map-teal)]" strokeWidth={1.75} aria-hidden="true" />
        <span className="truncate text-body font-medium text-on-surface/60">{placeholder}</span>
      </button>
      <button
        type="button"
        onClick={() => {
          onMicClick?.()
          onOpen()
        }}
        aria-label={t('startVoicePrompt')}
        className="map-primary-action flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-on-primary transition active:scale-95"
      >
        <Mic className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
      </button>
    </div>
  )
}
