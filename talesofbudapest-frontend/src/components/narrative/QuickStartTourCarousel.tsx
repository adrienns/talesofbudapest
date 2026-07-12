import { ClassicTourCard } from '@/components/narrative/ClassicTourCard'
import type { CuratedStarter } from '@/constants/questionnaire'

type QuickStartTour = Pick<
  CuratedStarter,
  'slug' | 'title' | 'tagline' | 'imageSrc' | 'imageAlt'
>

type QuickStartTourCarouselProps = {
  label: string
  tours: QuickStartTour[]
  onSelect: (slug: string) => void
}

export const QuickStartTourCarousel = ({ label, tours, onSelect }: QuickStartTourCarouselProps) => (
  <div className="w-full">
    <p className="mb-2.5 px-1 text-xs font-semibold uppercase tracking-[0.08em] text-on-surface/45">
      {label}
    </p>
    <div
      className="-mx-1 flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-1 pl-1 pr-5 scrollbar-hide"
      role="list"
      aria-label={label}
    >
      {tours.map((tour) => (
        <div
          key={tour.slug}
          role="listitem"
          className="w-[calc((100%-0.625rem)/2.12)] shrink-0 snap-start"
        >
          <ClassicTourCard
            title={tour.title}
            tagline={tour.tagline}
            imageSrc={tour.imageSrc}
            imageAlt={tour.imageAlt}
            onClick={() => onSelect(tour.slug)}
          />
        </div>
      ))}
    </div>
  </div>
)
