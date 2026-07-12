#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { upsertLandmarkDocker } from '../lib/upsertLandmarkDocker.js'
import { upsertLandmarkPg } from '../lib/upsertLandmarkPg.js'
import { getSupabase } from '../lib/supabaseClient.js'
import { upsertLandmark } from '../lib/upsertLandmark.js'
import { toLandmarkSeed } from '../mappers/toLandmarkSeed.js'
import type { ImportanceTier } from '../scorers/historicalImportance.js'
import type { Budapest100MapAnchor } from '../types/mapAnchor.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const defaultInput = path.join(__dirname, '../../output/budapest100_map_anchors.json')

type CliOptions = {
  input: string
  minTier: ImportanceTier
  dryRun: boolean
  dockerContainer: string | null
}

const TIER_RANK: Record<ImportanceTier, number> = {
  featured: 3,
  standard: 2,
  archive: 1,
  skip: 0,
}

const meetsMinTier = (tier: ImportanceTier, minTier: ImportanceTier): boolean =>
  TIER_RANK[tier] >= TIER_RANK[minTier]

const parseArgs = (argv: string[]): CliOptions => {
  const options: CliOptions = {
    input: defaultInput,
    minTier: 'standard',
    dryRun: false,
    dockerContainer: process.env.SUPABASE_DB_CONTAINER ?? 'supabase-db',
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--input' && argv[index + 1]) {
      options.input = path.resolve(argv[index + 1])
      index += 1
      continue
    }

    if (arg === '--min-tier' && argv[index + 1]) {
      options.minTier = argv[index + 1] as ImportanceTier
      index += 1
      continue
    }

    if (arg === '--dry-run') {
      options.dryRun = true
      continue
    }

    if (arg === '--docker-container' && argv[index + 1]) {
      options.dockerContainer = argv[index + 1]
      index += 1
    }
  }

  return options
}

const main = async () => {
  const options = parseArgs(process.argv.slice(2))
  const raw = await fs.readFile(options.input, 'utf8')
  const anchors = JSON.parse(raw) as Budapest100MapAnchor[]

  const eligible = anchors.filter(
    (anchor) =>
      anchor.geocodeStatus === 'ok' && meetsMinTier(anchor.importanceTier, options.minTier),
  )

  const seeds = eligible.flatMap((anchor) => {
    const seed = toLandmarkSeed(anchor)
    return seed ? [seed] : []
  })

  console.log(
    `Loading ${seeds.length} landmarks (tier >= ${options.minTier}, geocoded) from ${options.input}`,
  )

  if (options.dryRun) {
    for (const seed of seeds) {
      console.log(`  [dry-run] ${seed.name} (${seed.lat}, ${seed.lng})`)
    }
    return
  }

  const databaseUrl = process.env.DATABASE_URL
  let inserted = 0
  let updated = 0

  if (options.dockerContainer) {
    for (const seed of seeds) {
      const result = await upsertLandmarkDocker(options.dockerContainer, seed)
      if (result.inserted) {
        inserted += 1
        console.log(`  inserted: ${result.name}`)
      } else {
        updated += 1
        console.log(`  updated: ${result.name}`)
      }
    }
  } else if (databaseUrl) {
    const pool = new pg.Pool({ connectionString: databaseUrl })

    try {
      for (const seed of seeds) {
        const result = await upsertLandmarkPg(pool, seed)
        if (result.inserted) {
          inserted += 1
          console.log(`  inserted: ${result.name}`)
        } else {
          updated += 1
          console.log(`  updated: ${result.name}`)
        }
      }
    } finally {
      await pool.end()
    }
  } else {
    const supabase = getSupabase()

    for (const seed of seeds) {
      const { data: existing } = await supabase
        .from('locations')
        .select('id')
        .eq('name', seed.name)
        .maybeSingle()

      const result = await upsertLandmark(supabase, seed)
      if (existing) {
        updated += 1
        console.log(`  updated: ${result.name}`)
      } else {
        inserted += 1
        console.log(`  inserted: ${result.name}`)
      }
    }
  }

  console.log(`Done. ${inserted} inserted, ${updated} updated.`)
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Load failed: ${message}`)
  process.exit(1)
})
