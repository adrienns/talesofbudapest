'use client'

import { formatTime } from '@/utils/formatTime'
import type { PlayerControlsProps } from '@/types/audio'

export const PlayerControls = ({
  isPlaying,
  currentTime,
  duration,
  hasAudio,
  onPlayPause,
  onSeek,
}: PlayerControlsProps) => {
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onPlayPause}
          disabled={!hasAudio}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-accent text-on-primary shadow-lg shadow-accent/30 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPlaying ? (
            <svg viewBox="0 0 24 24" className="h-7 w-7 fill-current" aria-hidden="true">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="ml-1 h-7 w-7 fill-current" aria-hidden="true">
              <path d="M8 5.14v14.72a1 1 0 0 0 1.5.86l11.04-7.36a1 1 0 0 0 0-1.72L9.5 4.28A1 1 0 0 0 8 5.14Z" />
            </svg>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            disabled={!hasAudio}
            onChange={(event) => onSeek(Number(event.target.value))}
            style={{ '--progress': `${progress}%` } as React.CSSProperties}
            className="audio-progress w-full"
            aria-label="Playback progress"
          />
          <div className="mt-2 flex justify-between text-label tabular-nums text-on-surface/60 normal-case tracking-normal">
            <span>{formatTime(currentTime)}</span>
            <span>{hasAudio ? formatTime(duration) : '--:--'}</span>
          </div>
        </div>
      </div>

      {!hasAudio && (
        <p className="text-center text-label text-on-surface/50 normal-case tracking-normal">
          Audio tour coming soon for this landmark
        </p>
      )}
    </div>
  )
}
