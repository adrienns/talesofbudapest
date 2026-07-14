'use client'

import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet.markercluster'
import { createLandmarkDotIcon } from '@/components/map/createLandmarkIcon'
import { CLUSTER_MAX_ZOOM } from '@/lib/map/visibleLandmarks'
import type { VisibleLandmarkEntry } from '@/lib/map/visibleLandmarks'
import type { MapPin } from '@/types/landmark'

type ThemedMarker = L.Marker & { mapTheme?: 'history' | 'architecture' }

import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'

type LandmarkClusterLayerProps = {
  entries: VisibleLandmarkEntry[]
  rebuildKey: string
  onSelect: (landmark: MapPin) => void
}

export const LandmarkClusterLayer = ({ entries, rebuildKey, onSelect }: LandmarkClusterLayerProps) => {
  const map = useMap()
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  const entryKey = entries.map((entry) => entry.landmark.id).join(',')

  useEffect(() => {
    if (entries.length === 0) {
      return undefined
    }

    const cluster = L.markerClusterGroup({
      maxClusterRadius: 56,
      disableClusteringAtZoom: CLUSTER_MAX_ZOOM + 1,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      chunkedLoading: true,
      chunkInterval: 80,
      iconCreateFunction: (group) => {
        const count = group.getChildCount()
        const children = group.getAllChildMarkers() as ThemedMarker[]
        const historyCount = children.filter((marker) => marker.mapTheme === 'history').length
        const theme = historyCount > children.length / 2 ? 'history' : 'architecture'
        return L.divIcon({
          html: `<div class="landmark-cluster map-theme-${theme}"><span>${count}</span></div>`,
          className: 'landmark-cluster-icon',
          iconSize: [40, 40],
        })
      },
    })

    for (const entry of entries) {
      const theme = entry.landmark.map_theme
        ?? (['monument', 'statue', 'iconic'].includes(entry.landmark.landmark_type ?? '') ? 'history' : 'architecture')
      const marker = L.marker([entry.landmark.lat, entry.landmark.lng], {
        icon: createLandmarkDotIcon(false, theme),
      })
      ;(marker as ThemedMarker).mapTheme = theme
      marker.on('click', () => onSelectRef.current(entry.landmark))
      cluster.addLayer(marker)
    }

    map.addLayer(cluster)

    return () => {
      map.removeLayer(cluster)
    }
  }, [map, rebuildKey, entryKey])

  return null
}
