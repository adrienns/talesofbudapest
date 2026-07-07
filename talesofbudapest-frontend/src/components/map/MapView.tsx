'use client'

import { useEffect, useState } from 'react'
import { MapContainer, Polyline, TileLayer } from 'react-leaflet'
import { ChapterMarker } from '@/components/map/ChapterMarker'
import { LandmarkMarker } from '@/components/map/LandmarkMarker'
import { MapFitBounds } from '@/components/map/MapFitBounds'
import { MAP_CENTER, MAP_DEFAULT_ZOOM, MAP_TILE_ATTRIBUTION, MAP_TILE_URL } from '@/constants/map'
import { colors } from '@/constants/designTokens'
import type { MapViewProps } from '@/types/map'
import type { NarrativeChapter } from '@/types/narrative'
import 'leaflet/dist/leaflet.css'

export const MapView = ({
  landmarks,
  selectedLandmarkId,
  onLandmarkSelect,
  activeRoute = null,
  selectedChapterId = null,
  onChapterSelect,
  showLandmarks = true,
}: MapViewProps) => {
  const [isMapReady, setIsMapReady] = useState(false)

  useEffect(() => {
    setIsMapReady(true)
  }, [])

  const routePositions =
    activeRoute?.chapters.map((chapter) => [chapter.lat, chapter.lng] as [number, number]) ?? []

  const handleChapterSelect = (chapter: NarrativeChapter) => {
    onChapterSelect?.(chapter)
  }

  return (
    <div className="absolute inset-0 overflow-hidden">
      {isMapReady ? (
        <MapContainer
          key="budapest-map"
          center={MAP_CENTER}
          zoom={MAP_DEFAULT_ZOOM}
          scrollWheelZoom
          className="h-full w-full z-0"
          zoomControl={false}
        >
          <TileLayer attribution={MAP_TILE_ATTRIBUTION} url={MAP_TILE_URL} />

          {showLandmarks &&
            landmarks.map((landmark) => (
              <LandmarkMarker
                key={landmark.id}
                landmark={landmark}
                isSelected={landmark.id === selectedLandmarkId}
                onSelect={onLandmarkSelect}
              />
            ))}

          {activeRoute && routePositions.length > 1 && (
            <Polyline
              positions={routePositions}
              pathOptions={{
                color: colors.accent,
                weight: 3,
                opacity: 0.85,
                dashArray: '8 8',
              }}
            />
          )}

          {activeRoute?.chapters.map((chapter) => (
            <ChapterMarker
              key={chapter.id}
              chapter={chapter}
              isSelected={chapter.id === selectedChapterId}
              onSelect={handleChapterSelect}
            />
          ))}

          {activeRoute && (
            <MapFitBounds chapters={activeRoute.chapters} triggerKey={activeRoute.id} />
          )}
        </MapContainer>
      ) : (
        <div className="h-full w-full bg-surface" aria-hidden="true" />
      )}
    </div>
  )
}
