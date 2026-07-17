'use client'

import { useEffect, useState } from 'react'
import { getLandmarkInitial, getLandmarkMarkerImageUrl } from '@/lib/landmarkImage'
import type { MapPin } from '@/types/landmark'

type MarkerTheme = 'history' | 'architecture'
type MarkerVisual = Pick<MapPin, 'name' | 'image_url' | 'map_theme' | 'landmark_type'> & {
  images?: { url: string }[]
}

const markerTheme = (landmark: MarkerVisual): MarkerTheme =>
  landmark.map_theme
  ?? (['monument', 'statue', 'iconic'].includes(landmark.landmark_type ?? '') ? 'history' : 'architecture')

const truncateLabel = (name: string) => name.length > 22 ? `${name.slice(0, 21)}…` : name

export const MapPhotoMarker = ({
  landmark,
  isSelected,
  stopNumber,
}: {
  landmark: MarkerVisual
  isSelected: boolean
  stopNumber?: number
}) => {
  const imageUrl = getLandmarkMarkerImageUrl(landmark)
  const [imageAvailable, setImageAvailable] = useState(Boolean(imageUrl))
  const theme = markerTheme(landmark)

  useEffect(() => setImageAvailable(Boolean(imageUrl)), [imageUrl])

  return (
    <div className={`landmark-photo-marker map-theme-${theme} ${isSelected ? 'landmark-photo-marker--selected' : ''}`}>
      <div className="photo-marker-shell">
        <div
          className={`photo-marker ${isSelected ? 'photo-marker--selected' : ''} ${imageAvailable ? '' : 'photo-marker--fallback'} map-theme-${theme}`}
          role="img"
          aria-label={landmark.name}
        >
          <div className="photo-marker__circle">
            <div className="photo-marker__media">
              {imageUrl && imageAvailable && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="photo-marker__image" src={imageUrl} alt="" aria-hidden="true" referrerPolicy="no-referrer" loading="lazy" onError={() => setImageAvailable(false)} />
              )}
              <span className="photo-marker__initial">{getLandmarkInitial(landmark.name)}</span>
            </div>
          </div>
          <div className="photo-marker__pointer" aria-hidden="true" />
          {stopNumber ? <span className="photo-marker__stop-badge" aria-hidden="true">{stopNumber}</span> : null}
        </div>
      </div>
      <span className="landmark-photo-marker__label">{truncateLabel(landmark.name)}</span>
    </div>
  )
}

export const MapDotMarker = ({ theme = 'architecture' }: { theme?: MarkerTheme }) => (
  <div className={`landmark-dot-marker map-theme-${theme}`} aria-hidden="true">
    <span className="landmark-dot-marker__dot" />
  </div>
)

export const resolveMarkerTheme = markerTheme
