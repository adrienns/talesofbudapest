'use client'

import { useCallback, useEffect } from 'react'
import { LAST_NARRATIVE_STORAGE_KEY, lastNarrativeChapterKey } from '@/constants/narrative'
import { prepareCuratedRoute } from '@/lib/narrative/curatedRoute'
import { useNarrativeStore } from '@/stores/narrativeStore'
import type { NarrativeContext, NarrativeRequest, NarrativeRoute } from '@/types/narrative'
import { getPendingNarrativeJobId, submitNarrativeJob, waitForNarrativeJob } from '@/features/narrative/narrativeJobClient'

export const useGenerateNarrative = () => {
  const { setFlowState, setActiveRoute, setError, setGenerationProgress } = useNarrativeStore()

  const acceptRoute = useCallback((route: NarrativeRoute, initialChapterIndex = 0) => {
    const safeChapterIndex = Math.min(
      Math.max(initialChapterIndex, 0),
      Math.max(route.chapters.length - 1, 0),
    )
    setActiveRoute(route, safeChapterIndex)
    setFlowState('ready')
    try {
      localStorage.setItem(LAST_NARRATIVE_STORAGE_KEY, route.id)
      localStorage.setItem(lastNarrativeChapterKey(route.id), String(safeChapterIndex))
    } catch {
      // Persistence is best-effort; the loaded tour remains usable in memory.
    }
    return route
  }, [setActiveRoute, setFlowState])

  useEffect(() => {
    const jobId = getPendingNarrativeJobId()
    if (!jobId) return
    setFlowState('generating')
    waitForNarrativeJob(jobId, ({ stage, current, total }) =>
      setGenerationProgress(stage, current, total),
    ).then(acceptRoute).catch((error) => {
      setError(error instanceof Error ? error.message : 'Failed to resume tour generation')
      setFlowState('error')
    })
  }, [acceptRoute, setError, setFlowState, setGenerationProgress])

  const generateNarrative = useCallback(
    async (request: NarrativeRequest, context: NarrativeContext, curatedSlug?: string) => {
      setFlowState('generating')
      setError(null)

      try {
        const route = await submitNarrativeJob({ request, context, ...(curatedSlug ? { curatedSlug } : {}) }, ({ stage, current, total }) =>
          setGenerationProgress(stage, current, total),
        )
        return acceptRoute(route)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to generate narrative'
        setError(message)
        setFlowState('error')
        throw error
      }
    },
    [acceptRoute, setError, setFlowState, setGenerationProgress],
  )

  const loadCuratedTour = useCallback(
    async (slug: string, locale: 'en' | 'hu', initialChapterIndex = 0) => {
      setFlowState('generating')
      setError(null)
      try {
        const response = await fetch(`/api/curated-tours/${encodeURIComponent(slug)}?locale=${locale}`)
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error ?? 'Failed to load curated tour')
        const route = prepareCuratedRoute(payload as NarrativeRoute & { curatedSlug?: string | null })
        return acceptRoute(route, initialChapterIndex)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load curated tour'
        setError(message)
        setFlowState('error')
        throw error
      }
    },
    [acceptRoute, setError, setFlowState],
  )

  return { generateNarrative, loadCuratedTour }
}
