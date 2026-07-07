'use client'

import { Marker, Popup } from 'react-leaflet'
import { createLandmarkIcon } from '@/components/map/createLandmarkIcon'
import type { Landmark } from '@/types'

type LandmarkMarkerProps = {
  landmark: Landmark
  isSelected: boolean
  onSelect: (landmark: Landmark) => void
}

export const LandmarkMarker = ({
  landmark,
  isSelected,
  onSelect,
}: LandmarkMarkerProps) => (
  <Marker
    position={[landmark.lat, landmark.lng]}
    icon={createLandmarkIcon(isSelected)}
    eventHandlers={{
      click: () => onSelect(landmark),
    }}
  >
    {landmark.image_url && (
      <Popup className="landmark-popup" closeButton={false}>
        <div className="w-40 overflow-hidden rounded-lg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={landmark.image_url}
            alt={landmark.name}
            className="h-24 w-full object-cover grayscale"
          />
          <p className="mt-2 text-sm font-semibold leading-tight text-on-surface">
            {landmark.name}
          </p>
        </div>
      </Popup>
    )}
  </Marker>
)
