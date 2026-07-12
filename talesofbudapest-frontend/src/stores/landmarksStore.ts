import { create } from 'zustand'
import { getAllMapPins } from '@/services/repositories/landmarksRepository'
import type { MapPin } from '@/types/landmark'

type LandmarksState = {
  landmarks: MapPin[]
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

    try {
      const data = await getAllMapPins()
      set({ landmarks: data, isLoading: false })
    } catch (loadError) {
      set({
        error: loadError instanceof Error ? loadError.message : 'Failed to load landmarks',
        isLoading: false,
      })
    }
  },
}))
