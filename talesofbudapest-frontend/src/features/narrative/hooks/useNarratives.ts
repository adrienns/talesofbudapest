'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLocale } from 'next-intl'
import {
  LAST_NARRATIVE_STORAGE_KEY,
  lastNarrativeChapterKey,
  narrativePlaybackPositionKey,
} from '@/constants/narrative'
import { loadOfflineTour } from '@/lib/narrative/offlineTour'
import { prepareCuratedRoute } from '@/lib/narrative/curatedRoute'
import { useNarrativeStore } from '@/stores/narrativeStore'
import type { NarrativeRoute, NarrativeSummary } from '@/types/narrative'

export type LastNarrativePeek = {
  id: string
  title: string
  chapterIndex: number
  chapterCount: number
}

const readStoredChapterIndex = (narrativeId: string): number => {
  const raw = localStorage.getItem(lastNarrativeChapterKey(narrativeId))
  const parsed = raw ? Number(raw) : 0
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

export const readNarrativePlaybackPosition = (narrativeId: string, chapterId: string): number => {
  try {
    const raw = localStorage.getItem(narrativePlaybackPositionKey(narrativeId, chapterId))
    const value = raw ? Number(raw) : 0
    return Number.isFinite(value) && value > 0 ? value : 0
  } catch {
    return 0
  }
}

export const saveNarrativePlaybackPosition = (
  narrativeId: string,
  chapterId: string,
  seconds: number,
) => {
  try {
    const value = Number.isFinite(seconds) && seconds > 0 ? seconds : 0
    localStorage.setItem(narrativePlaybackPositionKey(narrativeId, chapterId), String(value))
  } catch {
    // Best-effort only: tour and chapter progress still work without storage.
  }
}

export const useNarratives = () => {
  const locale = useLocale()
  const [narratives, setNarratives] = useState<NarrativeSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { setActiveRoute, setFlowState } = useNarrativeStore()

  const fetchNarratives = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/narratives?locale=${locale}`)
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
  }, [locale])

  const loadNarrativeById = useCallback(
    async (id: string, initialChapterIndex = 0) => {
      let route: NarrativeRoute | null = null
      try {
        const response = await fetch(`/api/narratives/${id}?locale=${locale}`)
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error ?? 'Failed to load narrative')
        route = prepareCuratedRoute({
          id: payload.id,
          title: payload.title,
          chapters: payload.chapters,
          walkingRoute: payload.walkingRoute ?? null,
          curatedSlug: payload.curatedSlug,
        })
      } catch (error) {
        route = loadOfflineTour(id)
        if (!route) throw error
      }

      const safeIndex = Math.min(Math.max(initialChapterIndex, 0), route.chapters.length - 1)
      setActiveRoute(route, safeIndex)
      setFlowState('ready')
      localStorage.setItem(LAST_NARRATIVE_STORAGE_KEY, route.id)

      return route
    },
    [locale, setActiveRoute, setFlowState],
  )

  /** Checks for an abandoned tour without loading it — powers the resume banner. */
  const peekLastNarrative = useCallback(async (): Promise<LastNarrativePeek | null> => {
    const lastId = localStorage.getItem(LAST_NARRATIVE_STORAGE_KEY)
    if (!lastId) {
      return null
    }

    try {
      const response = await fetch(`/api/narratives/${lastId}?locale=${locale}`)
      const payload = await response.json()

      if (!response.ok || !payload?.chapters?.length) {
        throw new Error('Narrative unavailable')
      }

      const chapterCount = payload.chapters.length
      const chapterIndex = Math.min(readStoredChapterIndex(lastId), chapterCount - 1)

      return { id: lastId, title: payload.title, chapterIndex, chapterCount }
    } catch {
      const offlineRoute = loadOfflineTour(lastId)
      if (!offlineRoute?.chapters.length) {
        localStorage.removeItem(LAST_NARRATIVE_STORAGE_KEY)
        return null
      }

      const chapterIndex = Math.min(readStoredChapterIndex(lastId), offlineRoute.chapters.length - 1)
      return {
        id: offlineRoute.id,
        title: offlineRoute.title,
        chapterIndex,
        chapterCount: offlineRoute.chapters.length,
      }
    }
  }, [locale])

  const resumeLastNarrative = useCallback(
    (peek: LastNarrativePeek) => loadNarrativeById(peek.id, peek.chapterIndex),
    [loadNarrativeById],
  )

  const dismissLastNarrative = useCallback(() => {
    localStorage.removeItem(LAST_NARRATIVE_STORAGE_KEY)
  }, [])

  useEffect(() => {
    fetchNarratives()
  }, [fetchNarratives])

  return {
    narratives,
    isLoading,
    error,
    fetchNarratives,
    loadNarrativeById,
    peekLastNarrative,
    resumeLastNarrative,
    dismissLastNarrative,
  }
}
