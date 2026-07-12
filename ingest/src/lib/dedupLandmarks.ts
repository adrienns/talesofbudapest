import type { LandmarkSeed, LandmarkSource } from '../types/landmark.js'
import { SOURCE_PRIORITY } from '../types/landmark.js'

export type DedupReportEntry = {
  skipped: LandmarkSeed
  kept: LandmarkSeed
  reason: 'proximity' | 'name_match'
  distanceMeters: number
}

const EARTH_RADIUS_M = 6_371_000

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180

export const haversineMeters = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number => {
  const dLat = toRadians(lat2 - lat1)
  const dLng = toRadians(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2

  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a))
}

const normalizeName = (name: string): string =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9áéíóöőúüű\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const namesLikelySame = (a: string, b: string): boolean => {
  const left = normalizeName(a)
  const right = normalizeName(b)
  if (!left || !right) {
    return false
  }

  if (left === right) {
    return true
  }

  if (left.includes(right) || right.includes(left)) {
    return true
  }

  const leftTokens = new Set(left.split(' ').filter((token) => token.length > 3))
  const rightTokens = new Set(right.split(' ').filter((token) => token.length > 3))
  let overlap = 0

  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap += 1
    }
  }

  return overlap >= 2
}

const shouldReplace = (existing: LandmarkSeed, candidate: LandmarkSeed): boolean =>
  SOURCE_PRIORITY[candidate.source as LandmarkSource] >
  SOURCE_PRIORITY[existing.source as LandmarkSource]

export const deduplicateLandmarkSeeds = (
  seeds: LandmarkSeed[],
  maxDistanceMeters = 75,
): { seeds: LandmarkSeed[]; report: DedupReportEntry[] } => {
  const accepted: LandmarkSeed[] = []
  const report: DedupReportEntry[] = []

  const sorted = [...seeds].sort(
    (a, b) => SOURCE_PRIORITY[b.source] - SOURCE_PRIORITY[a.source],
  )

  for (const candidate of sorted) {
    let merged = false

    for (let index = 0; index < accepted.length; index += 1) {
      const existing = accepted[index]
      const distance = haversineMeters(candidate.lat, candidate.lng, existing.lat, existing.lng)
      const samePlace =
        distance <= maxDistanceMeters ||
        (distance <= 150 && namesLikelySame(candidate.name, existing.name))

      if (!samePlace) {
        continue
      }

      if (shouldReplace(existing, candidate)) {
        report.push({
          skipped: existing,
          kept: candidate,
          reason: distance <= maxDistanceMeters ? 'proximity' : 'name_match',
          distanceMeters: Math.round(distance),
        })
        accepted[index] = {
          ...candidate,
          images: mergeImages(candidate.images, existing.images),
          image_url: candidate.image_url ?? existing.image_url,
        }
      } else {
        report.push({
          skipped: candidate,
          kept: existing,
          reason: distance <= maxDistanceMeters ? 'proximity' : 'name_match',
          distanceMeters: Math.round(distance),
        })
        accepted[index] = {
          ...existing,
          images: mergeImages(existing.images, candidate.images),
          image_url: existing.image_url ?? candidate.image_url,
        }
      }

      merged = true
      break
    }

    if (!merged) {
      accepted.push(candidate)
    }
  }

  return { seeds: accepted, report }
}

const mergeImages = (
  primary: LandmarkSeed['images'],
  secondary: LandmarkSeed['images'],
): LandmarkSeed['images'] => {
  const seen = new Set<string>()
  const merged: LandmarkSeed['images'] = []

  for (const image of [...primary, ...secondary]) {
    if (!seen.has(image.url)) {
      seen.add(image.url)
      merged.push(image)
    }
  }

  return merged
}
