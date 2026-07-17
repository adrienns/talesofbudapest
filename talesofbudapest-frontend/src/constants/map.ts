import type { MapCenter } from '@/types/map'

export const MAP_CENTER: MapCenter = [47.4979, 19.0402]

export const MAP_DEFAULT_ZOOM = 13

export const MAP_MAX_ZOOM = 18

export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/bright'

export const MAP_ROUTE_ATTRIBUTION =
  'Routes &copy; <a href="https://openrouteservice.org">openrouteservice.org</a> by HeiGIT'

export const MAP_ATTRIBUTION_CONTROL = {
  compact: true,
  customAttribution: MAP_ROUTE_ATTRIBUTION,
} as const
