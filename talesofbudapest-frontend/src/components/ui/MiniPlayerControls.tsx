'use client'

import { Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { formatRemainingTime, formatTime } from '@/utils/formatTime'
import type { MiniPlayerControlsProps } from '@/types/audio'

export const MiniPlayerControls = ({
  title,
  subtitle,
  chapterLabel,
  imageUrl,
  imageAlt,
  isPlaying,
  currentTime,
  duration,
  hasAudio,
  onPlayPause,
  onSeek,
  onSkipBack,
  onSkipForward,
  readyGlow = false,
}: MiniPlayerControlsProps) => {
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="relative z-[1] flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div
          className="h-[3.25rem] w-[3.25rem] shrink-0 overflow-hidden rounded-xl bg-surface-dim"
          aria-hidden={imageUrl ? undefined : true}
        >
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={imageAlt ?? title}
              className="h-full w-full object-cover grayscale"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-accent/15 to-accent/5">
              <span className="font-serif text-lg font-bold text-accent/45">B</span>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate font-serif text-[1.0625rem] font-bold leading-tight text-on-surface">
            {title}
          </p>
          {subtitle && (
            <p className="mt-0.5 truncate text-[0.625rem] font-medium uppercase tracking-[0.12em] text-on-surface/45">
              {subtitle}
            </p>
          )}
          {chapterLabel && (
            <p className="truncate text-[0.625rem] font-medium uppercase tracking-[0.12em] text-on-surface/45">
              {chapterLabel}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={onSkipBack}
            disabled={!onSkipBack}
            aria-label="Previous chapter"
            className="flex h-9 w-9 items-center justify-center text-accent/55 transition active:scale-95 disabled:opacity-30"
          >
            <SkipBack className="h-[1.125rem] w-[1.125rem]" strokeWidth={1.75} aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={onPlayPause}
            disabled={!hasAudio}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className={`terracotta-glow-btn audio-play-btn flex h-11 w-11 items-center justify-center rounded-full transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${
              readyGlow ? 'play-ready-glow' : ''
            }`}
          >
            {isPlaying ? (
              <Pause className="h-[1.125rem] w-[1.125rem] fill-current" aria-hidden="true" />
            ) : (
              <Play className="ml-0.5 h-[1.125rem] w-[1.125rem] fill-current" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={onSkipForward}
            disabled={!onSkipForward}
            aria-label="Next chapter"
            className="flex h-9 w-9 items-center justify-center text-accent/55 transition active:scale-95 disabled:opacity-30"
          >
            <SkipForward className="h-[1.125rem] w-[1.125rem]" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div>
        <input
          type="range"
          min={0}
          max={duration || 100}
          step={0.1}
          value={currentTime}
          disabled={!hasAudio}
          onChange={(event) => onSeek(Number(event.target.value))}
          style={{ '--progress': `${progress}%` } as React.CSSProperties}
          className="audio-progress-mini w-full"
          aria-label="Playback progress"
        />
        <div className="mt-1.5 flex justify-between text-[0.6875rem] tabular-nums text-on-surface/40">
          <span>{formatTime(currentTime)}</span>
          <span>{hasAudio ? formatRemainingTime(currentTime, duration) : '--:--'}</span>
        </div>
      </div>

      {!hasAudio && (
        <p className="text-center text-[0.6875rem] text-on-surface/40">
          Audio tour coming soon
        </p>
      )}
    </div>
  )
}
