import { create } from 'zustand'
import { useAudioPlayerStore } from '@/stores/audioPlayerStore'
import type { Landmark } from '@/types'

type LandmarkSelectionState = {
  selectedLandmark: Landmark | null
  selectLandmark: (landmark: Landmark) => void
  clearSelection: () => void
}

export const useLandmarkSelectionStore = create<LandmarkSelectionState>((set) => ({
  selectedLandmark: null,

  selectLandmark: (landmark) => {
    useAudioPlayerStore.getState().bindToUrl(landmark.audio_url)
    set({ selectedLandmark: landmark })
  },

  clearSelection: () => {
    useAudioPlayerStore.getState().reset()
    set({ selectedLandmark: null })
  },
}))
