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
    <div className="prompt-bar-glass flex h-12 w-full items-center gap-3 rounded-full px-4">
      <button
        type="button"
        onClick={onOpen}
        aria-label={placeholder}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <Sparkles className="h-5 w-5 shrink-0 text-accent" strokeWidth={2} aria-hidden="true" />
        <span className="truncate text-body font-medium text-on-surface/60">{placeholder}</span>
      </button>
      <button
        type="button"
        onClick={() => {
          onMicClick?.()
          onOpen()
        }}
        aria-label={t('startVoicePrompt')}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-sunset-start)] to-[var(--color-accent)] text-on-primary shadow-[0_0_16px_var(--color-accent-glow)] transition active:scale-95"
      >
        <Mic className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
      </button>
    </div>
  )
}
