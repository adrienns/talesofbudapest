'use client'

import { useTranslations } from 'next-intl'
import { formatRemainingTime, formatTime } from '@/utils/formatTime'

type PlayerScrubberProps = {
  currentTime: number
  duration: number
  hasAudio: boolean
  onSeek: (time: number) => void
  /** 'onImage' styles the bar and labels for a dark image overlay. */
  tone?: 'surface' | 'onImage' | 'musicSheet'
}

export const PlayerScrubber = ({
  currentTime,
  duration,
  hasAudio,
  onSeek,
  tone = 'surface',
}: PlayerScrubberProps) => {
  const t = useTranslations('player')
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0
  const onImage = tone === 'onImage'
  const musicSheet = tone === 'musicSheet'

  return (
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
        className={`audio-progress-mini w-full ${onImage ? 'audio-progress-overlay' : ''} ${musicSheet ? 'audio-progress-music' : ''}`}
        aria-label={t('playbackProgress')}
      />
      <div
        className={`flex justify-between text-[0.6875rem] tabular-nums ${
          onImage ? 'text-white/75' : musicSheet ? 'text-[var(--map-text)]/55' : 'text-on-surface/40'
        }`}
      >
        <span>{formatTime(currentTime)}</span>
        <span>{hasAudio ? formatRemainingTime(currentTime, duration) : '--:--'}</span>
      </div>
    </div>
  )
}
