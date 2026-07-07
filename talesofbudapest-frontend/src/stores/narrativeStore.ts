import { create } from 'zustand'
import type { NarrativeFlowState, NarrativeRoute } from '@/types/narrative'

type NarrativeStore = {
  flowState: NarrativeFlowState
  activeRoute: NarrativeRoute | null
  activeChapterIndex: number
  error: string | null
  setFlowState: (state: NarrativeFlowState) => void
  setActiveRoute: (route: NarrativeRoute | null) => void
  setActiveChapterIndex: (index: number) => void
  setError: (error: string | null) => void
  reset: () => void
}

export const useNarrativeStore = create<NarrativeStore>((set) => ({
  flowState: 'idle',
  activeRoute: null,
  activeChapterIndex: 0,
  error: null,

  setFlowState: (flowState) => set({ flowState }),
  setActiveRoute: (activeRoute) => set({ activeRoute, activeChapterIndex: 0 }),
  setActiveChapterIndex: (activeChapterIndex) => set({ activeChapterIndex }),
  setError: (error) => set({ error }),
  reset: () =>
    set({
      flowState: 'idle',
      activeRoute: null,
      activeChapterIndex: 0,
      error: null,
    }),
}))
