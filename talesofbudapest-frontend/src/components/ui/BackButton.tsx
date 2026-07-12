'use client'

import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react'
import { useTranslations } from 'next-intl'

type BackButtonProps = {
  onClick: () => void
  direction?: 'left' | 'right' | 'up' | 'down'
  ariaLabel?: string
  className?: string
}

const chevrons = {
  left: ChevronLeft,
  right: ChevronRight,
  up: ChevronUp,
  down: ChevronDown,
}

export const BackButton = ({
  onClick,
  direction = 'left',
  ariaLabel,
  className = '',
}: BackButtonProps) => {
  const t = useTranslations('player')
  const Chevron = chevrons[direction]

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel ?? t('goBack')}
      className={`pointer-events-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-surface text-on-surface/70 shadow-[0_4px_16px_rgba(0,0,0,0.12)] transition active:scale-95 ${className}`}
    >
      <Chevron className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
    </button>
  )
}
