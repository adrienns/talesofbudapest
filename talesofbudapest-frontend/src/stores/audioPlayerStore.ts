import { create } from 'zustand'
import { createWebAudioPlayer } from '@/adapters/audio/webAudioPlayer'
import type { AudioPlayerAdapter } from '@/types/audio'

type AudioPlayerState = {
  isPlaying: boolean
  currentTime: number
  duration: number
  hasAudio: boolean
  bindToUrl: (audioUrl: string | null) => void
  togglePlayPause: () => Promise<void>
  seek: (time: number) => void
  reset: () => void
}

let adapter: AudioPlayerAdapter | null = null
let unsubscribers: Array<() => void> = []

const teardownAdapter = () => {
  unsubscribers.forEach((unsubscribe) => unsubscribe())
  unsubscribers = []
  adapter?.destroy()
  adapter = null
}

export const useAudioPlayerStore = create<AudioPlayerState>((set, get) => ({
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  hasAudio: false,

  bindToUrl: (audioUrl) => {
    teardownAdapter()
    set({ isPlaying: false, currentTime: 0, duration: 0, hasAudio: Boolean(audioUrl) })

    if (!audioUrl) return

    adapter = createWebAudioPlayer(audioUrl)

    unsubscribers = [
      adapter.onTimeUpdate((time) => set({ currentTime: time })),
      adapter.onLoadedMetadata((duration) => set({ duration })),
      adapter.onEnded(() => set({ isPlaying: false })),
    ]
  },

  togglePlayPause: async () => {
    if (!adapter) return

    if (get().isPlaying) {
      adapter.pause()
      set({ isPlaying: false })
      return
    }

    await adapter.play()
    set({ isPlaying: true })
  },

  seek: (time) => {
    if (!adapter) return
    adapter.seek(time)
    set({ currentTime: time })
  },

  reset: () => {
    teardownAdapter()
    set({ isPlaying: false, currentTime: 0, duration: 0, hasAudio: false })
  },
}))
