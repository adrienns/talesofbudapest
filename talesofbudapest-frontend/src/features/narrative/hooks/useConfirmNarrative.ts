'use client'

import { useCallback } from 'react'
import { LAST_NARRATIVE_STORAGE_KEY } from '@/constants/narrative'
import { useNarrativeStore } from '@/stores/narrativeStore'
import type { DraftNarrative, NarrativeRoute } from '@/types/narrative'

/** Synthesizes audio for a previewed (and possibly edited) draft and persists it. */
export const useConfirmNarrative = () => {
  const { setFlowState, setActiveRoute, setError } = useNarrativeStore()

  const confirmNarrative = useCallback(
    async (draft: DraftNarrative) => {
      setFlowState('generating')
      setError(null)

      try {
        const response = await fetch('/api/narratives/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ draft }),
        })

        const payload = await response.json()

        if (!response.ok) {
          throw new Error(payload.error ?? 'Failed to generate narrative')
        }

        const route = payload as NarrativeRoute
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
    [setActiveRoute, setError, setFlowState],
  )

  return { confirmNarrative }
}
