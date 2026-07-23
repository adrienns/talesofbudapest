'use client'

import { Marker } from '@vis.gl/react-maplibre'

type UserLocationMarkerProps = {
  lat: number
  lng: number
}

export const UserLocationMarker = ({ lat, lng }: UserLocationMarkerProps) => (
  <Marker longitude={lng} latitude={lat} anchor="center" style={{ zIndex: 20 }}>
    <div className="relative flex h-5 w-5 items-center justify-center" aria-hidden="true">
      <span className="absolute h-5 w-5 animate-ping rounded-full bg-[#4285f4]/30" />
      <span className="relative h-3.5 w-3.5 rounded-full border-2 border-white bg-[#4285f4] shadow-[0_0_6px_rgba(66,133,244,0.55)]" />
    </div>
  </Marker>
)
