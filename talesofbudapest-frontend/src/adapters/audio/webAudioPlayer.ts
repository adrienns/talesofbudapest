import type { AudioPlayerAdapter } from '@/types/audio'

export const createWebAudioPlayer = (audioUrl: string): AudioPlayerAdapter => {
  const audio = new Audio(audioUrl)

  return {
    play: async () => {
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
      return () => audio.removeEventListener('loadedmetadata', handler)
    },
    onEnded: (callback) => {
      audio.addEventListener('ended', callback)
      return () => audio.removeEventListener('ended', callback)
    },
    destroy: () => {
      audio.pause()
      audio.src = ''
    },
  }
}
