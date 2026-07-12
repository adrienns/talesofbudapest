'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  DEFAULT_TOUR_STYLE_ID,
  isTourStyleId,
  type TourStyleId,
} from '@/constants/tourStyles'

type TourPreferencesState = {
  styleId: TourStyleId
  topicIds: string[]
  setFromQuestionnaire: (extras: { styleId: string; topicIds: string[] }) => void
  setStyleId: (styleId: TourStyleId) => void
  setTopicIds: (topicIds: string[]) => void
}

export const useTourPreferencesStore = create<TourPreferencesState>()(
  persist(
    (set) => ({
      styleId: DEFAULT_TOUR_STYLE_ID,
      topicIds: [],
      setFromQuestionnaire: ({ styleId, topicIds }) =>
        set({
          styleId: isTourStyleId(styleId) ? styleId : DEFAULT_TOUR_STYLE_ID,
          topicIds,
        }),
      setStyleId: (styleId) => set({ styleId }),
      setTopicIds: (topicIds) => set({ topicIds }),
    }),
    {
      name: 'tob-tour-preferences',
      partialize: (state) => ({
        styleId: state.styleId,
        topicIds: state.topicIds,
      }),
    },
  ),
)
