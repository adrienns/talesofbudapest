'use client'

import { useEffect, useState } from 'react'
import { MiniPlayerControls } from '@/components/ui/MiniPlayerControls'
import { NARRATIVE_ARCHIVE_LABEL } from '@/constants/audio'
import { useAudioPlayer } from '@/features/landmarks/hooks/useAudioPlayer'
import type { PlaybackItem } from '@/types/narrative'

type AudioDrawerProps = {
  playbackItem: PlaybackItem | null
  routeTitle?: string | null
  chapterIndex?: number
  onSkipBack?: () => void
  onSkipForward?: () => void
  readyGlow?: boolean
}

const formatChapterLabel = (index: number) => `• CH. ${String(index + 1).padStart(2, '0')}`

export const AudioDrawer = ({
  playbackItem,
  routeTitle,
  chapterIndex = 0,
  onSkipBack,
  onSkipForward,
  readyGlow = false,
}: AudioDrawerProps) => {
  const [coverUrl, setCoverUrl] = useState<string | null>(null)

  useEffect(() => {
    setCoverUrl(null)
  }, [playbackItem?.id])

  const { isPlaying, currentTime, duration, hasAudio, togglePlayPause, seek } =
    useAudioPlayer(playbackItem?.audioUrl ?? null)

  if (!playbackItem) {
    return null
  }

  const displayImageUrl = coverUrl ?? playbackItem.imageUrl
  const displayTitle = routeTitle
    ? `${routeTitle}: Chapter ${chapterIndex + 1}`
    : playbackItem.title

  return (
    <aside
      role="region"
      aria-label="Now playing"
      className="fixed inset-x-3 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-lg transition-transform duration-300"
    >
      <div className="audio-card-glass relative overflow-hidden rounded-[1.375rem] px-4 py-3.5">
        <MiniPlayerControls
          title={displayTitle}
          subtitle={playbackItem.subtitle ?? NARRATIVE_ARCHIVE_LABEL}
          chapterLabel={playbackItem.chapterLabel ?? formatChapterLabel(chapterIndex)}
          imageUrl={displayImageUrl}
          imageAlt={playbackItem.imageAlt ?? playbackItem.title}
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          hasAudio={hasAudio}
          onPlayPause={togglePlayPause}
          onSeek={seek}
          onSkipBack={onSkipBack}
          onSkipForward={onSkipForward}
          readyGlow={readyGlow && hasAudio && !isPlaying}
        />
      </div>
    </aside>
  )
}
