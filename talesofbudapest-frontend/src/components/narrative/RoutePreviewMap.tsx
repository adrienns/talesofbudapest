'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Layer, Map, Source, type MapRef } from '@vis.gl/react-maplibre'
import { ChapterMarker } from '@/components/map/ChapterMarker'
import { MAP_ATTRIBUTION_CONTROL, MAP_CENTER, MAP_MAX_ZOOM, MAP_STYLE_URL } from '@/constants/map'
import { colors } from '@/constants/designTokens'
import type { NarrativeChapter, WalkingRoute } from '@/types/narrative'

type RoutePreviewMapProps = {
  chapters: NarrativeChapter[]
  selectedChapterId?: string | null
  onChapterSelect?: (chapter: NarrativeChapter) => void
  fitKey: string
  walkingRoute?: WalkingRoute | null
}

export const RoutePreviewMap = ({ chapters, selectedChapterId = null, onChapterSelect, fitKey, walkingRoute = null }: RoutePreviewMapProps) => {
  const mapRef = useRef<MapRef>(null)
  const positions = walkingRoute?.geometry ?? chapters.map((chapter) => [chapter.lat, chapter.lng] as [number, number])
  const routeData = useMemo(() => ({
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'LineString' as const, coordinates: positions.map(([lat, lng]) => [lng, lat]) },
  }), [positions])

  const fitRoute = useCallback(() => {
    if (!chapters.length) return
    const lngs = chapters.map((chapter) => chapter.lng)
    const lats = chapters.map((chapter) => chapter.lat)
    mapRef.current?.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 48, maxZoom: 15, duration: 500 },
    )
  }, [chapters])

  useEffect(fitRoute, [fitKey, fitRoute])

  return (
    <Map
      ref={mapRef}
      initialViewState={{ latitude: MAP_CENTER[0], longitude: MAP_CENTER[1], zoom: 14 }}
      mapStyle={MAP_STYLE_URL}
      maxZoom={MAP_MAX_ZOOM}
      attributionControl={MAP_ATTRIBUTION_CONTROL}
      onLoad={fitRoute}
      reuseMaps
      style={{ width: '100%', height: '100%' }}
    >
      {positions.length > 1 && (
        <Source id="preview-route" type="geojson" data={routeData}>
          <Layer id="preview-route-line" type="line" paint={{ 'line-color': colors.accent, 'line-width': 3, 'line-opacity': 0.85, ...(walkingRoute ? {} : { 'line-dasharray': [2, 2] }) }} />
        </Source>
      )}
      {chapters.map((chapter, index) => (
        <ChapterMarker key={chapter.id} chapter={chapter} stopNumber={index + 1} isSelected={chapter.id === selectedChapterId} onSelect={(selected) => onChapterSelect?.(selected)} />
      ))}
    </Map>
  )
}
