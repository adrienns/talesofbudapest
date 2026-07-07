'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createWebAudioPlayer } from '@/adapters/audio/webAudioPlayer'
import type { AudioPlayerAdapter } from '@/types/audio'

type UseAudioPlayerResult = {
  isPlaying: boolean
  currentTime: number
  duration: number
  hasAudio: boolean
  togglePlayPause: () => void
  seek: (time: number) => void
}

export const useAudioPlayer = (audioUrl: string | null): UseAudioPlayerResult => {
  const adapterRef = useRef<AudioPlayerAdapter | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)

    adapterRef.current?.destroy()
    adapterRef.current = null

    if (!audioUrl) {
      return
    }

    const adapter = createWebAudioPlayer(audioUrl)
    adapterRef.current = adapter

    const unsubscribeTime = adapter.onTimeUpdate(setCurrentTime)
    const unsubscribeMeta = adapter.onLoadedMetadata(setDuration)
    const unsubscribeEnded = adapter.onEnded(() => setIsPlaying(false))

    return () => {
      unsubscribeTime()
      unsubscribeMeta()
      unsubscribeEnded()
      adapter.destroy()
      adapterRef.current = null
    }
  }, [audioUrl])

  const togglePlayPause = useCallback(async () => {
    const adapter = adapterRef.current
    if (!adapter) return

    if (isPlaying) {
      adapter.pause()
      setIsPlaying(false)
      return
    }

    await adapter.play()
    setIsPlaying(true)
  }, [isPlaying])

  const seek = useCallback((time: number) => {
    const adapter = adapterRef.current
    if (!adapter) return

    adapter.seek(time)
    setCurrentTime(time)
  }, [])

  return {
    isPlaying,
    currentTime,
    duration,
    hasAudio: Boolean(audioUrl),
    togglePlayPause,
    seek,
  }
}
