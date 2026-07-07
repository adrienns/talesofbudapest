'use client'

import { useEffect, useState } from 'react'
import { mockLandmarks } from '@/data/mockLandmarks'
import { getAllLandmarks } from '@/services/repositories/landmarksRepository'
import { isSupabaseConfigured } from '@/services/supabase'
import type { Landmark } from '@/types'

type UseLandmarksResult = {
  landmarks: Landmark[]
  isLoading: boolean
  error: string | null
}

export const useLandmarks = (): UseLandmarksResult => {
  const [landmarks, setLandmarks] = useState<Landmark[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadLandmarks = async () => {
      setIsLoading(true)
      setError(null)

      if (process.env.NEXT_PUBLIC_USE_MOCKS === 'true' || !isSupabaseConfigured()) {
        setLandmarks(mockLandmarks)
        setIsLoading(false)
        return
      }

      try {
        const data = await getAllLandmarks()
        setLandmarks(data)
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load landmarks')
      } finally {
        setIsLoading(false)
      }
    }

    loadLandmarks()
  }, [])

  return { landmarks, isLoading, error }
}
