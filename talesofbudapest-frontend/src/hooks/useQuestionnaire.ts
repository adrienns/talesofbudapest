'use client'

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import {
  DEFAULT_TOUR_MINUTES,
  MAX_TOPICS,
  TOUR_STYLES,
  type CuratedStarter,
  type TourStyle,
} from '@/constants/questionnaire'
import type { QuestionnaireExtras } from '@/types/narrative'

export type QuestionnaireStep = 'setup' | 'interests'
export type QuestionnaireLocationStatus = 'idle' | 'requesting' | 'ready' | 'denied' | 'unavailable'

type QuestionnaireState = {
  step: QuestionnaireStep
  styleId: string | null
  minutes: number
  nearMe: boolean
  topicIds: string[]
  intent: string
  selectedCuratedTour: CuratedStarter | null
}

type Action =
  | { type: 'reset' }
  | { type: 'set-step'; step: QuestionnaireStep }
  | { type: 'set-style'; styleId: string }
  | { type: 'set-minutes'; minutes: number }
  | { type: 'set-near-me'; nearMe: boolean }
  | { type: 'toggle-topic'; topicId: string }
  | { type: 'set-intent'; intent: string }
  | { type: 'set-curated-tour'; tour: CuratedStarter | null }

const initialState = (): QuestionnaireState => ({
  step: 'setup',
  styleId: null,
  minutes: DEFAULT_TOUR_MINUTES,
  nearMe: false,
  topicIds: [],
  intent: '',
  selectedCuratedTour: null,
})

const reducer = (state: QuestionnaireState, action: Action): QuestionnaireState => {
  switch (action.type) {
    case 'reset':
      return initialState()
    case 'set-step':
      return { ...state, step: action.step }
    case 'set-style':
      return { ...state, styleId: action.styleId }
    case 'set-minutes':
      return { ...state, minutes: action.minutes }
    case 'set-near-me':
      return { ...state, nearMe: action.nearMe }
    case 'toggle-topic': {
      if (state.topicIds.includes(action.topicId)) {
        return { ...state, topicIds: state.topicIds.filter((topicId) => topicId !== action.topicId) }
      }

      const topicIds = state.topicIds.length >= MAX_TOPICS
        ? [...state.topicIds.slice(1), action.topicId]
        : [...state.topicIds, action.topicId]
      return { ...state, topicIds }
    }
    case 'set-intent':
      return { ...state, intent: action.intent }
    case 'set-curated-tour':
      return { ...state, selectedCuratedTour: action.tour }
  }
}

type UseQuestionnaireArgs = {
  isOpen: boolean
  locationStatus: QuestionnaireLocationStatus
  onRequestLocation: () => Promise<boolean>
}

export const useQuestionnaire = ({
  isOpen,
  locationStatus,
  onRequestLocation,
}: UseQuestionnaireArgs) => {
  const [state, dispatch] = useReducer(reducer, undefined, initialState)
  const locationRequestVersion = useRef(0)

  useEffect(() => {
    if (!isOpen) {
      locationRequestVersion.current += 1
      dispatch({ type: 'reset' })
    }
  }, [isOpen])

  useEffect(() => {
    if (locationStatus !== 'ready') {
      locationRequestVersion.current += 1
      dispatch({ type: 'set-near-me', nearMe: false })
    }
  }, [locationStatus])

  const selectedStyle = useMemo<TourStyle | null>(
    () => TOUR_STYLES.find((style) => style.id === state.styleId) ?? null,
    [state.styleId],
  )
  const canContinue = Boolean(selectedStyle)
  const canStart = Boolean(selectedStyle && (state.topicIds.length > 0 || state.intent.trim()))

  const toggleNearMe = useCallback(async () => {
    if (state.nearMe) {
      locationRequestVersion.current += 1
      dispatch({ type: 'set-near-me', nearMe: false })
      return
    }

    const requestVersion = ++locationRequestVersion.current
    const granted = await onRequestLocation()
    if (requestVersion === locationRequestVersion.current) {
      dispatch({ type: 'set-near-me', nearMe: granted })
    }
  }, [onRequestLocation, state.nearMe])

  const getSubmission = useCallback((): QuestionnaireExtras | null => {
    if (!selectedStyle || (!state.topicIds.length && !state.intent.trim())) {
      return null
    }

    return {
      timeBudgetMinutes: state.minutes,
      styleId: selectedStyle.id,
      topicIds: state.topicIds,
      nearMe: state.nearMe,
      intent: state.intent.trim() || undefined,
    }
  }, [selectedStyle, state.intent, state.minutes, state.nearMe, state.topicIds])

  const nextStep = useCallback(() => {
    if (selectedStyle) {
      dispatch({ type: 'set-step', step: 'interests' })
    }
  }, [selectedStyle])

  return {
    ...state,
    canContinue,
    canStart,
    selectedStyle,
    selectStyle: (styleId: string) => dispatch({ type: 'set-style', styleId }),
    setMinutes: (minutes: number) => dispatch({ type: 'set-minutes', minutes }),
    toggleNearMe,
    toggleTopic: (topicId: string) => dispatch({ type: 'toggle-topic', topicId }),
    setIntent: (intent: string) => dispatch({ type: 'set-intent', intent }),
    nextStep,
    previousStep: () => dispatch({ type: 'set-step', step: 'setup' }),
    selectCuratedTour: (tour: CuratedStarter | null) => dispatch({ type: 'set-curated-tour', tour }),
    getSubmission,
  }
}
