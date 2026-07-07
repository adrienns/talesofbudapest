import { create } from 'zustand'
import { mockLandmarks } from '@/data/mockLandmarks'
import { getAllLandmarks } from '@/services/repositories/landmarksRepository'
import { isSupabaseConfigured } from '@/services/supabase'
import type { Landmark } from '@/types'

type LandmarksState = {
  landmarks: Landmark[]
  isLoading: boolean
  error: string | null
  fetchLandmarks: () => Promise<void>
}

export const useLandmarksStore = create<LandmarksState>((set) => ({
  landmarks: [],
  isLoading: true,
  error: null,

  fetchLandmarks: async () => {
    set({ isLoading: true, error: null })

    if (process.env.NEXT_PUBLIC_USE_MOCKS === 'true' || !isSupabaseConfigured()) {
      set({ landmarks: mockLandmarks, isLoading: false })
      return
    }

    try {
      const data = await getAllLandmarks()
      set({ landmarks: data, isLoading: false })
    } catch (loadError) {
      set({
        error: loadError instanceof Error ? loadError.message : 'Failed to load landmarks',
        isLoading: false,
      })
    }
  },
}))
