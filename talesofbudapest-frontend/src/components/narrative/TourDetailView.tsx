'use client'

import { ChevronLeft, Clock3, Footprints, MapPinned, Route } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import { getCuratedTourDetail } from '@/constants/curatedTourDetails'
import type { CuratedStarter } from '@/constants/questionnaire'
import { QuickStartTourCarousel } from '@/components/narrative/QuickStartTourCarousel'
import { IconButton } from '@/components/ui/IconButton'

const RoutePreviewMap = dynamic(
  () => import('@/components/narrative/RoutePreviewMap').then((mod) => mod.RoutePreviewMap),
  { ssr: false, loading: () => <div className="h-full w-full bg-surface-dim" aria-hidden="true" /> },
)

type TourDetailViewProps = {
  starter: CuratedStarter
  title: string
  onClose: () => void
  onStart: (initialChapterIndex: number) => void
}

export const TourDetailView = ({ starter, title, onClose, onStart }: TourDetailViewProps) => {
  const detail = getCuratedTourDetail(starter)
  const [selectedStopId, setSelectedStopId] = useState(detail.chapters[0]?.id ?? null)
  const selectedStopIndex = Math.max(
    detail.chapters.findIndex((chapter) => chapter.id === selectedStopId),
    0,
  )
  const selectedStopNumber = selectedStopIndex + 1
  const places = detail.chapters.map((chapter) => ({
    slug: chapter.id,
    title: chapter.title,
    tagline: `Discover the stories that make this stop part of ${title}.`,
    imageSrc: chapter.imageUrl ?? starter.imageSrc,
    imageAlt: chapter.title,
  }))

  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-label={`${title} tour details`}
      className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-background animate-ai-chat-enter motion-reduce:animate-none"
    >
      <div className="relative h-[35dvh] min-h-64 shrink-0 overflow-hidden bg-primary">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={starter.imageSrc} alt={starter.kind === 'fixed' ? title : starter.imageAlt} className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#2d2926]/90 via-[#2d2926]/28 to-[#2d2926]/5" aria-hidden="true" />
        <IconButton
          icon={ChevronLeft}
          onClick={onClose}
          ariaLabel="Back to tours"
          className="absolute left-3 top-[max(0.75rem,env(safe-area-inset-top))] rounded-full border border-white/25 bg-black/25 text-white backdrop-blur-sm"
        />
        <div className="absolute inset-x-0 bottom-0 px-5 pb-7 text-white">
          <p className="inline-flex rounded-full bg-[#c0603f]/90 px-2.5 py-1 text-[0.6rem] font-bold uppercase tracking-[0.12em] text-white shadow-sm">Heritage tour</p>
          <h1 className="mt-2 max-w-[17rem] font-sans text-[1.75rem] font-extrabold leading-[1.05] tracking-tight text-white [text-shadow:0_2px_8px_rgba(0,0,0,0.35)]">{title}</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-28">
        <div className="mx-auto max-w-md px-5 pb-5 pt-4">
          <div className="grid grid-cols-2 gap-3">
            <article className="rounded-[1.35rem] bg-[var(--color-rose-pink)] px-4 py-3.5 text-center text-white shadow-[0_8px_18px_color-mix(in_srgb,var(--color-rose-pink)_28%,transparent),inset_0_1px_0_rgba(255,255,255,0.2)]">
              <span className="mx-auto grid h-7 w-7 place-items-center rounded-full bg-white/18"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" /></span>
              <p className="mt-1 text-[0.6rem] font-bold uppercase tracking-[0.1em] text-white/75">Duration</p>
              <p className="text-base font-extrabold leading-tight">{detail.duration}</p>
            </article>
            <article className="rounded-[1.35rem] bg-[var(--color-mustard-gold)] px-4 py-3.5 text-center text-white shadow-[0_8px_18px_color-mix(in_srgb,var(--color-mustard-gold)_28%,transparent),inset_0_1px_0_rgba(255,255,255,0.2)]">
              <span className="mx-auto grid h-7 w-7 place-items-center rounded-full bg-white/18"><Route className="h-3.5 w-3.5" aria-hidden="true" /></span>
              <p className="mt-1 text-[0.6rem] font-bold uppercase tracking-[0.1em] text-white/75">Distance</p>
              <p className="text-base font-extrabold leading-tight">{detail.distance}</p>
            </article>
          </div>

          <div className="mt-6">
          <p className="text-[0.98rem] leading-relaxed text-on-surface/75">{detail.summary}</p>
          </div>
          <div className="mt-7">
            <QuickStartTourCarousel
              label="What you’ll see"
              tours={places}
              variant="place"
              selectedSlug={selectedStopId}
              onSelect={setSelectedStopId}
            />
          </div>
          <div className="mt-6">
            <div className="mb-2 flex items-center gap-2"><MapPinned className="h-4 w-4 text-accent" aria-hidden="true" /><h2 className="text-sm font-bold">Route preview</h2><span className="ml-auto text-xs font-medium text-on-surface/50">Stop {selectedStopNumber} of {detail.chapters.length}</span></div>
            <div className="isolate z-0 h-52 overflow-hidden rounded-2xl border border-outline-variant/30 shadow-sm">
              <RoutePreviewMap chapters={detail.chapters} selectedChapterId={selectedStopId} onChapterSelect={(stop) => setSelectedStopId(stop.id)} fitKey={starter.slug} walkingRoute={detail.walkingRoute} />
            </div>
          </div>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-[1000] border-t border-outline-variant/25 bg-background/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <button type="button" onClick={() => onStart(selectedStopIndex)} className="q-start-btn mx-auto flex w-full max-w-md items-center justify-center gap-2 rounded-full px-6 py-4 text-base font-bold text-white active:scale-[0.98]">
          <Footprints className="h-5 w-5" aria-hidden="true" />
          {selectedStopIndex === 0 ? 'Start This Tour' : `Start at stop ${selectedStopNumber}`}
        </button>
      </div>
    </section>
  )
}
