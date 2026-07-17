'use client'

import { useCallback } from 'react'
import { LAST_NARRATIVE_STORAGE_KEY } from '@/constants/narrative'
import { useNarrativeStore } from '@/stores/narrativeStore'
import type { DraftNarrative, NarrativeRoute } from '@/types/narrative'
import { submitNarrativeJob } from '@/features/narrative/narrativeJobClient'

/** Synthesizes audio for a previewed (and possibly edited) draft and persists it. */
export const useConfirmNarrative = () => {
  const { setFlowState, setActiveRoute, setError, setGenerationProgress } = useNarrativeStore()

  const confirmNarrative = useCallback(
    async (draft: DraftNarrative) => {
      setFlowState('generating')
      setError(null)

      try {
        const route = await submitNarrativeJob({
          draftId: draft.id,
          chapterOrder: draft.chapters.map((chapter) => chapter.draftChapterIndex),
          walkingRoute: draft.walkingRoute ?? null,
        }, ({ stage, current, total }) =>
          setGenerationProgress(stage, current, total),
        ) as NarrativeRoute
        setActiveRoute(route)
        setFlowState('ready')
        localStorage.setItem(LAST_NARRATIVE_STORAGE_KEY, route.id)

        return route
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to generate narrative'
        setError(message)
        setFlowState('error')
        throw error
      }
    },
    [setActiveRoute, setError, setFlowState, setGenerationProgress],
  )

  return { confirmNarrative }
}
