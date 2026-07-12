'use client'

import dynamic from 'next/dynamic'
import { useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { useLocale, useTranslations } from 'next-intl'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import type { CuratedStarter } from '@/constants/questionnaire'
import type { QuestionnaireExtras } from '@/components/narrative/NarrativeQuestionnaire'
import { NarrativeGeneratingOverlay } from '@/components/narrative/NarrativeGeneratingOverlay'
import { ResumeTourBanner } from '@/components/narrative/ResumeTourBanner'
import { BottomNav } from '@/components/ui/BottomNav'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { MapFloatingBackButton } from '@/components/ui/MapFloatingBackButton'
import { PromptBar } from '@/components/ui/PromptBar'
import { useConfirmNarrative } from '@/features/narrative/hooks/useConfirmNarrative'
import { useGenerateNarrative } from '@/features/narrative/hooks/useGenerateNarrative'
import { useNarrativeContext } from '@/features/narrative/hooks/useNarrativeContext'
import { useNarratives, type LastNarrativePeek } from '@/features/narrative/hooks/useNarratives'
import { usePlanNarrative } from '@/features/narrative/hooks/usePlanNarrative'
import { useResolveLandmark } from '@/features/landmarks/hooks/useResolveLandmark'
import { useRouter } from '@/i18n/navigation'
import { queryKeys } from '@/services/queryKeys'
import { useNarrativeStore } from '@/stores/narrativeStore'
import { useTourPreferencesStore } from '@/stores/tourPreferencesStore'
import { getLandmarkImageUrl } from '@/lib/landmarkImage'
import type { Landmark, MapPin } from '@/types/landmark'
import type { DraftNarrative, NarrativeChapter, PlaybackItem } from '@/types/narrative'
import type { SheetSnap } from '@/types/tourSheet'
import type { NavTabId } from '@/types/navigation'
import type { AppLocale } from '@/types/locale'

const MapView = dynamic(
  () => import('@/components/map/MapView').then((mod) => mod.MapView),
  {
    ssr: false,
    loading: () => <div className="absolute inset-0 bg-surface" aria-hidden="true" />,
  },
)

const NarrativeQuestionnaire = dynamic(
  () =>
    import('@/components/narrative/NarrativeQuestionnaire').then(
      (mod) => mod.NarrativeQuestionnaire,
    ),
  { ssr: false },
)

const NarrativeRoutePreview = dynamic(
  () =>
    import('@/components/narrative/NarrativeRoutePreview').then(
      (mod) => mod.NarrativeRoutePreview,
    ),
  { ssr: false },
)

const AudioDrawer = dynamic(
  () => import('@/components/ui/AudioDrawer').then((mod) => mod.AudioDrawer),
  { ssr: false },
)

const HomePageContent = () => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const locale = useLocale() as AppLocale
  const tPlayer = useTranslations('player')
  const { resolveLandmark } = useResolveLandmark()
  const queryClient = useQueryClient()
  const narrativeContext = useNarrativeContext()
  const { generateNarrative } = useGenerateNarrative()
  const { planNarrative } = usePlanNarrative()
  const { confirmNarrative } = useConfirmNarrative()
  const { loadNarrativeById, peekLastNarrative, resumeLastNarrative, dismissLastNarrative } =
    useNarratives()
  const {
    flowState,
    draftRoute,
    activeRoute,
    activeChapterIndex,
    error: narrativeError,
    setFlowState,
    setActiveChapterIndex,
    setError,
    reset,
  } = useNarrativeStore()
  const setFromQuestionnaire = useTourPreferencesStore((state) => state.setFromQuestionnaire)

  const [selectedLandmark, setSelectedLandmark] = useState<Landmark | null>(null)
  const [startDictation, setStartDictation] = useState(false)
  const [lastPrompt, setLastPrompt] = useState('')
  const [lastExtras, setLastExtras] = useState<QuestionnaireExtras | undefined>(undefined)
  const [activeTab, setActiveTab] = useState<NavTabId>('map')
  const [lastNarrativePeek, setLastNarrativePeek] = useState<LastNarrativePeek | null>(null)
  const [isExplorerOpen, setIsExplorerOpen] = useState(true)

  const [sheetSnap, setSheetSnap] = useState<SheetSnap>('collapsed')

  const isPlanning = flowState === 'planning'
  const isGenerating = flowState === 'generating'
  const isPreviewing = flowState === 'previewing' && Boolean(draftRoute)
  const isEliciting = flowState === 'eliciting'
  const hasActiveRoute = Boolean(activeRoute)

  useEffect(() => {
    if (flowState !== 'idle' || hasActiveRoute || selectedLandmark) {
      return
    }

    peekLastNarrative().then(setLastNarrativePeek)
  }, [flowState, hasActiveRoute, peekLastNarrative, selectedLandmark])

  useEffect(() => {
    const narrativeId = searchParams.get('narrativeId')
    if (!narrativeId) {
      return
    }

    loadNarrativeById(narrativeId).catch(() => {})
  }, [loadNarrativeById, searchParams])

  const activeChapter = activeRoute?.chapters[activeChapterIndex] ?? null

  const playbackItem = useMemo<PlaybackItem | null>(() => {
    if (activeChapter && activeRoute) {
      return {
        id: activeChapter.id,
        title: activeChapter.title,
        subtitle: tPlayer('customNarrative'),
        chapterLabel: `• ${tPlayer('chapter', { number: String(activeChapter.chapterIndex + 1).padStart(2, '0') })}`,
        audioUrl: activeChapter.audioUrl,
        imageUrl: activeChapter.imageUrl,
        imageAlt: activeChapter.title,
        lat: activeChapter.lat,
        lng: activeChapter.lng,
      }
    }

    if (selectedLandmark) {
      return {
        id: selectedLandmark.id,
        title: selectedLandmark.name,
        audioUrl: selectedLandmark.audio_url,
        imageUrl: getLandmarkImageUrl(selectedLandmark.image_url, selectedLandmark.images),
        imageAlt: selectedLandmark.images[0]?.alt ?? selectedLandmark.name,
        lat: selectedLandmark.lat,
        lng: selectedLandmark.lng,
      }
    }

    return null
  }, [activeChapter, activeRoute, selectedLandmark, tPlayer])

  useEffect(() => {
    setSheetSnap('collapsed')
  }, [playbackItem?.id])

  const handlePlaybackBack = useCallback(() => {
    if (sheetSnap === 'expanded') {
      setSheetSnap('collapsed')
      return
    }

    setSelectedLandmark(null)
    if (hasActiveRoute) {
      reset()
    }
    setActiveTab('map')
  }, [hasActiveRoute, reset, sheetSnap])

  const handleOpenElicitation = useCallback((withMic = false) => {
    setStartDictation(withMic)
    setFlowState('eliciting')
  }, [setFlowState])

  useEffect(() => {
    if (searchParams.get('ai') !== '1') {
      return
    }

    setStartDictation(false)
    setFlowState('eliciting')
    router.replace('/')
  }, [router, searchParams, setFlowState])

  /** Style→Topics→Recap flow, and the free-text intent bar — both go through the route preview. */
  const handlePlan = async (prompt: string, extras?: QuestionnaireExtras) => {
    setLastPrompt(prompt)
    setLastExtras(extras)
    setSelectedLandmark(null)
    setLastNarrativePeek(null)

    if (extras?.styleId) {
      setFromQuestionnaire({ styleId: extras.styleId, topicIds: extras.topicIds })
    }

    try {
      await planNarrative(prompt, { ...narrativeContext, locale, ...extras })
    } catch {
      // error handled in store
    }
  }

  /** One-tap curated starters skip the preview — the prompt is pre-vetted. */
  const handleStartCurated = async (starter: CuratedStarter) => {
    setLastPrompt(starter.prompt)
    setSelectedLandmark(null)
    setLastNarrativePeek(null)
    setFromQuestionnaire({ styleId: starter.styleId, topicIds: starter.topicIds })

    try {
      await generateNarrative(starter.prompt, {
        ...narrativeContext,
        locale,
        styleId: starter.styleId,
        topicIds: starter.topicIds,
      })
      setActiveTab('narrative')
    } catch {
      // error handled in store
    }
  }

  const handleConfirmDraft = async (draft: DraftNarrative) => {
    try {
      await confirmNarrative(draft)
      setActiveTab('narrative')
    } catch {
      // error handled in store
    }
  }

  const handleDiscardDraft = useCallback(() => {
    reset()
  }, [reset])

  const handleRetry = () => {
    if (lastPrompt) {
      handlePlan(lastPrompt, lastExtras)
    }
  }

  const handleResumeTour = useCallback(() => {
    if (!lastNarrativePeek) {
      return
    }

    resumeLastNarrative(lastNarrativePeek)
      .then(() => setActiveTab('narrative'))
      .catch(() => {})
    setLastNarrativePeek(null)
  }, [lastNarrativePeek, resumeLastNarrative])

  const handleDismissResume = useCallback(() => {
    dismissLastNarrative()
    setLastNarrativePeek(null)
  }, [dismissLastNarrative])

  const handleTabChange = useCallback((tab: NavTabId) => {
    setActiveTab(tab)

    if (tab === 'archives') {
      router.push('/archives')
      return
    }

    if (tab === 'settings') {
      router.push('/settings')
      return
    }

    if (tab === 'map') {
      setSelectedLandmark(null)
      if (hasActiveRoute) {
        reset()
      }
    }
  }, [hasActiveRoute, reset, router])

  const handleLandmarkAudioReady = useCallback(
    (audioUrl: string) => {
      if (!selectedLandmark) {
        return
      }

      const id = selectedLandmark.id
      queryClient.setQueryData(
        queryKeys.landmarkDetail(id, locale),
        (old: Landmark | undefined) => (old ? { ...old, audio_url: audioUrl } : old),
      )
      queryClient.setQueriesData(
        { queryKey: ['pins'] },
        (old: MapPin[] | undefined) =>
          Array.isArray(old)
            ? old.map((pin) => (pin.id === id ? { ...pin, audio_url: audioUrl } : pin))
            : old,
      )
      setSelectedLandmark((current) =>
        current ? { ...current, audio_url: audioUrl } : current,
      )
    },
    [locale, queryClient, selectedLandmark],
  )

  const handleLandmarkSelect = useCallback(
    async (pin: MapPin) => {
      reset()
      setLastNarrativePeek(null)
      const detail = await resolveLandmark(pin)
      setSelectedLandmark(detail)
      setActiveTab('narrative')
    },
    [reset, resolveLandmark],
  )

  const handleChapterSelect = useCallback((chapter: NarrativeChapter) => {
    if (!activeRoute) {
      return
    }

    const index = activeRoute.chapters.findIndex((item) => item.id === chapter.id)
    if (index >= 0) {
      setActiveChapterIndex(index)
      setActiveTab('narrative')
    }
  }, [activeRoute, setActiveChapterIndex])

  const selectAdjacentChapter = useCallback(
    (direction: -1 | 1) => {
      if (!activeRoute || activeRoute.chapters.length === 0) {
        return
      }

      const nextIndex =
        (activeChapterIndex + direction + activeRoute.chapters.length) %
        activeRoute.chapters.length
      setActiveChapterIndex(nextIndex)
    },
    [activeChapterIndex, activeRoute, setActiveChapterIndex],
  )

  const selectedLandmarkId = hasActiveRoute ? null : selectedLandmark?.id ?? null
  const showChrome = !isGenerating && !isPlanning && !isPreviewing

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background">
      <MapView
        selectedLandmarkId={selectedLandmarkId}
        onLandmarkSelect={handleLandmarkSelect}
        activeRoute={activeRoute}
        selectedChapterId={activeChapter?.id ?? null}
        onChapterSelect={handleChapterSelect}
        showLandmarks={!hasActiveRoute}
      />

      {isExplorerOpen && (
        <section
          className="absolute inset-0 z-40 bg-[#f9efd8]"
          aria-label="Meet your explorer guide"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative h-full w-full overflow-hidden">
            <button
              type="button"
              onClick={() => setIsExplorerOpen(false)}
              className="absolute right-5 top-[max(1.25rem,env(safe-area-inset-top))] z-10 grid h-11 w-11 place-items-center rounded-full bg-[#3c281a] text-xl text-white shadow-lg transition hover:scale-105"
              aria-label="Close explorer guide"
            >
              ×
            </button>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#3c281a]/80 to-transparent px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-20 text-center text-[#fff7e6]">
              <p className="font-serif text-2xl">Your Budapest explorer</p>
              <p className="mt-1 text-sm opacity-90">Drag to look around · Scroll or pinch to zoom</p>
            </div>
          </div>
        </section>
      )}

      {showChrome && !playbackItem && !isEliciting && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-2.5 pb-4 pt-[max(0.875rem,env(safe-area-inset-top))]">
          <div className="pointer-events-auto px-3 pt-3">
            <PromptBar
              onOpen={() => handleOpenElicitation(false)}
              onMicClick={() => handleOpenElicitation(true)}
            />
          </div>

          {lastNarrativePeek && (
            <div className="pointer-events-auto px-3">
              <ResumeTourBanner
                peek={lastNarrativePeek}
                onResume={handleResumeTour}
                onDismiss={handleDismissResume}
              />
            </div>
          )}
        </div>
      )}

      {isEliciting && (
        <NarrativeQuestionnaire
          isOpen={isEliciting}
          onClose={() => setFlowState('idle')}
          onPlan={handlePlan}
          onStartCurated={handleStartCurated}
          focusInput={startDictation}
        />
      )}

      {isPreviewing && draftRoute && (
        <NarrativeRoutePreview
          draft={draftRoute}
          onConfirm={handleConfirmDraft}
          onDiscard={handleDiscardDraft}
        />
      )}

      <NarrativeGeneratingOverlay
        isVisible={isPlanning || isGenerating || flowState === 'error'}
        mode={isPlanning ? 'planning' : 'generating'}
        error={flowState === 'error' ? narrativeError : null}
        onRetry={handleRetry}
        onDismiss={() => {
          setError(null)
          setFlowState('idle')
        }}
      />

      {showChrome && playbackItem && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[35] flex justify-start px-4 pt-[max(0.875rem,env(safe-area-inset-top))]">
          <MapFloatingBackButton
            className="pointer-events-auto"
            onClick={handlePlaybackBack}
          />
        </div>
      )}

      {showChrome && playbackItem && (
        <AudioDrawer
          playbackItem={playbackItem}
          routeTitle={hasActiveRoute ? activeRoute?.title : null}
          chapterIndex={activeChapterIndex}
          activeRoute={hasActiveRoute ? activeRoute : null}
          enableOnDemandAudio={!hasActiveRoute}
          onLandmarkAudioReady={handleLandmarkAudioReady}
          onSkipBack={hasActiveRoute ? () => selectAdjacentChapter(-1) : undefined}
          onSkipForward={hasActiveRoute ? () => selectAdjacentChapter(1) : undefined}
          readyGlow={hasActiveRoute && flowState === 'ready'}
          chronicleLocationId={
            hasActiveRoute
              ? activeChapter?.landmarkId ?? null
              : selectedLandmark?.id ?? null
          }
          snap={sheetSnap}
          onSnapChange={setSheetSnap}
        />
      )}

      {showChrome && !isEliciting && sheetSnap !== 'expanded' && (
        <BottomNav
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onAiGuideClick={() => handleOpenElicitation(false)}
        />
      )}
    </main>
  )
}

const HomePage = () => {
  const t = useTranslations('home')

  return (
    <Suspense fallback={<LoadingScreen message={t('loadingMap')} />}>
      <HomePageContent />
    </Suspense>
  )
}

export default HomePage
