import type { Budapest100RawHouse } from './budapest100.js'
import type { ImportanceTier } from '../scorers/historicalImportance.js'

export type { LandmarkSeed, LandmarkSource, LandmarkType } from './landmark.js'

export type GeocodeStatus = 'ok' | 'failed' | 'skipped'

export type Budapest100MapAnchor = Budapest100RawHouse & {
  lat: number | null
  lng: number | null
  geocodeStatus: GeocodeStatus
  geocodeQuery: string
  fortepanImageUrls: string[]
  fortepanSearchUrl: string
  importanceScore: number
  importanceTier: ImportanceTier
  importanceReasons: string[]
}
