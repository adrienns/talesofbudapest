'use client'

import { ChevronLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'

type MapFloatingBackButtonProps = {
  onClick: () => void
  className?: string
}

export const MapFloatingBackButton = ({ onClick, className = '' }: MapFloatingBackButtonProps) => {
  const t = useTranslations('player')

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t('goBack')}
      className={`pointer-events-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-surface text-on-surface/70 shadow-[0_4px_16px_rgba(0,0,0,0.12)] transition active:scale-95 ${className}`}
    >
      <ChevronLeft className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
    </button>
  )
}
