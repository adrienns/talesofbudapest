'use client'

import { Footprints, Loader2, Shuffle, X } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useReplaceStop } from '@/features/narrative/hooks/useReplaceStop'
import { formatLogistics, computeRouteLogistics, orderChaptersForWalking } from '@/lib/narrative/routeLogistics'
import type { DraftChapter, DraftNarrative } from '@/types/narrative'

const RoutePreviewMap = dynamic(
  () => import('@/components/narrative/RoutePreviewMap').then((mod) => mod.RoutePreviewMap),
  { ssr: false, loading: () => <div className="h-full w-full bg-surface-dim" aria-hidden="true" /> },
)

type NarrativeRoutePreviewProps = {
  draft: DraftNarrative
  onConfirm: (draft: DraftNarrative) => void
  onDiscard: () => void
}

/** Re-numbers chapters after a reorder or swap so chapterIndex always matches display order. */
const reindex = (chapters: DraftChapter[]): DraftChapter[] =>
  chapters.map((chapter, index) => ({ ...chapter, chapterIndex: index }))

export const NarrativeRoutePreview = ({ draft, onConfirm, onDiscard }: NarrativeRoutePreviewProps) => {
  const t = useTranslations('preview')
  const { replaceStop, replacingIndex, error: replaceError, clearError } = useReplaceStop()

  const start = draft.context.nearMe && draft.context.userLat != null && draft.context.userLng != null
    ? { lat: draft.context.userLat, lng: draft.context.userLng }
    : null

  const [orderedChapters, setOrderedChapters] = useState<DraftChapter[]>(() =>
    reindex(orderChaptersForWalking(draft.chapters, start)),
  )
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null)

  const logistics = useMemo(
    () => computeRouteLogistics(orderedChapters, start),
    [orderedChapters, start],
  )

  const mapChapters = useMemo(
    () =>
      orderedChapters.map((chapter) => ({
        id: chapter.landmarkId ?? `custom-${chapter.chapterIndex}`,
        chapterIndex: chapter.chapterIndex,
        title: chapter.title,
        lat: chapter.lat,
        lng: chapter.lng,
        audioUrl: null,
        imageUrl: chapter.imageUrl,
      })),
    [orderedChapters],
  )

  const handleSwap = async (index: number) => {
    clearError()
    const currentDraft: DraftNarrative = { ...draft, chapters: orderedChapters }

    try {
      const replacement = await replaceStop(currentDraft, index)
      const next = orderedChapters.map((chapter, i) => (i === index ? replacement : chapter))
      setOrderedChapters(reindex(orderChaptersForWalking(next, start)))
    } catch {
      // error surfaced via replaceError below
    }
  }

  const handleConfirm = () => {
    onConfirm({ ...draft, chapters: orderedChapters })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('title')}
      className="fixed inset-0 z-50 flex flex-col bg-[var(--color-ai-chat-bg)] animate-ai-chat-enter motion-reduce:animate-none"
    >
      <header className="flex items-center justify-between px-4 pt-[max(0.875rem,env(safe-area-inset-top))]">
        <div className="min-w-0 flex-1">
          <p className="truncate font-serif text-lg font-bold text-on-surface">{draft.title}</p>
          <p className="text-xs text-on-surface/50">{formatLogistics(logistics)}</p>
        </div>
        <button
          type="button"
          onClick={onDiscard}
          aria-label={t('close')}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-on-surface transition active:scale-95"
        >
          <X className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
        </button>
      </header>

      <div className="h-[38vh] shrink-0 px-4 pt-3">
        <div className="h-full w-full overflow-hidden rounded-2xl border border-outline-variant/30">
          <RoutePreviewMap
            chapters={mapChapters}
            selectedChapterId={selectedChapterId}
            onChapterSelect={(chapter) => setSelectedChapterId(chapter.id)}
            fitKey={orderedChapters.map((c) => c.landmarkId ?? c.chapterIndex).join('-')}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto flex max-w-md flex-col gap-3">
          {orderedChapters.map((chapter, index) => {
            const isReplacing = replacingIndex === index
            const isSelected = selectedChapterId === (chapter.landmarkId ?? `custom-${chapter.chapterIndex}`)

            return (
              <div
                key={`${chapter.landmarkId ?? 'custom'}-${index}`}
                className={`q-bubble-in flex gap-3 rounded-2xl p-3 transition ${
                  isSelected ? 'bg-accent/10' : 'bg-surface-dim/60'
                }`}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent font-bold text-white">
                  {index + 1}
                </div>

                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-surface-dim">
                  {chapter.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={chapter.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-accent/20 to-accent/5">
                      <span className="font-serif text-lg font-bold text-accent/45">B</span>
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-on-surface">{chapter.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-on-surface/60">
                    {chapter.script}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleSwap(index)}
                  disabled={isReplacing}
                  aria-label={t('swapStop')}
                  className="flex h-8 w-8 shrink-0 items-center justify-center self-center rounded-full text-accent transition active:scale-95 disabled:opacity-40"
                >
                  {isReplacing ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Shuffle className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                  )}
                </button>
              </div>
            )
          })}

          {replaceError && (
            <p className="text-center text-xs text-accent">{replaceError}</p>
          )}
        </div>
      </div>

      <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
        <button
          type="button"
          onClick={handleConfirm}
          className="q-start-btn q-start-pulse mx-auto flex w-full max-w-md items-center justify-center gap-2.5 rounded-full px-6 py-4 text-base font-bold text-white active:scale-[0.98]"
        >
          <Footprints className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
          {t('confirm')}
        </button>
      </div>
    </div>
  )
}
