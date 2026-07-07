'use client'

import type { LandmarkImage } from '@/types'

type LandmarkImageGalleryProps = {
  images: LandmarkImage[]
  activeUrl?: string | null
  onSelect?: (url: string) => void
}

export const LandmarkImageGallery = ({
  images,
  activeUrl,
  onSelect,
}: LandmarkImageGalleryProps) => {
  if (images.length <= 1) {
    return null
  }

  return (
    <div
      className="flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="list"
      aria-label="Landmark photo gallery"
    >
      {images.map((image) => {
        const isActive = image.url === activeUrl

        return (
          <button
            key={image.url}
            type="button"
            role="listitem"
            onClick={() => onSelect?.(image.url)}
            aria-label={image.alt ?? 'Landmark photo'}
            aria-pressed={isActive}
            className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg border transition ${
              isActive
                ? 'border-primary ring-2 ring-primary/25'
                : 'border-outline-variant/40 opacity-80 hover:opacity-100'
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.url}
              alt={image.alt ?? ''}
              className="h-full w-full object-cover grayscale"
            />
          </button>
        )
      })}
    </div>
  )
}
