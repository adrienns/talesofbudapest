'use client'

import { motion } from 'framer-motion'
import { ChevronDown, Download, Share2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { ChroniclePanel } from '@/components/chronicle/ChroniclePanel'
import { IconButton } from '@/components/ui/IconButton'
import { PlayerScrubber } from '@/components/ui/player/PlayerScrubber'
import { PlayerTransport } from '@/components/ui/player/PlayerTransport'
import { TranscriptSection } from '@/components/ui/player/TranscriptSection'
import type { TourSheetExpandedProps } from '@/types/tourSheet'

export const TourSheetExpanded = ({
  title,
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
  routeStops = [],
  currentStopIndex = 0,
  onCollapse,
  readyGlow = false,
  chronicleLocationId = null,
}: TourSheetExpandedProps) => {
  const t = useTranslations('player')
  const nextStop = routeStops[currentStopIndex + 1]

  return (
    <div className="flex flex-col gap-5 pb-2">
      <header className="flex items-center justify-between gap-3">
        <IconButton
          icon={ChevronDown}
          onClick={onCollapse}
          ariaLabel={t('collapseSheet')}
        />
        <p className="text-[0.625rem] font-medium uppercase tracking-[0.14em] text-on-surface/45">
          {t('nowPlaying')}
        </p>
        <span className="h-10 w-10" aria-hidden="true" />
      </header>

      <motion.div
        layoutId="tour-player-artwork"
        className="aspect-[16/10] max-h-[38dvh] w-full overflow-hidden rounded-3xl bg-surface-dim shadow-md"
        transition={{ type: 'spring', stiffness: 380, damping: 36 }}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={imageAlt ?? title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-accent/15 to-accent/5">
            <span className="font-serif text-6xl font-bold text-accent/45">B</span>
          </div>
        )}
      </motion.div>

      <div className="min-w-0 text-center">
        <h1 className="text-balance font-serif text-2xl font-bold leading-tight text-on-surface">
          {title}
        </h1>
        {chapterLabel && (
          <p className="mt-1 truncate text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-on-surface/45">
            {chapterLabel}
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
        playLayoutId="tour-player-primary-control"
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

      {nextStop && (
        <section className="mt-8 border-t border-outline-variant/35 pt-5" aria-label={t('tourTimeline')}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-[var(--map-orange)]">
              {t('upNext')}
            </h2>
            <span className="text-[0.6875rem] font-medium text-on-surface/45">
              {t('stop', { number: currentStopIndex + 2 })}
            </span>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-white/55 bg-white/35 p-3 shadow-[0_8px_20px_rgba(45,41,38,0.07)]">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-surface-dim">
              {nextStop.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={nextStop.imageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center font-serif text-lg font-bold text-[var(--map-orange)]/55">
                  {currentStopIndex + 2}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-on-surface/45">{t('upNext')}</p>
              <p className="mt-0.5 line-clamp-2 font-serif text-lg font-bold leading-tight text-on-surface">{nextStop.title}</p>
            </div>
          </div>

          <ol className="mt-5 space-y-0" aria-label={t('tourTimeline')}>
            {routeStops.slice(currentStopIndex + 1).map((stop, index) => {
              const stopNumber = currentStopIndex + index + 2
              return (
                <li key={stop.id} className="relative flex gap-3 pb-4 last:pb-0">
                  {index < routeStops.slice(currentStopIndex + 1).length - 1 && (
                    <span className="absolute left-[0.6875rem] top-7 h-[calc(100%-0.5rem)] border-l border-dashed border-[var(--map-orange)]/35" aria-hidden="true" />
                  )}
                  <span className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--map-orange)] text-[0.6875rem] font-bold text-white">
                    {stopNumber}
                  </span>
                  <p className="pt-0.5 text-sm font-medium leading-tight text-on-surface/70">{stop.title}</p>
                </li>
              )
            })}
          </ol>
        </section>
      )}

      <TranscriptSection
        script={script}
        isGenerating={isGenerating}
        currentTime={currentTime}
        duration={duration}
        hasAudio={hasAudio}
        onSeek={onSeek}
      />

      {chronicleLocationId && (
        <div className="-mx-1 overflow-hidden rounded-2xl border border-outline-variant/30">
          <ChroniclePanel locationId={chronicleLocationId} />
        </div>
      )}
    </div>
  )
}
