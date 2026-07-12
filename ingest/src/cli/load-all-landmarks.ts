#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readJson } from '../export/readJson.js'
import { writeJson } from '../export/writeJson.js'
import { deduplicateLandmarkSeeds } from '../lib/dedupLandmarks.js'
import { upsertLandmarkDocker } from '../lib/upsertLandmarkDocker.js'
import { toLandmarkSeed } from '../mappers/toLandmarkSeed.js'
import { toMuemlekemLandmarkSeed } from '../sources/muemlekem/ingestMuemlekem.js'
import type { ImportanceTier } from '../scorers/historicalImportance.js'
import type { Budapest100MapAnchor } from '../types/mapAnchor.js'
import type { LandmarkSeed } from '../types/landmark.js'
import type { MuemlekemAnchor } from '../sources/muemlekem/ingestMuemlekem.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outputDir = path.join(__dirname, '../../output')

const TIER_RANK: Record<ImportanceTier, number> = {
  featured: 3,
  standard: 2,
  archive: 1,
  skip: 0,
}

const meetsMinTier = (tier: ImportanceTier, minTier: ImportanceTier): boolean =>
  TIER_RANK[tier] >= TIER_RANK[minTier]

const loadWikipediaSeeds = async (): Promise<LandmarkSeed[]> => {
  const seeds = await readJson<LandmarkSeed[]>(path.join(outputDir, 'wikipedia_landmarks.json'))
  return seeds ?? []
}

const loadMuemlekemSeeds = async (minTier: ImportanceTier): Promise<LandmarkSeed[]> => {
  const anchors = await readJson<MuemlekemAnchor[]>(path.join(outputDir, 'muemlekem_anchors.json'))
  if (!anchors) {
    return []
  }

  return anchors
    .filter(
      (anchor) => anchor.geocodeStatus === 'ok' && meetsMinTier(anchor.importanceTier, minTier),
    )
    .flatMap((anchor) => {
      const seed = toMuemlekemLandmarkSeed(anchor)
      return seed ? [seed] : []
    })
}

const loadBudapest100Seeds = async (minTier: ImportanceTier): Promise<LandmarkSeed[]> => {
  const anchors = await readJson<Budapest100MapAnchor[]>(
    path.join(outputDir, 'budapest100_map_anchors.json'),
  )
  if (!anchors) {
    return []
  }

  return anchors
    .filter(
      (anchor) => anchor.geocodeStatus === 'ok' && meetsMinTier(anchor.importanceTier, minTier),
    )
    .flatMap((anchor) => {
      const seed = toLandmarkSeed(anchor)
      return seed ? [seed] : []
    })
}

const main = async () => {
  const dryRun = process.argv.includes('--dry-run')
  const minTier = (process.argv.includes('--min-tier')
    ? process.argv[process.argv.indexOf('--min-tier') + 1]
    : 'standard') as ImportanceTier
  const dockerContainer = process.env.SUPABASE_DB_CONTAINER ?? 'supabase-db'

  const wikipedia = await loadWikipediaSeeds()
  const muemlekem = await loadMuemlekemSeeds(minTier)
  const budapest100 = await loadBudapest100Seeds(minTier)

  const combined = [...wikipedia, ...muemlekem, ...budapest100]
  const { seeds, report } = deduplicateLandmarkSeeds(combined)

  await writeJson(path.join(outputDir, 'dedup_report.json'), report)

  console.log(
    `Prepared ${seeds.length} landmarks after dedup (from ${combined.length}: wiki ${wikipedia.length}, muemlekem ${muemlekem.length}, b100 ${budapest100.length})`,
  )
  console.log(`Skipped ${report.length} duplicates`)

  if (dryRun) {
    for (const seed of seeds) {
      console.log(`  [dry-run] [${seed.source}] ${seed.name}`)
    }
    return
  }

  let inserted = 0
  let updated = 0

  for (const seed of seeds) {
    const result = await upsertLandmarkDocker(dockerContainer, seed)
    if (result.inserted) {
      inserted += 1
      console.log(`  inserted [${seed.source}]: ${result.name}`)
    } else {
      updated += 1
      console.log(`  updated [${seed.source}]: ${result.name}`)
    }
  }

  console.log(`Done. ${inserted} inserted, ${updated} updated.`)
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Load all failed: ${message}`)
  process.exit(1)
})
