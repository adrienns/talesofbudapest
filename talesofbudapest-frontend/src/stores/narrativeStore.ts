import { create } from 'zustand'
import { lastNarrativeChapterKey } from '@/constants/narrative'
import type { DraftNarrative, NarrativeFlowState, NarrativeRoute } from '@/types/narrative'

type NarrativeStore = {
  flowState: NarrativeFlowState
  draftRoute: DraftNarrative | null
  activeRoute: NarrativeRoute | null
  activeChapterIndex: number
  error: string | null
  setFlowState: (state: NarrativeFlowState) => void
  setDraftRoute: (draft: DraftNarrative | null) => void
  setActiveRoute: (route: NarrativeRoute | null, initialChapterIndex?: number) => void
  setActiveChapterIndex: (index: number) => void
  setError: (error: string | null) => void
  reset: () => void
}

export const useNarrativeStore = create<NarrativeStore>((set, get) => ({
  flowState: 'idle',
  draftRoute: null,
  activeRoute: null,
  activeChapterIndex: 0,
  error: null,

  setFlowState: (flowState) => set({ flowState }),
  setDraftRoute: (draftRoute) => set({ draftRoute }),
  setActiveRoute: (activeRoute, initialChapterIndex = 0) =>
    set({ activeRoute, activeChapterIndex: initialChapterIndex, draftRoute: null }),
  setActiveChapterIndex: (activeChapterIndex) => {
    set({ activeChapterIndex })

    const { activeRoute } = get()
    if (activeRoute) {
      try {
        localStorage.setItem(lastNarrativeChapterKey(activeRoute.id), String(activeChapterIndex))
      } catch {
        // best-effort — resuming just falls back to chapter 0
      }
    }
  },
  setError: (error) => set({ error }),
  reset: () =>
    set({
      flowState: 'idle',
      draftRoute: null,
      activeRoute: null,
      activeChapterIndex: 0,
      error: null,
    }),
}))
