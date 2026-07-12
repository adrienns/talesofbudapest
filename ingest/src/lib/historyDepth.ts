import type { HistoryDepth } from '../types/landmark.js'

export type { HistoryDepth }

export const computeHistoryDepth = (sourceMaterial: string): HistoryDepth => {
  const length = sourceMaterial.trim().length
  if (length < 400) {
    return 'thin'
  }
  if (length < 1500) {
    return 'standard'
  }
  return 'rich'
}
