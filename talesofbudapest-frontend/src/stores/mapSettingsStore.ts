'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type MapSettingsState = {
  showAllBuildings: boolean
  setShowAllBuildings: (value: boolean) => void
  hintDismissed: boolean
  dismissHint: () => void
}

export const useMapSettingsStore = create<MapSettingsState>()(
  persist(
    (set) => ({
      showAllBuildings: false,
      setShowAllBuildings: (value) => set({ showAllBuildings: value }),
      hintDismissed: false,
      dismissHint: () => set({ hintDismissed: true }),
    }),
    {
      name: 'talesofbudapest-map-settings',
      partialize: (state) => ({
        showAllBuildings: state.showAllBuildings,
        hintDismissed: state.hintDismissed,
      }),
    },
  ),
)
