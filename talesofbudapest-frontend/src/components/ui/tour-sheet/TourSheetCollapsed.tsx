'use client'

import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { PlayerScrubber } from '@/components/ui/player/PlayerScrubber'
import { PlayerTransport } from '@/components/ui/player/PlayerTransport'
import type { TourSheetCollapsedProps } from '@/types/tourSheet'

export const TourSheetCollapsed = ({
  title,
  chapterLabel,
  imageUrl,
  imageAlt,
  isPlaying,
  currentTime,
  duration,
  hasAudio,
  isGenerating = false,
  canRequestAudio = false,
  generateError = null,
  onPlayPause,
  onSeek,
  onExpand,
  readyGlow = false,
}: TourSheetCollapsedProps) => {
  const t = useTranslations('player')
  const marqueeRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLParagraphElement>(null)
  const [marqueeDistance, setMarqueeDistance] = useState(0)

  useEffect(() => {
    const measureTitle = () => {
      const availableWidth = marqueeRef.current?.clientWidth ?? 0
      const titleWidth = titleRef.current?.scrollWidth ?? 0
      setMarqueeDistance(Math.max(0, titleWidth - availableWidth))
    }

    measureTitle()
    const observer = new ResizeObserver(measureTitle)
    if (marqueeRef.current) observer.observe(marqueeRef.current)

    return () => observer.disconnect()
  }, [title])

  return (
    <div className="tour-sheet-collapsed flex min-h-0 flex-1 flex-col justify-center gap-1" onClick={onExpand}>
      <div className="flex min-w-0 items-center gap-2">
        <motion.button
          type="button"
          layoutId="tour-player-artwork"
          onClick={onExpand}
          className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-[#e4dee0]"
          aria-label={t('swipeUpForMore')}
          transition={{ type: 'spring', stiffness: 380, damping: 36 }}
        >
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt={imageAlt ?? title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[var(--map-orange)]/20 to-[var(--map-orange)]/5 font-serif text-3xl font-bold text-[var(--map-orange)]/60">
              B
            </div>
          )}
        </motion.button>

        <button
          type="button"
          onClick={onExpand}
          className="min-w-0 flex-1 text-left"
          aria-label={t('swipeUpForMore')}
        >
          <div ref={marqueeRef} className="tour-sheet-title-marquee">
            <p
              ref={titleRef}
              className={`tour-sheet-title-marquee__text font-serif text-base font-bold leading-tight text-[var(--map-text)] ${marqueeDistance > 1 ? 'is-marquee' : ''}`}
              style={marqueeDistance > 1 ? { '--marquee-distance': `-${marqueeDistance}px` } as React.CSSProperties : undefined}
            >
              {title}
            </p>
          </div>
          {chapterLabel && <p className="mt-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.11em] text-[var(--map-text)]/55">{chapterLabel}</p>}
        </button>

      </div>

      <PlayerScrubber
        currentTime={currentTime}
        duration={duration}
        hasAudio={hasAudio}
        onSeek={onSeek}
        tone="musicSheet"
      />

      <div className="flex justify-center" onClick={(event) => event.stopPropagation()}>
        <PlayerTransport
          size="sm"
          tone="musicSheet"
          isPlaying={isPlaying}
          hasAudio={hasAudio}
          isGenerating={isGenerating}
          canRequestAudio={canRequestAudio}
          onPlayPause={onPlayPause}
          onRewind={() => onSeek(Math.max(0, currentTime - 10))}
          onFastForward={() => onSeek(Math.min(duration, currentTime + 10))}
          playLayoutId="tour-player-primary-control"
          readyGlow={readyGlow}
        />
      </div>

      {generateError && (
        <button
          type="button"
          onClick={onExpand}
          className="min-h-[1rem] w-full text-center text-sm leading-tight text-on-surface/50"
          aria-label={t('swipeUpForMore')}
        >
          <span className="text-accent">{generateError}</span>
        </button>
      )}
    </div>
  )
}
