'use client'

import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { AiChatScreen } from '@/components/narrative/AiChatScreen'
import { NarrativeGeneratingOverlay } from '@/components/narrative/NarrativeGeneratingOverlay'
import { AudioDrawer } from '@/components/ui/AudioDrawer'
import { BottomNav } from '@/components/ui/BottomNav'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { PromptBar } from '@/components/ui/PromptBar'
import { useGenerateNarrative } from '@/features/narrative/hooks/useGenerateNarrative'
import { useNarrativeContext } from '@/features/narrative/hooks/useNarrativeContext'
import { useNarratives } from '@/features/narrative/hooks/useNarratives'
import { useLandmarks } from '@/features/landmarks/hooks/useLandmarks'
import { useNarrativeStore } from '@/stores/narrativeStore'
import type { Landmark } from '@/types'
import type { NarrativeChapter, PlaybackItem } from '@/types/narrative'
import type { NavTabId } from '@/types/navigation'

const MapView = dynamic(
  () => import('@/components/map/MapView').then((mod) => mod.MapView),
  {
    ssr: false,
    loading: () => <div className="absolute inset-0 bg-surface" aria-hidden="true" />,
  },
)

const HomePageContent = () => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { landmarks, isLoading, error } = useLandmarks()
  const narrativeContext = useNarrativeContext()
  const { generateNarrative } = useGenerateNarrative()
  const { loadNarrativeById, restoreLastNarrative } = useNarratives()
  const {
    flowState,
    activeRoute,
    activeChapterIndex,
    error: narrativeError,
    setFlowState,
    setActiveChapterIndex,
    setError,
    reset,
  } = useNarrativeStore()

  const [selectedLandmark, setSelectedLandmark] = useState<Landmark | null>(null)
  const [startDictation, setStartDictation] = useState(false)
  const [lastPrompt, setLastPrompt] = useState('')
  const [activeTab, setActiveTab] = useState<NavTabId>('map')

  const isGenerating = flowState === 'generating'
  const isEliciting = flowState === 'eliciting'
  const hasActiveRoute = Boolean(activeRoute)

  useEffect(() => {
    restoreLastNarrative()
  }, [restoreLastNarrative])

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
        subtitle: 'CUSTOM NARRATIVE',
        chapterLabel: `• CH. ${String(activeChapter.chapterIndex + 1).padStart(2, '0')}`,
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
        imageUrl: selectedLandmark.image_url,
        imageAlt: selectedLandmark.images[0]?.alt ?? selectedLandmark.name,
        lat: selectedLandmark.lat,
        lng: selectedLandmark.lng,
      }
    }

    return null
  }, [activeChapter, activeRoute, selectedLandmark])

  const handleOpenElicitation = (withMic = false) => {
    setStartDictation(withMic)
    setFlowState('eliciting')
  }

  useEffect(() => {
    if (searchParams.get('ai') !== '1') {
      return
    }

    setStartDictation(false)
    setFlowState('eliciting')
    router.replace('/')
  }, [router, searchParams, setFlowState])

  const handleGenerate = async (prompt: string) => {
    setLastPrompt(prompt)
    setSelectedLandmark(null)
    setFlowState('generating')

    try {
      await generateNarrative(prompt, narrativeContext)
      setActiveTab('narrative')
    } catch {
      // error handled in store
    }
  }

  const handleRetry = () => {
    if (lastPrompt) {
      handleGenerate(lastPrompt)
    }
  }

  const handleTabChange = (tab: NavTabId) => {
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
  }

  const handleLandmarkSelect = (landmark: Landmark) => {
    reset()
    setSelectedLandmark(landmark)
    setActiveTab('narrative')
  }

  const handleChapterSelect = (chapter: NarrativeChapter) => {
    if (!activeRoute) {
      return
    }

    const index = activeRoute.chapters.findIndex((item) => item.id === chapter.id)
    if (index >= 0) {
      setActiveChapterIndex(index)
      setActiveTab('narrative')
    }
  }

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
  const showChrome = !isGenerating

  if (isLoading) {
    return <LoadingScreen message="Loading landmarks…" />
  }

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background">
      {error && (
        <div className="absolute inset-x-4 top-[max(1rem,env(safe-area-inset-top))] z-30 rounded-xl border border-accent/30 bg-surface px-4 py-3 text-body text-accent">
          {error}
        </div>
      )}

      <MapView
        landmarks={landmarks}
        selectedLandmarkId={selectedLandmarkId}
        onLandmarkSelect={handleLandmarkSelect}
        activeRoute={activeRoute}
        selectedChapterId={activeChapter?.id ?? null}
        onChapterSelect={handleChapterSelect}
        showLandmarks={!hasActiveRoute}
      />

      {showChrome && !playbackItem && !isEliciting && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 pb-4 pt-[max(0.875rem,env(safe-area-inset-top))]">
          <div className="pointer-events-auto px-3 pt-3">
            <PromptBar
              onOpen={() => handleOpenElicitation(false)}
              onMicClick={() => handleOpenElicitation(true)}
            />
          </div>
        </div>
      )}

      <AiChatScreen
        isOpen={isEliciting}
        context={narrativeContext}
        onClose={() => setFlowState('idle')}
        onGenerate={handleGenerate}
        startDictation={startDictation}
      />

      <NarrativeGeneratingOverlay
        isVisible={isGenerating || flowState === 'error'}
        error={flowState === 'error' ? narrativeError : null}
        onRetry={handleRetry}
        onDismiss={() => {
          setError(null)
          setFlowState('idle')
        }}
      />

      {showChrome && playbackItem && (
        <AudioDrawer
          playbackItem={playbackItem}
          routeTitle={hasActiveRoute ? activeRoute?.title : null}
          chapterIndex={activeChapterIndex}
          onSkipBack={hasActiveRoute ? () => selectAdjacentChapter(-1) : undefined}
          onSkipForward={hasActiveRoute ? () => selectAdjacentChapter(1) : undefined}
          readyGlow={hasActiveRoute && flowState === 'ready'}
        />
      )}

      {showChrome && !isEliciting && (
        <BottomNav
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onAiGuideClick={() => handleOpenElicitation(false)}
        />
      )}
    </main>
  )
}

const HomePage = () => (
  <Suspense fallback={<LoadingScreen message="Loading map…" />}>
    <HomePageContent />
  </Suspense>
)

export default HomePage
