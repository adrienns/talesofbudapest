export const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'

  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)

  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export const formatRemainingTime = (currentTime: number, duration: number): string => {
  if (!Number.isFinite(duration) || duration <= 0) return '--:--'

  const remaining = Math.max(0, duration - currentTime)
  return `-${formatTime(remaining)}`
}
