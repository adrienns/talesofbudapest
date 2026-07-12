'use client'

import { ChevronDown, Download, Share2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { ChroniclePanel } from '@/components/chronicle/ChroniclePanel'
import { PlayerScrubber } from '@/components/ui/player/PlayerScrubber'
import { PlayerTransport } from '@/components/ui/player/PlayerTransport'
import { TranscriptSection } from '@/components/ui/player/TranscriptSection'
import type { TourSheetExpandedProps } from '@/types/tourSheet'

export const TourSheetExpanded = ({
  title,
  subtitle,
  chapterLabel,
  imageUrl,
  imageAlt,
  script,
  isPlaying,
  currentTime,
  duration,
  hasAudio,
  isGenerating = false,
  canRequestAudio = false,
  generateError = null,
  onPlayPause,
  onSeek,
  onSkipBack,
  onSkipForward,
  onShare,
  onDownload,
  onCollapse,
  readyGlow = false,
  chronicleLocationId = null,
}: TourSheetExpandedProps) => {
  const t = useTranslations('player')

  return (
    <div className="flex flex-col gap-5 pb-2">
      <header className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onCollapse}
          aria-label={t('collapseSheet')}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-dim/80 text-on-surface/60 transition active:scale-95"
        >
          <ChevronDown className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
        </button>
        <p className="text-[0.625rem] font-medium uppercase tracking-[0.14em] text-on-surface/45">
          {t('nowPlaying')}
        </p>
        <span className="h-10 w-10" aria-hidden="true" />
      </header>

      <div className="aspect-[16/10] max-h-[38dvh] w-full overflow-hidden rounded-3xl bg-surface-dim shadow-md">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={imageAlt ?? title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-accent/15 to-accent/5">
            <span className="font-serif text-6xl font-bold text-accent/45">B</span>
          </div>
        )}
      </div>

      <div className="min-w-0 text-center">
        <h1 className="text-balance font-serif text-2xl font-bold leading-tight text-on-surface">
          {title}
        </h1>
        {(subtitle || chapterLabel) && (
          <p className="mt-1 truncate text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-on-surface/45">
            {[subtitle, chapterLabel].filter(Boolean).join(' ')}
          </p>
        )}
      </div>

      <PlayerScrubber
        currentTime={currentTime}
        duration={duration}
        hasAudio={hasAudio}
        onSeek={onSeek}
      />

      <PlayerTransport
        size="lg"
        isPlaying={isPlaying}
        hasAudio={hasAudio}
        isGenerating={isGenerating}
        canRequestAudio={canRequestAudio}
        onPlayPause={onPlayPause}
        onSkipBack={onSkipBack}
        onSkipForward={onSkipForward}
        readyGlow={readyGlow}
      />

      {generateError && (
        <p className="text-center text-[0.75rem] text-accent">{generateError}</p>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onShare}
          disabled={!onShare}
          aria-label={t('share')}
          className="flex h-10 w-10 items-center justify-center text-accent/55 transition active:scale-95 disabled:opacity-30"
        >
          <Share2 className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={onDownload}
          disabled={!onDownload || !hasAudio}
          aria-label={t('download')}
          className="flex h-10 w-10 items-center justify-center text-accent/55 transition active:scale-95 disabled:opacity-30"
        >
          <Download className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>

      <TranscriptSection script={script} isGenerating={isGenerating} />

      {chronicleLocationId && (
        <div className="-mx-1 overflow-hidden rounded-2xl border border-outline-variant/30">
          <ChroniclePanel locationId={chronicleLocationId} />
        </div>
      )}
    </div>
  )
}
