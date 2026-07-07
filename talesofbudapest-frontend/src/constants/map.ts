import type { MapCenter } from '@/types/map'

export const MAP_CENTER: MapCenter = [47.4979, 19.0402]

export const MAP_DEFAULT_ZOOM = 14

/** Standard OpenStreetMap raster tiles — no third-party style layers. */
export const MAP_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

export const MAP_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
