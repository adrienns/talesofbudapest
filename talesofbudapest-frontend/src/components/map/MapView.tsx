'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { MapContainer, Polyline, TileLayer } from 'react-leaflet'
import { ChapterMarker } from '@/components/map/ChapterMarker'
import { LandmarkClusterLayer } from '@/components/map/LandmarkClusterLayer'
import { LandmarkMarker } from '@/components/map/LandmarkMarker'
import { MapFitBounds } from '@/components/map/MapFitBounds'
import { MapViewportTracker, type MapViewport } from '@/components/map/MapViewportTracker'
import { MapZoomHint } from '@/components/map/MapZoomHint'
import {
  MAP_ATTRIBUTION,
  MAP_CENTER,
  MAP_DEFAULT_ZOOM,
  MAP_TILE_OPTIONS,
  MAP_TILE_URL,
} from '@/constants/map'
import { useMapPins } from '@/features/landmarks/hooks/useMapPins'
import { useVisibleLandmarks } from '@/features/landmarks/hooks/useVisibleLandmarks'
import { useMapSettingsStore } from '@/stores/mapSettingsStore'
import { colors } from '@/constants/designTokens'
import type { MapViewProps } from '@/types/map'
import type { NarrativeChapter } from '@/types/narrative'
import 'leaflet/dist/leaflet.css'

const INITIAL_VIEWPORT: MapViewport = {
  zoom: MAP_DEFAULT_ZOOM,
  bounds: null,
}

export const MapView = ({
  selectedLandmarkId,
  onLandmarkSelect,
  activeRoute = null,
  selectedChapterId = null,
  onChapterSelect,
  showLandmarks = true,
}: MapViewProps) => {
  const [isMapReady, setIsMapReady] = useState(false)
  const [viewport, setViewport] = useState<MapViewport>(INITIAL_VIEWPORT)

  const handleViewportChange = useCallback((nextViewport: MapViewport) => {
    setViewport(nextViewport)
  }, [])

  const { pins, isLoading } = useMapPins(viewport.bounds, viewport.zoom)
  const { prominent, clustered } = useVisibleLandmarks(
    pins,
    viewport.zoom,
    viewport.bounds,
    selectedLandmarkId,
  )
  const showAllBuildings = useMapSettingsStore((state) => state.showAllBuildings)

  const clusterRebuildKey = useMemo(
    () =>
      `${viewport.zoom}-${showAllBuildings}-${pins.length}-${pins[0]?.id ?? ''}-${pins[pins.length - 1]?.id ?? ''}`,
    [pins, showAllBuildings, viewport.zoom],
  )

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
          preferCanvas
          maxZoom={MAP_TILE_OPTIONS.maxZoom}
          className="h-full w-full z-0"
          zoomControl={false}
        >
          <TileLayer
            attribution={MAP_ATTRIBUTION}
            url={MAP_TILE_URL}
            maxZoom={MAP_TILE_OPTIONS.maxZoom}
            updateWhenIdle={MAP_TILE_OPTIONS.updateWhenIdle}
            keepBuffer={MAP_TILE_OPTIONS.keepBuffer}
          />
          <MapViewportTracker onViewportChange={handleViewportChange} />

          {showLandmarks &&
            prominent.map(({ landmark, variant }) => (
              <LandmarkMarker
                key={landmark.id}
                landmark={landmark}
                variant={variant}
                isSelected={landmark.id === selectedLandmarkId}
                onSelect={onLandmarkSelect}
              />
            ))}

          {showLandmarks && clustered.length > 0 && (
            <LandmarkClusterLayer
              entries={clustered}
              rebuildKey={clusterRebuildKey}
              onSelect={onLandmarkSelect}
            />
          )}

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

      {isLoading && showLandmarks && (
        <div className="pointer-events-none absolute left-4 top-[max(5rem,env(safe-area-inset-top))] z-20 rounded-full border border-outline-variant/40 bg-surface/90 px-3 py-1.5 text-xs text-on-surface/70 shadow backdrop-blur">
          ●
        </div>
      )}

      <MapZoomHint zoom={viewport.zoom} showAllBuildings={showAllBuildings} />
    </div>
  )
}
