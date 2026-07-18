'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useAudioPlayer } from '@/features/landmarks/hooks/useAudioPlayer'
import { requestLandmarkAudio } from '@/services/landmarkAudioService'
import { useTourPreferencesStore } from '@/stores/tourPreferencesStore'
import type { AppLocale } from '@/types/locale'

type UsePlaybackAudioOptions = {
  enableOnDemand?: boolean
  initialScript?: string | null
  onAudioReady?: (audioUrl: string) => void
  initialPlaybackPosition?: number
  onPlaybackEnded?: () => void
}

type UsePlaybackAudioResult = {
  isPlaying: boolean
  currentTime: number
  duration: number
  playbackRate: number
  hasAudio: boolean
  isGenerating: boolean
  generateError: string | null
  canRequestAudio: boolean
  script: string | null
  audioUrl: string | null
  historyDepth: string | null
  togglePlayPause: () => Promise<void>
  play: () => Promise<void>
  seek: (time: number) => void
  setPlaybackRate: (rate: number) => void
}

export const usePlaybackAudio = (
  audioUrl: string | null,
  landmarkId: string | null,
  options: UsePlaybackAudioOptions = {},
): UsePlaybackAudioResult => {
  const locale = useLocale() as AppLocale
  const t = useTranslations('errors')
  const styleId = useTourPreferencesStore((state) => state.styleId)
  const topicIds = useTourPreferencesStore((state) => state.topicIds)
  const {
    enableOnDemand = false,
    initialScript = null,
    onAudioReady,
    initialPlaybackPosition = 0,
    onPlaybackEnded,
  } = options
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(audioUrl)
  const [script, setScript] = useState<string | null>(initialScript)
  const [historyDepth, setHistoryDepth] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const shouldAutoPlayRef = useRef(false)
  const itemKeyRef = useRef<string | null>(null)

  const topicKey = topicIds.join(',')

  useEffect(() => {
    const itemKey = `${landmarkId ?? ''}|${locale}|${styleId}|${topicKey}`
    const isNewItem = itemKeyRef.current !== itemKey
    itemKeyRef.current = itemKey

    setResolvedUrl(audioUrl)

    if (isNewItem) {
      setScript(initialScript)
      setHistoryDepth(null)
      setGenerateError(null)
      setIsGenerating(false)
      shouldAutoPlayRef.current = false
    }
  }, [audioUrl, landmarkId, locale, initialScript, styleId, topicKey])

  const activeUrl = resolvedUrl ?? audioUrl
  const { isPlaying, currentTime, duration, playbackRate, hasAudio, togglePlayPause, seek, play, setPlaybackRate } =
    useAudioPlayer(activeUrl, { initialTime: initialPlaybackPosition, onEnded: onPlaybackEnded })

  useEffect(() => {
    if (!activeUrl || !shouldAutoPlayRef.current) {
      return
    }

    shouldAutoPlayRef.current = false
    void play()
  }, [activeUrl, play])

  const canRequestAudio = enableOnDemand && Boolean(landmarkId) && !activeUrl

  const handlePlayPause = useCallback(async () => {
    if (activeUrl) {
      await togglePlayPause()
      return
    }

    if (!canRequestAudio || !landmarkId || isGenerating) {
      return
    }

    setIsGenerating(true)
    setGenerateError(null)

    try {
      const result = await requestLandmarkAudio(landmarkId, locale, { styleId, topicIds })
      shouldAutoPlayRef.current = true
      setResolvedUrl(result.audioUrl)
      setScript(result.script)
      setHistoryDepth(result.historyDepth ?? null)
      onAudioReady?.(result.audioUrl)
    } catch (error) {
      setGenerateError(error instanceof Error ? error.message : t('failedToGenerateAudio'))
    } finally {
      setIsGenerating(false)
    }
  }, [
    activeUrl,
    canRequestAudio,
    isGenerating,
    landmarkId,
    locale,
    onAudioReady,
    styleId,
    t,
    topicIds,
    togglePlayPause,
  ])

  return {
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    hasAudio: Boolean(activeUrl),
    isGenerating,
    generateError,
    canRequestAudio,
    script,
    audioUrl: activeUrl,
    historyDepth,
    togglePlayPause: handlePlayPause,
    play,
    seek,
    setPlaybackRate,
  }
}
