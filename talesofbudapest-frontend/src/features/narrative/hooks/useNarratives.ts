'use client'

import { useCallback, useEffect, useState } from 'react'
import { LAST_NARRATIVE_STORAGE_KEY } from '@/constants/narrative'
import { useNarrativeStore } from '@/stores/narrativeStore'
import type { NarrativeRoute, NarrativeSummary } from '@/types/narrative'

export const useNarratives = () => {
  const [narratives, setNarratives] = useState<NarrativeSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { setActiveRoute, setFlowState } = useNarrativeStore()

  const fetchNarratives = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/narratives')
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to load narratives')
      }

      setNarratives(payload.narratives ?? [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load narratives')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const loadNarrativeById = useCallback(
    async (id: string) => {
      const response = await fetch(`/api/narratives/${id}`)
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to load narrative')
      }

      const route: NarrativeRoute = {
        id: payload.id,
        title: payload.title,
        chapters: payload.chapters,
      }

      setActiveRoute(route)
      setFlowState('ready')
      localStorage.setItem(LAST_NARRATIVE_STORAGE_KEY, route.id)

      return route
    },
    [setActiveRoute, setFlowState],
  )

  const restoreLastNarrative = useCallback(async () => {
    const lastId = localStorage.getItem(LAST_NARRATIVE_STORAGE_KEY)
    if (!lastId) {
      return null
    }

    try {
      return await loadNarrativeById(lastId)
    } catch {
      localStorage.removeItem(LAST_NARRATIVE_STORAGE_KEY)
      return null
    }
  }, [loadNarrativeById])

  useEffect(() => {
    fetchNarratives()
  }, [fetchNarratives])

  return {
    narratives,
    isLoading,
    error,
    fetchNarratives,
    loadNarrativeById,
    restoreLastNarrative,
  }
}
