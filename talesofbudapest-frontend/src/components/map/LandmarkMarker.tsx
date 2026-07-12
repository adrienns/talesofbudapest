'use client'

import { memo, useMemo } from 'react'
import { Marker } from 'react-leaflet'
import {
  createLandmarkDotIcon,
  createLandmarkIcon,
} from '@/components/map/createLandmarkIcon'
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
  const icon = useMemo(() => {
    if (variant === 'dot') {
      return createLandmarkDotIcon(isSelected)
    }

    return createLandmarkIcon(landmark, isSelected)
  }, [landmark, isSelected, variant])

  return (
    <Marker
      position={[landmark.lat, landmark.lng]}
      icon={icon}
      zIndexOffset={isSelected ? 1000 : variant === 'photo' ? 200 : 0}
      eventHandlers={{
        click: () => onSelect(landmark),
      }}
    />
  )
})
