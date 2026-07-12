'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { SwipeableTourSheet } from '@/components/ui/SwipeableTourSheet'
import { TourSheetCollapsed } from '@/components/ui/tour-sheet/TourSheetCollapsed'
import { TourSheetExpanded } from '@/components/ui/tour-sheet/TourSheetExpanded'
import { usePlaybackAudio } from '@/features/landmarks/hooks/usePlaybackAudio'
import { buildLandmarkMeta, buildTourChapterMeta } from '@/lib/narrative/tourSheetMeta'
import type { NarrativeRoute } from '@/types/narrative'
import type { PlaybackItem } from '@/types/narrative'
import type { SheetSnap } from '@/types/tourSheet'

type AudioDrawerProps = {
  playbackItem: PlaybackItem | null
  routeTitle?: string | null
  chapterIndex?: number
  activeRoute?: NarrativeRoute | null
  enableOnDemandAudio?: boolean
  onLandmarkAudioReady?: (audioUrl: string) => void
  onSkipBack?: () => void
  onSkipForward?: () => void
  readyGlow?: boolean
  chronicleLocationId?: string | null
  snap?: SheetSnap
  onSnapChange?: (snap: SheetSnap) => void
}

export const AudioDrawer = ({
  playbackItem,
  routeTitle,
  chapterIndex = 0,
  activeRoute = null,
  enableOnDemandAudio = false,
  onLandmarkAudioReady,
  onSkipBack,
  onSkipForward,
  readyGlow = false,
  chronicleLocationId = null,
  snap: controlledSnap,
  onSnapChange,
}: AudioDrawerProps) => {
  const t = useTranslations('player')
  const [internalSnap, setInternalSnap] = useState<SheetSnap>('collapsed')
  const snap = controlledSnap ?? internalSnap

  const setSnap = useCallback(
    (next: SheetSnap) => {
      onSnapChange?.(next)
      if (controlledSnap === undefined) {
        setInternalSnap(next)
      }
    },
    [controlledSnap, onSnapChange],
  )

  useEffect(() => {
    if (controlledSnap !== undefined) {
      return
    }
    setInternalSnap('collapsed')
  }, [controlledSnap, playbackItem?.id])

  const handleAudioReady = useCallback(
    (audioUrl: string) => {
      onLandmarkAudioReady?.(audioUrl)
    },
    [onLandmarkAudioReady],
  )

  const {
    isPlaying,
    currentTime,
    duration,
    hasAudio,
    isGenerating,
    generateError,
    canRequestAudio,
    script,
    audioUrl,
    historyDepth,
    togglePlayPause,
    seek,
  } = usePlaybackAudio(playbackItem?.audioUrl ?? null, playbackItem?.id ?? null, {
    enableOnDemand: enableOnDemandAudio,
    initialScript: playbackItem?.script ?? null,
    onAudioReady: handleAudioReady,
  })

  const displayImageUrl = playbackItem?.imageUrl ?? null
  const displayTitle = routeTitle
    ? `${routeTitle}: ${t('chapter', { number: chapterIndex + 1 })}`
    : playbackItem?.title ?? ''

  const handleShare = useCallback(() => {
    if (typeof navigator === 'undefined') {
      return
    }

    const shareData = {
      title: displayTitle,
      text: displayTitle,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
    }

    if (navigator.share) {
      navigator.share(shareData).catch(() => {})
      return
    }

    if (navigator.clipboard && shareData.url) {
      navigator.clipboard.writeText(shareData.url).catch(() => {})
    }
  }, [displayTitle])

  const handleDownload = useCallback(async () => {
    if (!audioUrl) {
      return
    }

    const fileName = `${displayTitle.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'audio-tour'}.mp3`

    try {
      const response = await fetch(audioUrl)
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = fileName
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(objectUrl)
    } catch {
      window.open(audioUrl, '_blank', 'noopener')
    }
  }, [audioUrl, displayTitle])

  if (!playbackItem) {
    return null
  }

  const chapterLabel =
    playbackItem.chapterLabel ??
    `• ${t('chapter', { number: String(chapterIndex + 1).padStart(2, '0') })}`
  const subtitle = playbackItem.subtitle ?? t('narrativeArchive')
  const imageAlt = playbackItem.imageAlt ?? playbackItem.title
  const onShare = hasAudio || canRequestAudio ? handleShare : undefined
  const onDownload = hasAudio ? handleDownload : undefined

  const meta = activeRoute
    ? buildTourChapterMeta(activeRoute, chapterIndex)
    : buildLandmarkMeta(playbackItem.title)

  const transportProps = {
    isPlaying,
    currentTime,
    duration,
    hasAudio,
    isGenerating,
    canRequestAudio,
    generateError,
    historyDepth,
    onPlayPause: () => {
      void togglePlayPause()
    },
    onSeek: seek,
    onSkipBack,
    onSkipForward,
    readyGlow,
  }

  const mediaProps = {
    title: displayTitle,
    subtitle,
    chapterLabel,
    imageUrl: displayImageUrl,
    imageAlt,
    script,
    meta,
    onShare,
    onDownload,
  }

  return (
    <SwipeableTourSheet
      snap={snap}
      onSnapChange={setSnap}
      hideBottomNav={snap === 'expanded'}
      ariaLabel={t('nowPlaying')}
      collapsed={
        <TourSheetCollapsed
          {...mediaProps}
          {...transportProps}
          onExpand={() => setSnap('expanded')}
        />
      }
      expanded={
        <TourSheetExpanded
          {...mediaProps}
          {...transportProps}
          onCollapse={() => setSnap('collapsed')}
          chronicleLocationId={chronicleLocationId}
        />
      }
    />
  )
}
