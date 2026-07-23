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
  const onEndedRef = useRef(onEnded)
  const initialTimeRef = useRef(initialTime)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playbackRate, setPlaybackRateState] = useState(1)

  onEndedRef.current = onEnded
  initialTimeRef.current = initialTime

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

      const safeInitialTime = Math.min(Math.max(initialTimeRef.current, 0), nextDuration)
      if (safeInitialTime > 0 && safeInitialTime < nextDuration) {
        adapter.seek(safeInitialTime)
        setCurrentTime(safeInitialTime)
      }
    })
    const unsubscribeEnded = adapter.onEnded(() => {
      setIsPlaying(false)
      onEndedRef.current?.()
    })

    return () => {
      unsubscribeTime()
      unsubscribeMeta()
      unsubscribeEnded()
      adapter.destroy()
      adapterRef.current = null
    }
  }, [audioUrl])

  const play = useCallback(async () => {
    const adapter = adapterRef.current
    if (!adapter) return

    try {
      await adapter.play()
    } catch (error) {
      // Replacing the source (for example after a locale switch) destroys the
      // previous audio element. Browsers reject that element's pending play()
      // promise even though the replacement is expected.
      if (adapterRef.current !== adapter) return
      throw error
    }

    if (adapterRef.current === adapter) {
      setIsPlaying(true)
    }
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
