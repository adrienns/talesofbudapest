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
import { AiGuideChat } from '@/components/guide/AiGuideChat'
import { PlaceSearch } from '@/components/map/PlaceSearch'
import { BottomNav } from '@/components/ui/BottomNav'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { SlideToStart } from '@/components/ui/SlideToStart'
import { ChevronLeft } from 'lucide-react'
import { IconButton } from '@/components/ui/IconButton'
import { useConfirmNarrative } from '@/features/narrative/hooks/useConfirmNarrative'
import { useGenerateNarrative } from '@/features/narrative/hooks/useGenerateNarrative'
import { useNarrativeContext } from '@/features/narrative/hooks/useNarrativeContext'
import {
  readNarrativePlaybackPosition,
  saveNarrativePlaybackPosition,
  useNarratives,
  type LastNarrativePeek,
} from '@/features/narrative/hooks/useNarratives'
import { usePlanNarrative } from '@/features/narrative/hooks/usePlanNarrative'
import { requestWalkingRoute } from '@/features/narrative/hooks/useWalkingRoute'
import { useArrivalDetection } from '@/features/narrative/hooks/useArrivalDetection'
import { useTourReadiness } from '@/features/narrative/hooks/useTourReadiness'
import { useResolveLandmark } from '@/features/landmarks/hooks/useResolveLandmark'
import { useRouter } from '@/i18n/navigation'
import { queryKeys } from '@/services/queryKeys'
import { getLandmarkById } from '@/services/repositories/landmarksRepository'
import { useNarrativeStore } from '@/stores/narrativeStore'
import { useTourPreferencesStore } from '@/stores/tourPreferencesStore'
import { getLandmarkImageUrl } from '@/lib/landmarkImage'
import type { Landmark, MapPin } from '@/types/landmark'
import type { DraftNarrative, NarrativeChapter, NarrativeRequest, PlaybackItem, WalkingRoute } from '@/types/narrative'
import type { SheetSnap } from '@/types/tourSheet'
import type { NavTabId } from '@/types/navigation'
import type { AppLocale } from '@/types/locale'

