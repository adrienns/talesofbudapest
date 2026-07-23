import type { AudioPlayerAdapter } from '@/types/audio'

const whenPlayable = (audio: HTMLAudioElement) => {
  if (audio.error) {
    return Promise.reject(audio.error)
  }

  if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
    return Promise.resolve()
  }

  return new Promise<void>((resolve, reject) => {
    const onReady = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(audio.error ?? new Error('Audio failed to load'))
    }
    const cleanup = () => {
      audio.removeEventListener('canplay', onReady)
      audio.removeEventListener('error', onError)
    }

    audio.addEventListener('canplay', onReady)
    audio.addEventListener('error', onError)
  })
}

export const createWebAudioPlayer = (audioUrl: string): AudioPlayerAdapter => {
  const audio = new Audio(audioUrl)
  audio.preload = 'auto'

  return {
    play: async () => {
      await whenPlayable(audio)
      await audio.play()
    },
    pause: () => {
      audio.pause()
    },
    seek: (time: number) => {
      audio.currentTime = time
    },
    setPlaybackRate: (rate: number) => {
      audio.playbackRate = rate
    },
    getCurrentTime: () => audio.currentTime,
    getDuration: () => audio.duration || 0,
    onTimeUpdate: (callback) => {
      const handler = () => callback(audio.currentTime)
      audio.addEventListener('timeupdate', handler)
      return () => audio.removeEventListener('timeupdate', handler)
    },
    onLoadedMetadata: (callback) => {
      const handler = () => callback(audio.duration || 0)
      audio.addEventListener('loadedmetadata', handler)
      if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
        handler()
      }
      return () => audio.removeEventListener('loadedmetadata', handler)
    },
    onEnded: (callback) => {
      audio.addEventListener('ended', callback)
      return () => audio.removeEventListener('ended', callback)
    },
    destroy: () => {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    },
  }
}
