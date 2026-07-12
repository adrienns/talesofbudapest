'use client'

import { ChevronUp, Clock, MapPin } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { PlayerScrubber } from '@/components/ui/player/PlayerScrubber'
import { PlayerTransport } from '@/components/ui/player/PlayerTransport'
import type { TourSheetCollapsedProps } from '@/types/tourSheet'

export const TourSheetCollapsed = ({
  title,
  subtitle,
  chapterLabel,
  imageUrl,
  imageAlt,
  meta,
  isPlaying,
  currentTime,
  duration,
  hasAudio,
  isGenerating = false,
  canRequestAudio = false,
  generateError = null,
  historyDepth = null,
  onPlayPause,
  onSeek,
  onSkipBack,
  onSkipForward,
  onExpand,
  readyGlow = false,
}: TourSheetCollapsedProps) => {
  const t = useTranslations('player')

  const headerLine = [
    chapterLabel,
    meta?.distanceLine ? t('distanceToNext', { distance: meta.distanceLine }) : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const showThinSource = historyDepth === 'thin' && hasAudio && !isGenerating

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <button
        type="button"
        onClick={onExpand}
        className="flex w-full items-center justify-between gap-2 text-left"
        aria-label={t('swipeUpForMore')}
      >
        <div className="min-w-0">
          {headerLine && (
            <p className="text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-on-surface/45">
              {headerLine}
            </p>
          )}
          {subtitle && (
            <p className="mt-0.5 truncate text-[0.625rem] font-medium uppercase tracking-[0.1em] text-accent/80">
              {subtitle}
            </p>
          )}
        </div>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-dim text-on-surface/55">
          <ChevronUp className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </span>
      </button>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onExpand}
          className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-surface-dim"
          aria-label={t('swipeUpForMore')}
        >
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt={imageAlt ?? title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-accent/20 to-accent/5 font-serif text-xl font-bold text-accent/50">
              B
            </div>
          )}
        </button>

        <button
          type="button"
          onClick={onExpand}
          className="min-w-0 flex-1 text-left"
          aria-label={t('swipeUpForMore')}
        >
          <p className="line-clamp-2 font-serif text-base font-bold leading-tight text-on-surface">
            {title}
          </p>
        </button>

        <PlayerTransport
          isPlaying={isPlaying}
          hasAudio={hasAudio}
          isGenerating={isGenerating}
          canRequestAudio={canRequestAudio}
          onPlayPause={onPlayPause}
          onSkipBack={onSkipBack}
          onSkipForward={onSkipForward}
          readyGlow={readyGlow}
        />
      </div>

      <PlayerScrubber
        currentTime={currentTime}
        duration={duration}
        hasAudio={hasAudio}
        onSeek={onSeek}
      />

      {(meta?.locationLine || meta?.timingLine) && (
        <div className="rounded-2xl bg-surface-dim/90 px-4 py-3">
          {meta.locationLine && (
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-on-surface/40" aria-hidden="true" />
              <p className="text-sm leading-snug text-on-surface/75">{meta.locationLine}</p>
            </div>
          )}
          {meta.timingLine && meta.timingLine !== 'thin' && (
            <div className={`flex items-start gap-3 ${meta.locationLine ? 'mt-3 border-t border-on-surface/8 pt-3' : ''}`}>
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-on-surface/40" aria-hidden="true" />
              <p className="text-sm leading-snug text-on-surface/75">
                {t('walkTime', { minutes: meta.timingLine })}
              </p>
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onExpand}
        className="min-h-[1rem] w-full text-center text-[0.6875rem] leading-tight text-on-surface/50"
        aria-label={t('swipeUpForMore')}
      >
        {generateError ? (
          <span className="text-accent">{generateError}</span>
        ) : showThinSource ? (
          t('thinSourceNote')
        ) : (
          t('swipeUpForMore')
        )}
      </button>
    </div>
  )
}
