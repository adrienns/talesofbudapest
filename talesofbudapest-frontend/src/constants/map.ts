import type { MapCenter } from '@/types/map'

export const MAP_CENTER: MapCenter = [47.4979, 19.0402]

export const MAP_DEFAULT_ZOOM = 13

export const MAP_MAX_ZOOM = 18

export const MAP_TILE_URL =
  'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'

export const MAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'

export const MAP_TILE_OPTIONS = {
  maxZoom: MAP_MAX_ZOOM,
  updateWhenIdle: true,
  keepBuffer: 2,
} as const
