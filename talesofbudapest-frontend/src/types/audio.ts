export type AudioPlayerAdapter = {
  play(): Promise<void>
  pause(): void
  seek(time: number): void
  setPlaybackRate(rate: number): void
  getCurrentTime(): number
  getDuration(): number
  onTimeUpdate(callback: (time: number) => void): () => void
  onLoadedMetadata(callback: (duration: number) => void): () => void
  onEnded(callback: () => void): () => void
  destroy(): void
}

export type PlaybackTransportProps = {
  isPlaying: boolean
  currentTime: number
  duration: number
  playbackRate: number
  hasAudio: boolean
  isGenerating?: boolean
  canRequestAudio?: boolean
  generateError?: string | null
  historyDepth?: string | null
  onPlayPause: () => void
  onSeek: (time: number) => void
  onPlaybackRateChange?: () => void
  onSkipBack?: () => void
  onSkipForward?: () => void
  readyGlow?: boolean
}
