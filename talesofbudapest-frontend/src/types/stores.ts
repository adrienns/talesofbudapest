import type { Landmark } from './landmark'

export type LandmarksState = {
  landmarks: Landmark[]
  isLoading: boolean
  error: string | null
  fetchLandmarks: () => Promise<void>
}

export type LandmarkSelectionState = {
  selectedLandmark: Landmark | null
  selectLandmark: (landmark: Landmark) => void
  clearSelection: () => void
}

export type AudioPlayerState = {
  isPlaying: boolean
  currentTime: number
  duration: number
  hasAudio: boolean
  bindToUrl: (audioUrl: string | null) => void
  togglePlayPause: () => Promise<void>
  seek: (time: number) => void
  reset: () => void
}
