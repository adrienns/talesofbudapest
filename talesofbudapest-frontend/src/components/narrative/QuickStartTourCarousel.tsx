import { ClassicTourCard } from '@/components/narrative/ClassicTourCard'
export type CarouselCard = {
  slug: string
  title: string
  tagline: string
  imageSrc: string
  imageAlt: string
}

type QuickStartTourCarouselProps = {
  label?: string
  tours: CarouselCard[]
  onSelect?: (slug: string) => void
  variant?: 'tour' | 'place'
  selectedSlug?: string | null
}

export const QuickStartTourCarousel = ({
  label,
  tours,
  onSelect,
  variant = 'tour',
  selectedSlug = null,
}: QuickStartTourCarouselProps) => (
  <div className="w-full">
    {label && (
      <div className="mb-3 px-1">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-on-surface/55">{label}</p>
      </div>
    )}
    <div
      className="-mx-1 -mb-12 -mt-6 flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-12 pl-1 pr-5 pt-6 scrollbar-hide"
      role="list"
      aria-label={label ?? 'Tours'}
    >
      {tours.map((tour, index) => (
        <div
          key={tour.slug}
          role="listitem"
          className="w-[calc((100%-0.625rem)/2.12)] shrink-0 snap-start"
        >
          {variant === 'tour' ? (
            <ClassicTourCard
              title={tour.title}
              tagline={tour.tagline}
              imageSrc={tour.imageSrc}
              imageAlt={tour.imageAlt}
              onClick={onSelect ? () => onSelect(tour.slug) : undefined}
            />
          ) : (
            <button
              type="button"
              onClick={onSelect ? () => onSelect(tour.slug) : undefined}
              aria-pressed={tour.slug === selectedSlug}
              className={`flex aspect-[4/5] w-full flex-col overflow-hidden rounded-2xl border-2 bg-surface text-left shadow-[0_8px_22px_rgba(45,41,38,0.08)] transition-colors active:scale-[0.98] ${
                tour.slug === selectedSlug
                  ? 'border-[var(--color-accent)]'
                  : 'border-transparent'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={tour.imageSrc} alt={tour.imageAlt} className="h-[58%] w-full object-cover" />
              <div className="min-h-0 px-3.5 py-3">
                <h3 className="line-clamp-2 flex items-start gap-1.5 text-sm font-bold leading-tight text-on-surface">
                  <span className="mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--map-orange)_18%,transparent)] text-[0.625rem] font-bold text-[var(--map-orange-deep)]">
                    {index + 1}
                  </span>
                  <span>{tour.title}</span>
                </h3>
                <p className="mt-1 line-clamp-2 text-[0.6875rem] leading-snug text-on-surface/75">{tour.tagline}</p>
              </div>
            </button>
          )}
        </div>
      ))}
    </div>
  </div>
)
