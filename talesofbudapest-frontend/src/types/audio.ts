export type AudioPlayerAdapter = {
  play(): Promise<void>
  pause(): void
  seek(time: number): void
  getCurrentTime(): number
  getDuration(): number
  onTimeUpdate(callback: (time: number) => void): () => void
  onLoadedMetadata(callback: (duration: number) => void): () => void
  onEnded(callback: () => void): () => void
  destroy(): void
}

export type PlayerControlsProps = {
  isPlaying: boolean
  currentTime: number
  duration: number
  hasAudio: boolean
  onPlayPause: () => void
  onSeek: (time: number) => void
}

export type MiniPlayerControlsProps = {
  title: string
  subtitle?: string
  chapterLabel?: string
  imageUrl?: string | null
  imageAlt?: string
  isPlaying: boolean
  currentTime: number
  duration: number
  hasAudio: boolean
  onPlayPause: () => void
  onSeek: (time: number) => void
  onSkipBack?: () => void
  onSkipForward?: () => void
  readyGlow?: boolean
}
