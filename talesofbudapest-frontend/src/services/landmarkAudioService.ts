import type { TourStyleId } from '@/constants/tourStyles'
import type { AppLocale } from '@/types/locale'

type RequestLandmarkAudioOptions = {
  styleId?: TourStyleId
  topicIds?: string[]
  force?: boolean
}

type GenerateLandmarkAudioResponse = {
  audioUrl: string
  cached?: boolean
  script?: string
  historyDepth?: string
}

export type LandmarkAudioResult = {
  audioUrl: string
  script: string | null
  historyDepth?: string
}

export const requestLandmarkAudio = async (
  landmarkId: string,
  locale: AppLocale,
  options: RequestLandmarkAudioOptions = {},
): Promise<LandmarkAudioResult> => {
  const { styleId, topicIds, force } = options

  const response = await fetch(`/api/landmarks/${landmarkId}/audio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      locale,
      ...(styleId ? { styleId } : {}),
      ...(topicIds?.length ? { topicIds } : {}),
      ...(force ? { force: true } : {}),
    }),
  })

  const payload = (await response.json()) as GenerateLandmarkAudioResponse & { error?: string }

  if (!response.ok) {
    throw new Error(payload.error ?? 'Failed to generate audio tour')
  }

  if (!payload.audioUrl) {
    throw new Error('Audio generation returned an empty URL')
  }

  return {
    audioUrl: payload.audioUrl,
    script: payload.script ?? null,
    historyDepth: payload.historyDepth,
  }
}
