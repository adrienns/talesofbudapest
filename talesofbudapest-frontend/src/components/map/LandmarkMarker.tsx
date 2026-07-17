'use client'

import { memo } from 'react'
import { Marker } from '@vis.gl/react-maplibre'
import { MapDotMarker, MapPhotoMarker, resolveMarkerTheme } from '@/components/map/MapMarkerVisual'
import type { MapPin } from '@/types/landmark'

type LandmarkMarkerProps = {
  landmark: MapPin
  isSelected: boolean
  variant: 'dot' | 'photo'
  onSelect: (landmark: MapPin) => void
}

export const LandmarkMarker = memo(function LandmarkMarker({
  landmark,
  isSelected,
  variant,
  onSelect,
}: LandmarkMarkerProps) {
  return (
    <Marker
      longitude={landmark.lng}
      latitude={landmark.lat}
      anchor="bottom"
      style={{ zIndex: isSelected ? 30 : variant === 'photo' ? 20 : 10 }}
      onClick={(event) => {
        event.originalEvent.stopPropagation()
        onSelect(landmark)
      }}
    >
      {variant === 'photo'
        ? <MapPhotoMarker landmark={landmark} isSelected={isSelected} />
        : <MapDotMarker theme={resolveMarkerTheme(landmark)} />}
    </Marker>
  )
})
