'use client'

import { useCallback, useState } from 'react'
import type { DraftChapter, DraftNarrative } from '@/types/narrative'

/** Swaps one stop in a draft for an alternative, without touching the rest of the tour. */
export const useReplaceStop = () => {
  const [replacingIndex, setReplacingIndex] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const replaceStop = useCallback(
    async (draft: DraftNarrative, replaceIndex: number): Promise<DraftChapter> => {
      setReplacingIndex(replaceIndex)
      setError(null)

      try {
        const response = await fetch('/api/narratives/plan/replace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ draftId: draft.id, replaceIndex }),
        })

        const payload = await response.json()

        if (!response.ok) {
          throw new Error(payload.error ?? 'Failed to swap this stop')
        }

        return payload.chapter as DraftChapter
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to swap this stop'
        setError(message)
        throw err
      } finally {
        setReplacingIndex(null)
      }
    },
    [],
  )

  return { replaceStop, replacingIndex, error, clearError: () => setError(null) }
}
