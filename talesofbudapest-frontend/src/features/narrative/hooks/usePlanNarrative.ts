'use client'

import { useCallback } from 'react'
import { useNarrativeStore } from '@/stores/narrativeStore'
import type { DraftNarrative, NarrativeContext, NarrativeRequest } from '@/types/narrative'

/** Plans a route (fast, no audio synthesis yet) and hands it to the preview screen. */
export const usePlanNarrative = () => {
  const { setFlowState, setDraftRoute, setError } = useNarrativeStore()

  const planNarrative = useCallback(
    async (request: NarrativeRequest, context: NarrativeContext) => {
      setFlowState('planning')
      setError(null)

      try {
        const response = await fetch('/api/narratives/plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ request, context }),
        })

        const payload = await response.json()

        if (!response.ok) {
          throw new Error(payload.error ?? 'Failed to plan narrative')
        }

        const draft = payload as DraftNarrative
        setDraftRoute(draft)
        setFlowState('previewing')

        return draft
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to plan narrative'
        setError(message)
        setFlowState('error')
        throw error
      }
    },
    [setDraftRoute, setError, setFlowState],
  )

  return { planNarrative }
}
