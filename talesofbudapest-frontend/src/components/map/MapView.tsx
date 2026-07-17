'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Layer, Map as MapLibreMap, Source, type MapLayerMouseEvent, type MapRef } from '@vis.gl/react-maplibre'
import type { GeoJSONSource, LayerSpecification, Map as MapLibreMapInstance } from 'maplibre-gl'
import { ChapterMarker } from '@/components/map/ChapterMarker'
import {
  LandmarkClusterLayer,
  LANDMARK_CLUSTER_DOT_LAYER_ID,
  LANDMARK_CLUSTER_LAYER_ID,
  LANDMARK_CLUSTER_SOURCE_ID,
} from '@/components/map/LandmarkClusterLayer'
import { LandmarkMarker } from '@/components/map/LandmarkMarker'
import { MapZoomHint } from '@/components/map/MapZoomHint'
import { MAP_ATTRIBUTION_CONTROL, MAP_CENTER, MAP_DEFAULT_ZOOM, MAP_MAX_ZOOM, MAP_STYLE_URL } from '@/constants/map'
import { colors } from '@/constants/designTokens'
import { useMapPins } from '@/features/landmarks/hooks/useMapPins'
import { useVisibleLandmarks } from '@/features/landmarks/hooks/useVisibleLandmarks'
import type { MapBounds } from '@/lib/map/visibleLandmarks'
import { useMapSettingsStore } from '@/stores/mapSettingsStore'
import type { MapViewProps } from '@/types/map'
import type { NarrativeChapter } from '@/types/narrative'

type MapViewport = { zoom: number; bounds: MapBounds | null }

const INITIAL_VIEWPORT: MapViewport = { zoom: MAP_DEFAULT_ZOOM, bounds: null }

const ROAD_LAYER_EXCLUSIONS = /(?:cablecar|ferry|railway)/

const lineFeature = (positions: [number, number][]) => ({
  type: 'Feature' as const,
  properties: {},
  geometry: { type: 'LineString' as const, coordinates: positions.map(([lat, lng]) => [lng, lat]) },
})

const isRoadLineLayer = (layer: LayerSpecification) =>
  layer.type === 'line'
  && layer['source-layer'] === 'transportation'
  && !ROAD_LAYER_EXCLUSIONS.test(layer.id)

/** Keep OpenFreeMap's road geometry and widths while neutralising its warm road palette. */
const setRoadLinesWhite = (map: MapLibreMapInstance) => {
  map.getStyle().layers
    .filter(isRoadLineLayer)
    .forEach((layer) => map.setPaintProperty(layer.id, 'line-color', '#ffffff'))
}

