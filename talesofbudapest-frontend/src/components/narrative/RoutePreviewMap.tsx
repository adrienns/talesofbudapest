'use client'

import { MapContainer, Polyline, TileLayer } from 'react-leaflet'
import { ChapterMarker } from '@/components/map/ChapterMarker'
import { MapFitBounds } from '@/components/map/MapFitBounds'
import { MAP_ATTRIBUTION, MAP_CENTER, MAP_TILE_OPTIONS, MAP_TILE_URL } from '@/constants/map'
import { colors } from '@/constants/designTokens'
import type { NarrativeChapter, WalkingRoute } from '@/types/narrative'
import 'leaflet/dist/leaflet.css'

type RoutePreviewMapProps = {
  chapters: NarrativeChapter[]
  selectedChapterId?: string | null
  onChapterSelect?: (chapter: NarrativeChapter) => void
  fitKey: string
  walkingRoute?: WalkingRoute | null
}

/** A small, self-contained map for the route preview — no pin fetching or clustering. */
export const RoutePreviewMap = ({
  chapters,
  selectedChapterId = null,
  onChapterSelect,
  fitKey,
  walkingRoute = null,
}: RoutePreviewMapProps) => {
  const positions = chapters.map((chapter) => [chapter.lat, chapter.lng] as [number, number])

  return (
    <MapContainer
      center={MAP_CENTER}
      zoom={14}
      scrollWheelZoom
      dragging
      preferCanvas
      maxZoom={MAP_TILE_OPTIONS.maxZoom}
      className="h-full w-full"
      zoomControl={false}
    >
      <TileLayer
        attribution={MAP_ATTRIBUTION}
        url={MAP_TILE_URL}
        maxZoom={MAP_TILE_OPTIONS.maxZoom}
        updateWhenIdle={MAP_TILE_OPTIONS.updateWhenIdle}
        keepBuffer={MAP_TILE_OPTIONS.keepBuffer}
      />

      {positions.length > 1 && (
        <Polyline
          positions={walkingRoute?.geometry ?? positions}
          pathOptions={{ color: colors.accent, weight: 3, opacity: 0.85, dashArray: walkingRoute ? undefined : '8 8' }}
        />
      )}

      {chapters.map((chapter, index) => (
        <ChapterMarker
          key={chapter.id}
          chapter={chapter}
          stopNumber={index + 1}
          isSelected={chapter.id === selectedChapterId}
          onSelect={(selected) => onChapterSelect?.(selected)}
        />
      ))}

      <MapFitBounds chapters={chapters} triggerKey={fitKey} />
    </MapContainer>
  )
}