const MapView = dynamic(
  () => import('@/components/map/MapView').then((mod) => mod.MapView),
  {
    ssr: false,
    loading: () => <LoadingScreen coverImage="/quick-start/main-parliament.webp" />,
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
  const tNavigation = useTranslations('navigation')
  const { resolveLandmark } = useResolveLandmark()
  const queryClient = useQueryClient()
  const { context: narrativeContext, locationStatus, requestLocation } = useNarrativeContext()
  const { generateNarrative, loadCuratedTour } = useGenerateNarrative()
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
    generationStage,
    generationProgress,
    setFlowState,
    setActiveChapterIndex,
    setError,
    reset,
  } = useNarrativeStore()
  const setFromQuestionnaire = useTourPreferencesStore((state) => state.setFromQuestionnaire)

  const [selectedLandmark, setSelectedLandmark] = useState<Landmark | null>(null)
  const [focusLandmark, setFocusLandmark] = useState<MapPin | null>(null)
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | undefined>(undefined)
  const [startDictation, setStartDictation] = useState(false)
  const [questionnaireInitialIntent, setQuestionnaireInitialIntent] = useState('')
  const [isGuideOpen, setIsGuideOpen] = useState(false)
  const [overlayReturnTo, setOverlayReturnTo] = useState<'tours' | 'settings' | null>(null)
  const [lastPrompt, setLastPrompt] = useState('')
  const [lastExtras, setLastExtras] = useState<QuestionnaireExtras | undefined>(undefined)
  const [activeTab, setActiveTab] = useState<NavTabId>('explore')
  const [lastNarrativePeek, setLastNarrativePeek] = useState<LastNarrativePeek | null>(null)
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(true)

  const [sheetSnap, setSheetSnap] = useState<SheetSnap>('collapsed')
  const [temporaryRoute, setTemporaryRoute] = useState<WalkingRoute | null>(null)
  const [isRerouting, setIsRerouting] = useState(false)
  const [arrivalMessage, setArrivalMessage] = useState<string | null>(null)
  const [manualPlayRequest, setManualPlayRequest] = useState<{ chapterId: string; requestId: number } | null>(null)

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

  const initialPlaybackPosition = useMemo(
    () => activeRoute && activeChapter
      ? readNarrativePlaybackPosition(activeRoute.id, activeChapter.id)
      : 0,
    [activeChapter, activeRoute],
  )

  const handlePlaybackPositionChange = useCallback((seconds: number) => {
    if (!activeRoute || !activeChapter) return
    saveNarrativePlaybackPosition(activeRoute.id, activeChapter.id, seconds)
  }, [activeChapter, activeRoute])

  const handleArrival = useCallback((chapter: { title?: string }) => {
    setArrivalMessage(tNavigation('arrived', { title: chapter.title ?? '' }))
    // GPS callbacks are not trusted user gestures, so browsers may block
    // autoplay. Open the player and leave the final play action to the visitor.
    setSheetSnap('expanded')
  }, [tNavigation])

  const arrivalDetection = useArrivalDetection(activeRoute ? activeChapter : null, handleArrival)
  const tourReadiness = useTourReadiness(activeRoute)

  const handleManualArrival = useCallback(() => {
    if (!activeChapter) return
    handleArrival(activeChapter)
    setManualPlayRequest((current) => ({
      chapterId: activeChapter.id,
      requestId: (current?.requestId ?? 0) + 1,
    }))
  }, [activeChapter, handleArrival])

  useEffect(() => {
    setTemporaryRoute(null)
    setArrivalMessage(null)
  }, [activeChapter?.id])

  const handleReroute = useCallback(() => {
    if (!activeChapter || !navigator.geolocation) return
    setIsRerouting(true)
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const route = await requestWalkingRoute([
            { lat: position.coords.latitude, lng: position.coords.longitude },
            { lat: activeChapter.lat, lng: activeChapter.lng },
          ])
          setTemporaryRoute(route)
        } catch {
          setTemporaryRoute(null)
        } finally {
          setIsRerouting(false)
        }
      },
      () => setIsRerouting(false),
      { enableHighAccuracy: false, maximumAge: 30_000, timeout: 10_000 },
    )
  }, [activeChapter])

  const playbackItem = useMemo<PlaybackItem | null>(() => {
    if (activeChapter && activeRoute) {
      return {
        id: activeChapter.id,
        title: activeChapter.title,
        chapterLabel: `• ${tPlayer('chapter', { number: String(activeChapter.chapterIndex + 1).padStart(2, '0') })}`,
        audioUrl: activeChapter.audioUrl,
        imageUrl: activeChapter.imageUrl,
        imageAlt: activeChapter.title,
        landmarkId: activeChapter.landmarkId ?? null,
        script: activeChapter.script ?? null,
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
        landmarkId: selectedLandmark.id,
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
    setActiveTab('explore')
  }, [hasActiveRoute, reset, sheetSnap])

  const handleOpenElicitation = useCallback((initialIntent = '') => {
    setStartDictation(false)
    setQuestionnaireInitialIntent(initialIntent)
    setFlowState('eliciting')
  }, [setFlowState])

  useEffect(() => {
    const returnTo = searchParams.get('returnTo')
    const safeReturnTo = returnTo === 'tours' || returnTo === 'settings' ? returnTo : null
    if (searchParams.get('createTour') === '1' || searchParams.get('ai') === '1') {
      setOverlayReturnTo(safeReturnTo)
      setStartDictation(false)
      setQuestionnaireInitialIntent('')
      setFlowState('eliciting')
      router.replace('/')
      return
    }

    if (searchParams.get('guide') === '1') {
      setOverlayReturnTo(safeReturnTo)
      setIsGuideOpen(true)
      router.replace('/')
    }
  }, [router, searchParams, setFlowState])

  /** Style→Topics→Recap flow, and the free-text intent bar — both go through the route preview. */
  const handlePlan = async (extras: QuestionnaireExtras) => {
    setLastPrompt(JSON.stringify(extras))
    setLastExtras(extras)
    setSelectedLandmark(null)
    setLastNarrativePeek(null)

    if (extras?.styleId) {
      setFromQuestionnaire({ styleId: extras.styleId, topicIds: extras.topicIds })
    }

    try {
      await planNarrative(extras, { ...narrativeContext, locale, ...extras })
    } catch {
      // error handled in store
    }
  }

  /** One-tap curated starters skip the preview — the prompt is pre-vetted. */
  const handleStartCurated = async (starter: CuratedStarter, initialChapterIndex = 0) => {
    setLastPrompt(`curated:${starter.slug}`)
    setSelectedLandmark(null)
    setLastNarrativePeek(null)
    setFromQuestionnaire({ styleId: starter.styleId, topicIds: starter.topicIds })

    try {
      if (starter.kind === 'fixed') {
        await loadCuratedTour(starter.slug, locale, initialChapterIndex)
      } else {
        await generateNarrative({
          styleId: starter.styleId,
          topicIds: starter.topicIds,
          timeBudgetMinutes: 90,
          nearMe: false,
        } satisfies NarrativeRequest, {
          ...narrativeContext,
          locale,
          styleId: starter.styleId,
          topicIds: starter.topicIds,
        }, starter.slug)
      }
      setActiveTab('explore')
    } catch {
      // error handled in store
    }
  }

  const handleConfirmDraft = async (draft: DraftNarrative) => {
    try {
      await confirmNarrative(draft)
      setActiveTab('explore')
    } catch {
      // error handled in store
    }
  }

  const handleDiscardDraft = useCallback(() => {
    reset()
  }, [reset])

  const handleRetry = () => {
    if (lastPrompt && lastExtras) {
      handlePlan(lastExtras)
    }
  }

  const handleResumeTour = useCallback(() => {
    if (!lastNarrativePeek) {
      return
    }

    resumeLastNarrative(lastNarrativePeek)
      .then(() => setActiveTab('explore'))
      .catch(() => {})
    setLastNarrativePeek(null)
  }, [lastNarrativePeek, resumeLastNarrative])

  const handleDismissResume = useCallback(() => {
    dismissLastNarrative()
    setLastNarrativePeek(null)
  }, [dismissLastNarrative])

  const handleTabChange = useCallback((tab: NavTabId) => {
    setActiveTab(tab)

    if (tab === 'tours') {
      router.push('/tours')
      return
    }

    if (tab === 'settings') {
      router.push('/settings')
      return
    }

    if (tab === 'explore') {
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
      setFocusLandmark(pin)
      setActiveTab('explore')
    },
    [reset, resolveLandmark],
  )

  const handleSearchLandmarkSelect = useCallback((pin: MapPin) => {
    setFocusLandmark(pin)
    setActiveTab('explore')
  }, [])

  const handleChapterSelect = useCallback((chapter: NarrativeChapter) => {
    if (!activeRoute) {
      return
    }

    const index = activeRoute.chapters.findIndex((item) => item.id === chapter.id)
    if (index >= 0) {
      setActiveChapterIndex(index)
      setActiveTab('explore')
    }
  }, [activeRoute, setActiveChapterIndex])

  const handlePlayNextStop = useCallback(() => {
    if (!activeRoute || !activeChapter) return
    const nextChapter = activeRoute.chapters[activeChapterIndex + 1]
    if (!nextChapter) return

    setActiveChapterIndex(activeChapterIndex + 1)
    handleArrival(nextChapter)
    setManualPlayRequest((current) => ({
      chapterId: nextChapter.id,
      requestId: (current?.requestId ?? 0) + 1,
    }))
  }, [activeChapter, activeChapterIndex, activeRoute, handleArrival, setActiveChapterIndex])

  const handleOpenDirections = useCallback(() => {
    if (!activeChapter || typeof window === 'undefined') return
    const params = new URLSearchParams({
      api: '1',
      destination: `${activeChapter.lat},${activeChapter.lng}`,
      travelmode: 'walking',
    })
    window.location.assign(`https://www.google.com/maps/dir/?${params.toString()}`)
  }, [activeChapter])

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
    <main className="map-experience relative h-[100dvh] w-full overflow-hidden bg-background">
      <MapView
        selectedLandmarkId={selectedLandmarkId}
        focusLandmark={focusLandmark}
        onCenterChange={setMapCenter}
        onLandmarkSelect={handleLandmarkSelect}
        activeRoute={activeRoute}
        selectedChapterId={activeChapter?.id ?? null}
        onChapterSelect={handleChapterSelect}
        showLandmarks={!hasActiveRoute}
        temporaryRoute={temporaryRoute}
      />

      {showChrome && hasActiveRoute && activeChapter && (
        <div className="absolute right-4 top-[max(4.25rem,env(safe-area-inset-top))] z-30 flex max-w-64 flex-col items-end gap-2">
          <div className="rounded-2xl bg-surface/95 px-3 py-3 text-xs text-on-surface shadow-lg backdrop-blur">
            <p className="font-bold">
              {tourReadiness.status === 'ready' && tNavigation('offlineReady')}
              {tourReadiness.status === 'preparing' && tNavigation('preparingOffline')}
              {tourReadiness.status === 'partial' && tNavigation('offlinePartial')}
              {tourReadiness.status === 'unavailable' && tNavigation('offlineUnavailable')}
              {tourReadiness.status === 'offline' && tNavigation('offlineNow')}
            </p>
            <p className="mt-1 text-on-surface/65">
              {arrivalDetection.status === 'tracking' && tNavigation('locationTracking')}
              {arrivalDetection.status === 'requesting' && tNavigation('locationRequesting')}
              {arrivalDetection.status === 'weak' && tNavigation('locationWeak', { accuracy: Math.round(arrivalDetection.accuracyMeters ?? 0) })}
              {arrivalDetection.status === 'paused' && tNavigation('locationPaused')}
              {arrivalDetection.status === 'denied' && tNavigation('locationDenied')}
              {arrivalDetection.status === 'unavailable' && tNavigation('locationUnavailable')}
            </p>
            <p className="mt-1 text-on-surface/50">{tNavigation('foregroundOnly')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleManualArrival}
                className="rounded-full bg-accent px-3 py-2 font-bold text-on-primary"
              >
                {tNavigation('manualPlay')}
              </button>
              <button
                type="button"
                onClick={handleReroute}
                disabled={isRerouting}
                className="rounded-full border border-outline-variant/50 px-3 py-2 font-bold disabled:opacity-60"
              >
                {isRerouting ? tNavigation('rerouting') : tNavigation('reroute')}
              </button>
              {(arrivalDetection.status === 'denied' || arrivalDetection.status === 'unavailable') && (
                <button type="button" onClick={arrivalDetection.retry} className="rounded-full px-3 py-2 font-bold text-accent">
                  {tNavigation('retryLocation')}
                </button>
              )}
            </div>
          </div>
          {arrivalMessage && (
            <p role="status" className="max-w-56 rounded-xl bg-surface px-3 py-2 text-xs font-semibold text-on-surface shadow">
              {arrivalMessage}
            </p>
          )}
        </div>
      )}

      {isOnboardingOpen && (
        <section
          className="absolute inset-0 z-40 overflow-hidden bg-[#1d1611]"
          aria-label="Welcome to Tales of Budapest"
          role="dialog"
          aria-modal="true"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/quick-start/main-parliament.webp"
            alt="Hungarian Parliament Building"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0" aria-hidden="true" />
          <div className="absolute inset-x-0 bottom-0 px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-24 text-center text-white">
            <p className="font-serif text-3xl font-semibold">Tales of Budapest</p>
            <p className="mt-2 text-sm text-white/80">Stories waiting around every corner.</p>
            <SlideToStart onComplete={() => setIsOnboardingOpen(false)} />
          </div>
        </section>
      )}

      {showChrome && !playbackItem && !isEliciting && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[31] flex flex-col gap-2.5 pb-4 pt-[max(0.875rem,env(safe-area-inset-top))]">
          <div className="pointer-events-auto px-3 pt-3">
            <PlaceSearch onSelect={handleSearchLandmarkSelect} />
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
          onClose={() => {
            setFlowState('idle')
            if (overlayReturnTo) {
              router.push(overlayReturnTo === 'tours' ? '/tours' : '/settings')
              setOverlayReturnTo(null)
            }
          }}
          onPlan={handlePlan}
          onStartCurated={handleStartCurated}
          onRequestLocation={requestLocation}
          locationStatus={locationStatus}
          focusInput={startDictation}
          initialIntent={questionnaireInitialIntent}
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
        stage={generationStage}
        progress={generationProgress}
      />

      {showChrome && playbackItem && !isOnboardingOpen && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[35] flex justify-start px-4 pt-[max(0.875rem,env(safe-area-inset-top))]">
          <IconButton
            icon={ChevronLeft}
            onClick={handlePlaybackBack}
            ariaLabel={tPlayer('goBack')}
            size="lg"
            className="pointer-events-auto rounded-2xl bg-surface text-on-surface/70 shadow-[0_4px_16px_rgba(0,0,0,0.12)]"
          />
        </div>
      )}

      {showChrome && playbackItem && !isOnboardingOpen && (
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
          offlineReadiness={hasActiveRoute ? tourReadiness : null}
          onPrepareOffline={hasActiveRoute ? tourReadiness.prepare : undefined}
          onOpenDirections={hasActiveRoute ? handleOpenDirections : undefined}
          onManualArrival={hasActiveRoute ? handleManualArrival : undefined}
          onPlayNextStop={hasActiveRoute ? handlePlayNextStop : undefined}
          onSelectRouteStop={hasActiveRoute ? (id) => {
            const chapter = activeRoute?.chapters.find((item) => item.id === id)
            if (chapter) handleChapterSelect(chapter)
          } : undefined}
          manualPlayRequest={manualPlayRequest}
          initialPlaybackPosition={initialPlaybackPosition}
          onPlaybackPositionChange={hasActiveRoute ? handlePlaybackPositionChange : undefined}
        />
      )}

      {showChrome && !isEliciting && sheetSnap !== 'expanded' && (
        <BottomNav
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onCreateTour={() => handleOpenElicitation('')}
          onOpenAiGuide={() => {
            setOverlayReturnTo(null)
            setIsGuideOpen(true)
          }}
          showNavigation={!hasActiveRoute}
          variant="map"
        />
      )}

      <AiGuideChat
        isOpen={isGuideOpen}
        context={{
          locale,
          mapCenter,
          selectedLandmarkId: selectedLandmark?.id ?? activeChapter?.landmarkId ?? undefined,
          activeChapterId: activeChapter?.id,
        }}
        onClose={() => {
          setIsGuideOpen(false)
          if (overlayReturnTo) {
            router.push(overlayReturnTo === 'tours' ? '/tours' : '/settings')
            setOverlayReturnTo(null)
          }
        }}
        onShowLandmark={(landmarkId) => {
          void getLandmarkById(landmarkId, locale).then((landmark) => {
            if (!landmark) return
            reset()
            setIsGuideOpen(false)
            setOverlayReturnTo(null)
            setSelectedLandmark(landmark)
            setFocusLandmark(landmark)
            setActiveTab('explore')
          })
        }}
        onCreateTour={(intent) => {
          setIsGuideOpen(false)
          handleOpenElicitation(intent)
        }}
      />
    </main>
  )
}

const HomePage = () => {
  const t = useTranslations('home')

  return (
    <Suspense fallback={<LoadingScreen message={t('loadingMap')} coverImage="/quick-start/main-parliament.webp" />}>
      <HomePageContent />
    </Suspense>
  )
}

export default HomePage