export const MapView = ({
  selectedLandmarkId,
  onLandmarkSelect,
  activeRoute = null,
  selectedChapterId = null,
  onChapterSelect,
  showLandmarks = true,
  temporaryRoute = null,
}: MapViewProps) => {
  const mapRef = useRef<MapRef>(null)
  const [viewport, setViewport] = useState<MapViewport>(INITIAL_VIEWPORT)
  const { pins, isLoading } = useMapPins(viewport.bounds, viewport.zoom)
  const { prominent, clustered } = useVisibleLandmarks(pins, viewport.zoom, viewport.bounds, selectedLandmarkId)
  const showAllBuildings = useMapSettingsStore((state) => state.showAllBuildings)
  const clusteredById = useMemo(
    () => new Map(clustered.map(({ landmark }) => [landmark.id, landmark])),
    [clustered],
  )

  const publishViewport = useCallback(() => {
    const map = mapRef.current?.getMap()
    if (!map) return
    const bounds = map.getBounds()
    setViewport({
      zoom: map.getZoom(),
      bounds: {
        south: bounds.getSouth(),
        west: bounds.getWest(),
        north: bounds.getNorth(),
        east: bounds.getEast(),
      },
    })
  }, [])

  const handleMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap()
    if (!map) return

    setRoadLinesWhite(map)
    publishViewport()
  }, [publishViewport])

  const handleMapClick = useCallback((event: MapLayerMouseEvent) => {
    const feature = event.features?.[0]
    if (!feature) return

    if (feature.layer.id === LANDMARK_CLUSTER_DOT_LAYER_ID) {
      const landmarkId = String(feature.properties?.id ?? '')
      const landmark = clusteredById.get(landmarkId)
      if (landmark) {
        onLandmarkSelect(landmark)
      }
      return
    }

    if (feature.layer.id !== LANDMARK_CLUSTER_LAYER_ID || feature.geometry.type !== 'Point') return

    const map = mapRef.current?.getMap()
    if (!map) return
    const clusterId = Number(feature.properties?.cluster_id)
    const source = map.getSource(LANDMARK_CLUSTER_SOURCE_ID)
    if (!Number.isFinite(clusterId) || source?.type !== 'geojson') return

    const [lng, lat] = feature.geometry.coordinates
    void (source as GeoJSONSource).getClusterExpansionZoom(clusterId).then((zoom) => {
      map.easeTo({ center: [lng, lat], zoom: Math.min(zoom, MAP_MAX_ZOOM), duration: 500 })
    })
  }, [clusteredById, onLandmarkSelect])

  useEffect(() => {
    if (!activeRoute?.chapters.length) return
    const lngs = activeRoute.chapters.map((chapter) => chapter.lng)
    const lats = activeRoute.chapters.map((chapter) => chapter.lat)
    mapRef.current?.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 80, maxZoom: 15, duration: 700 },
    )
  }, [activeRoute?.id, activeRoute?.chapters])

  const routePositions = activeRoute?.walkingRoute?.geometry
    ?? activeRoute?.chapters.map((chapter) => [chapter.lat, chapter.lng] as [number, number])
    ?? []

  return (
    <div className="absolute inset-0 overflow-hidden">
      <MapLibreMap
        ref={mapRef}
        initialViewState={{ latitude: MAP_CENTER[0], longitude: MAP_CENTER[1], zoom: MAP_DEFAULT_ZOOM }}
        mapStyle={MAP_STYLE_URL}
        maxZoom={MAP_MAX_ZOOM}
        attributionControl={MAP_ATTRIBUTION_CONTROL}
        interactiveLayerIds={showLandmarks ? [LANDMARK_CLUSTER_LAYER_ID, LANDMARK_CLUSTER_DOT_LAYER_ID] : []}
        onLoad={handleMapLoad}
        onMoveEnd={publishViewport}
        onClick={handleMapClick}
        reuseMaps
        style={{ width: '100%', height: '100%' }}
      >
        {showLandmarks && <LandmarkClusterLayer entries={clustered} />}

        {showLandmarks && prominent.map(({ landmark, variant }) => (
          <LandmarkMarker
            key={landmark.id}
            landmark={landmark}
            variant={variant}
            isSelected={landmark.id === selectedLandmarkId}
            onSelect={onLandmarkSelect}
          />
        ))}

        {activeRoute && routePositions.length > 1 && (
          <Source id="active-tour-route" type="geojson" data={lineFeature(routePositions)}>
            <Layer id="active-tour-route-line" type="line" paint={{ 'line-color': colors.mapOrange, 'line-width': 3, 'line-opacity': 0.85, ...(activeRoute.walkingRoute ? {} : { 'line-dasharray': [2, 2] }) }} />
          </Source>
        )}

        {temporaryRoute && temporaryRoute.geometry.length > 1 && (
          <Source id="temporary-route" type="geojson" data={lineFeature(temporaryRoute.geometry)}>
            <Layer id="temporary-route-line" type="line" paint={{ 'line-color': '#245b9f', 'line-width': 4, 'line-opacity': 0.95 }} />
          </Source>
        )}

        {activeRoute?.chapters.map((chapter, index) => (
          <ChapterMarker
            key={chapter.id}
            chapter={chapter}
            stopNumber={index + 1}
            isSelected={chapter.id === selectedChapterId}
            onSelect={(selected: NarrativeChapter) => onChapterSelect?.(selected)}
          />
        ))}
      </MapLibreMap>

      {isLoading && showLandmarks && (
        <div className="pointer-events-none absolute left-4 top-[max(5rem,env(safe-area-inset-top))] z-20 rounded-full border border-outline-variant/40 bg-surface/90 px-3 py-1.5 text-xs text-on-surface/70 shadow backdrop-blur">●</div>
      )}
      <MapZoomHint zoom={viewport.zoom} showAllBuildings={showAllBuildings} />
    </div>
  )
}
