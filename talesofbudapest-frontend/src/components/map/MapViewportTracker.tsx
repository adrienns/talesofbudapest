'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { useMap, useMapEvents } from 'react-leaflet'
import type { MapBounds } from '@/lib/map/visibleLandmarks'

export type MapViewport = {
  zoom: number
  bounds: MapBounds | null
}

type MapViewportTrackerProps = {
  onViewportChange: (viewport: MapViewport) => void
}

const DEBOUNCE_MS = 120

const boundsFromMap = (map: L.Map): MapBounds => {
  const bounds = map.getBounds()
  return {
    south: bounds.getSouth(),
    west: bounds.getWest(),
    north: bounds.getNorth(),
    east: bounds.getEast(),
  }
}

export const MapViewportTracker = ({ onViewportChange }: MapViewportTrackerProps) => {
  const map = useMap()
  const onViewportChangeRef = useRef(onViewportChange)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  onViewportChangeRef.current = onViewportChange

  const publishViewport = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }

    timerRef.current = setTimeout(() => {
      onViewportChangeRef.current({
        zoom: map.getZoom(),
        bounds: boundsFromMap(map),
      })
    }, DEBOUNCE_MS)
  }

  useMapEvents({
    moveend: publishViewport,
    zoomend: publishViewport,
    load: publishViewport,
  })

  useEffect(() => {
    onViewportChangeRef.current({
      zoom: map.getZoom(),
      bounds: boundsFromMap(map),
    })

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial sync only
  }, [map])

  return null
}
