'use client'

import { Footprints, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { GlassSurface } from '@/components/ui/GlassSurface'
import type { LastNarrativePeek } from '@/features/narrative/hooks/useNarratives'

type ResumeTourBannerProps = {
  peek: LastNarrativePeek
  onResume: () => void
  onDismiss: () => void
}

export const ResumeTourBanner = ({ peek, onResume, onDismiss }: ResumeTourBannerProps) => {
  const t = useTranslations('resume')

  return (
    <GlassSurface className="q-bubble-in flex items-center gap-3 rounded-2xl px-4 py-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/12 text-accent">
        <Footprints className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-on-surface">
          {t('continueTitle', { title: peek.title })}
        </p>
        <p className="text-xs text-on-surface/55">
          {t('continueSubtitle', { chapter: peek.chapterIndex + 1, total: peek.chapterCount })}
        </p>
      </div>

      <button
        type="button"
        onClick={onResume}
        className="shrink-0 rounded-full bg-accent px-4 py-2 text-xs font-bold text-white transition active:scale-95"
      >
        {t('resume')}
      </button>

      <button
        type="button"
        onClick={onDismiss}
        aria-label={t('dismiss')}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-on-surface/40 transition active:scale-95"
      >
        <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
      </button>
    </GlassSurface>
  )
}
