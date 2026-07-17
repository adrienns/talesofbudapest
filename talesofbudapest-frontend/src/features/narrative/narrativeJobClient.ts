import type { NarrativeRoute } from '@/types/narrative'

const ACTIVE_JOB_KEY = 'tales:active-generation-job'

export type GenerationProgress = {
  stage: string
  current: number
  total: number
}

const sleep = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds))

export const waitForNarrativeJob = async (
  jobId: string,
  onProgress: (progress: GenerationProgress) => void,
): Promise<NarrativeRoute> => {
  localStorage.setItem(ACTIVE_JOB_KEY, jobId)
  const deadline = Date.now() + 20 * 60 * 1000

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`/api/narratives/generate/${jobId}`, { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Failed to check tour generation')

      onProgress({
        stage: payload.stage ?? payload.status,
        current: payload.progressCurrent ?? 0,
        total: payload.progressTotal ?? 0,
      })

      if (payload.status === 'completed' && payload.narrative) {
        localStorage.removeItem(ACTIVE_JOB_KEY)
        return payload.narrative as NarrativeRoute
      }
      if (payload.status === 'failed') {
        localStorage.removeItem(ACTIVE_JOB_KEY)
        throw new Error(payload.error ?? 'Tour generation failed')
      }
    } catch (error) {
      if (navigator.onLine && error instanceof Error && error.message === 'Tour generation failed') throw error
    }

    await sleep(document.visibilityState === 'visible' ? 2_000 : 10_000)
  }

  throw new Error('Tour generation is taking longer than expected. You can return to it later.')
}

export const submitNarrativeJob = async (
  body: Record<string, unknown>,
  onProgress: (progress: GenerationProgress) => void,
): Promise<NarrativeRoute> => {
  const response = await fetch('/api/narratives/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error ?? 'Failed to start tour generation')
  if (response.status === 200 && payload?.chapters) return payload as NarrativeRoute
  if (!payload.jobId) throw new Error('Tour generation did not return a job ID')
  return waitForNarrativeJob(payload.jobId, onProgress)
}

export const getPendingNarrativeJobId = () => localStorage.getItem(ACTIVE_JOB_KEY)
