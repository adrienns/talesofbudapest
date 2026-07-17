'use client'

import { useMemo } from 'react'
import { Layer, Source } from '@vis.gl/react-maplibre'
import { colors } from '@/constants/designTokens'
import { CLUSTER_MAX_ZOOM } from '@/lib/map/visibleLandmarks'
import { resolveMarkerTheme } from '@/components/map/MapMarkerVisual'
import type { VisibleLandmarkEntry } from '@/lib/map/visibleLandmarks'

export const LANDMARK_CLUSTER_SOURCE_ID = 'landmark-cluster-source'
export const LANDMARK_CLUSTER_LAYER_ID = 'landmark-clusters'
export const LANDMARK_CLUSTER_DOT_LAYER_ID = 'landmark-cluster-dots'

type LandmarkClusterLayerProps = {
  entries: VisibleLandmarkEntry[]
}

export const LandmarkClusterLayer = ({ entries }: LandmarkClusterLayerProps) => {
  const data = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: entries.map(({ landmark }) => ({
      type: 'Feature' as const,
      properties: {
        id: landmark.id,
        theme: resolveMarkerTheme(landmark),
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [landmark.lng, landmark.lat] as [number, number],
      },
    })),
  }), [entries])

  return (
    <Source
      id={LANDMARK_CLUSTER_SOURCE_ID}
      type="geojson"
      data={data}
      cluster
      clusterRadius={56}
      clusterMaxZoom={CLUSTER_MAX_ZOOM}
      clusterMinPoints={2}
      clusterProperties={{
        history_count: ['+', ['case', ['==', ['get', 'theme'], 'history'], 1, 0]],
      }}
    >
      <Layer
        id={LANDMARK_CLUSTER_LAYER_ID}
        type="circle"
        source={LANDMARK_CLUSTER_SOURCE_ID}
        filter={['has', 'point_count']}
        paint={{
          'circle-color': [
            'case',
            ['>', ['*', ['get', 'history_count'], 2], ['get', 'point_count']],
            colors.mapOrange,
            colors.mapTeal,
          ],
          'circle-radius': 20,
          'circle-stroke-color': '#fffaf3',
          'circle-stroke-width': 2,
          'circle-opacity': 0.98,
        }}
      />
      <Layer
        id={`${LANDMARK_CLUSTER_LAYER_ID}-count`}
        type="symbol"
        source={LANDMARK_CLUSTER_SOURCE_ID}
        filter={['has', 'point_count']}
        layout={{
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['Noto Sans Bold'],
          'text-size': 12,
          'text-allow-overlap': true,
        }}
        paint={{ 'text-color': '#fffaf3' }}
      />
      <Layer
        id={LANDMARK_CLUSTER_DOT_LAYER_ID}
        type="circle"
        source={LANDMARK_CLUSTER_SOURCE_ID}
        filter={['!', ['has', 'point_count']]}
        paint={{
          'circle-color': ['match', ['get', 'theme'], 'history', colors.mapOrange, colors.mapTeal],
          'circle-radius': 5,
          'circle-stroke-color': '#fffaf3',
          'circle-stroke-width': 2,
        }}
      />
    </Source>
  )
}
