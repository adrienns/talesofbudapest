'use client'

import { Loader2, Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { TerracottaButton } from '@/components/ui/TerracottaButton'

type PlayerTransportProps = {
  isPlaying: boolean
  hasAudio: boolean
  isGenerating?: boolean
  canRequestAudio?: boolean
  onPlayPause: () => void
  onSkipBack?: () => void
  onSkipForward?: () => void
  readyGlow?: boolean
  size?: 'sm' | 'lg'
  /** 'onImage' lightens the skip buttons for a dark image overlay. */
  tone?: 'surface' | 'onImage'
}

export const PlayerTransport = ({
  isPlaying,
  hasAudio,
  isGenerating = false,
  canRequestAudio = false,
  onPlayPause,
  onSkipBack,
  onSkipForward,
  readyGlow = false,
  size = 'sm',
  tone = 'surface',
}: PlayerTransportProps) => {
  const t = useTranslations('player')
  const canPlay = hasAudio || canRequestAudio
  const playLabel = isGenerating ? t('generatingAudioTour') : isPlaying ? t('pause') : t('play')

  const isLarge = size === 'lg'
  const sideBtn = isLarge ? 'h-12 w-12' : 'h-9 w-9'
  const sideIcon = isLarge ? 'h-6 w-6' : 'h-[1.125rem] w-[1.125rem]'
  const playBtn = isLarge ? 'h-16 w-16' : 'h-11 w-11'
  const playIcon = isLarge ? 'h-6 w-6' : 'h-[1.125rem] w-[1.125rem]'
  const sideColor = tone === 'onImage' ? 'text-white/85' : 'text-accent/55'

  return (
    <div className={`flex shrink-0 items-center justify-center ${isLarge ? 'gap-6' : 'gap-0.5'}`}>
      <button
        type="button"
        onClick={onSkipBack}
        disabled={!onSkipBack}
        aria-label={t('previousChapter')}
        className={`flex ${sideBtn} items-center justify-center ${sideColor} transition active:scale-95 disabled:opacity-30`}
      >
        <SkipBack className={sideIcon} strokeWidth={1.75} aria-hidden="true" />
      </button>

      <TerracottaButton
        onClick={onPlayPause}
        disabled={!canPlay || isGenerating}
        aria-label={playLabel}
        readyGlow={readyGlow}
        className={`flex ${playBtn} items-center justify-center`}
      >
        {isGenerating ? (
          <Loader2 className={`${playIcon} animate-spin`} aria-hidden="true" />
        ) : isPlaying ? (
          <Pause className={`${playIcon} fill-current`} aria-hidden="true" />
        ) : (
          <Play className={`ml-0.5 ${playIcon} fill-current`} aria-hidden="true" />
        )}
      </TerracottaButton>

      <button
        type="button"
        onClick={onSkipForward}
        disabled={!onSkipForward}
        aria-label={t('nextChapter')}
        className={`flex ${sideBtn} items-center justify-center ${sideColor} transition active:scale-95 disabled:opacity-30`}
      >
        <SkipForward className={sideIcon} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  )
}
