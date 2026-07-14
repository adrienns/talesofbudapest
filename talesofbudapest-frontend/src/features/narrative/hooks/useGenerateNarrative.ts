'use client'

import { useCallback } from 'react'
import { LAST_NARRATIVE_STORAGE_KEY } from '@/constants/narrative'
import { useNarrativeStore } from '@/stores/narrativeStore'
import type { NarrativeContext, NarrativeRoute } from '@/types/narrative'

export const useGenerateNarrative = () => {
  const { setFlowState, setActiveRoute, setError } = useNarrativeStore()

  const generateNarrative = useCallback(
    async (userPrompt: string, context: NarrativeContext) => {
      setFlowState('generating')
      setError(null)

      try {
        const response = await fetch('/api/narratives/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userPrompt, context }),
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

  const loadCuratedTour = useCallback(
    async (slug: string, locale: 'en' | 'hu') => {
      setFlowState('generating')
      setError(null)
      try {
        const response = await fetch(`/api/curated-tours/${encodeURIComponent(slug)}?locale=${locale}`)
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error ?? 'Failed to load curated tour')
        const route = payload as NarrativeRoute
        setActiveRoute(route)
        setFlowState('ready')
        localStorage.setItem(LAST_NARRATIVE_STORAGE_KEY, route.id)
        return route
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load curated tour'
        setError(message)
        setFlowState('error')
        throw error
      }
    },
    [setActiveRoute, setError, setFlowState],
  )

  return { generateNarrative, loadCuratedTour }
}
