'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createWebAudioPlayer } from '@/adapters/audio/webAudioPlayer'
import type { AudioPlayerAdapter } from '@/types/audio'

type UseAudioPlayerResult = {
  isPlaying: boolean
  currentTime: number
  duration: number
  playbackRate: number
  hasAudio: boolean
  togglePlayPause: () => Promise<void>
  play: () => Promise<void>
  seek: (time: number) => void
  setPlaybackRate: (rate: number) => void
}

type UseAudioPlayerOptions = {
  initialTime?: number
  onEnded?: () => void
}

export const useAudioPlayer = (
  audioUrl: string | null,
  { initialTime = 0, onEnded }: UseAudioPlayerOptions = {},
): UseAudioPlayerResult => {
  const adapterRef = useRef<AudioPlayerAdapter | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playbackRate, setPlaybackRateState] = useState(1)

  useEffect(() => {
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setPlaybackRateState(1)

    adapterRef.current?.destroy()
    adapterRef.current = null

    if (!audioUrl) {
      return
    }

    const adapter = createWebAudioPlayer(audioUrl)
    adapterRef.current = adapter

    const unsubscribeTime = adapter.onTimeUpdate(setCurrentTime)
    const unsubscribeMeta = adapter.onLoadedMetadata((nextDuration) => {
      setDuration(nextDuration)

      const safeInitialTime = Math.min(Math.max(initialTime, 0), nextDuration)
      if (safeInitialTime > 0 && safeInitialTime < nextDuration) {
        adapter.seek(safeInitialTime)
        setCurrentTime(safeInitialTime)
      }
    })
    const unsubscribeEnded = adapter.onEnded(() => {
      setIsPlaying(false)
      onEnded?.()
    })

    return () => {
      unsubscribeTime()
      unsubscribeMeta()
      unsubscribeEnded()
      adapter.destroy()
      adapterRef.current = null
    }
  }, [audioUrl, initialTime, onEnded])

  const play = useCallback(async () => {
    const adapter = adapterRef.current
    if (!adapter) return

    await adapter.play()
    setIsPlaying(true)
  }, [])

  const togglePlayPause = useCallback(async () => {
    const adapter = adapterRef.current
    if (!adapter) return

    if (isPlaying) {
      adapter.pause()
      setIsPlaying(false)
      return
    }

    await play()
  }, [isPlaying, play])

  const seek = useCallback((time: number) => {
    const adapter = adapterRef.current
    if (!adapter) return

    adapter.seek(time)
    setCurrentTime(time)
  }, [])

  const setPlaybackRate = useCallback((rate: number) => {
    const adapter = adapterRef.current
    if (!adapter) return

    adapter.setPlaybackRate(rate)
    setPlaybackRateState(rate)
  }, [])

  return {
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    hasAudio: Boolean(audioUrl),
    togglePlayPause,
    play,
    seek,
    setPlaybackRate,
  }
}
