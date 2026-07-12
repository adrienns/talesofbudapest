#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runScrapePipeline } from '../pipeline/scrapePipeline.js'
import type { ImportanceTier } from '../scorers/historicalImportance.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const defaultOutput = path.join(__dirname, '../../output/budapest100_map_anchors.json')
const defaultSeedsOutput = path.join(__dirname, '../../output/landmark_seeds.json')

type CliOptions = {
  seeds: string[]
  maxPages: number
  fetchDelayMs: number
  geocodeDelayMs: number
  geocode: boolean
  fortepan: boolean
  minTier: ImportanceTier
  sitemapSeeds: number
  append: boolean
  refreshExisting: boolean
  output: string
  seedsOutput: string
}

const parseArgs = (argv: string[]): CliOptions => {
  const options: CliOptions = {
    seeds: ['csalogany-utca-55'],
    maxPages: 10,
    fetchDelayMs: 1000,
    geocodeDelayMs: 1100,
    geocode: false,
    fortepan: false,
    minTier: 'standard',
    sitemapSeeds: 0,
    append: false,
    refreshExisting: false,
    output: defaultOutput,
    seedsOutput: defaultSeedsOutput,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--seed' && argv[index + 1]) {
      options.seeds = argv[index + 1].split(',').map((value) => value.trim()).filter(Boolean)
      index += 1
      continue
    }

    if (arg === '--max-pages' && argv[index + 1]) {
      options.maxPages = Number(argv[index + 1])
      index += 1
      continue
    }

    if ((arg === '--fetch-delay-ms' || arg === '--delay-ms') && argv[index + 1]) {
      options.fetchDelayMs = Number(argv[index + 1])
      index += 1
      continue
    }

    if (arg === '--geocode-delay-ms' && argv[index + 1]) {
      options.geocodeDelayMs = Number(argv[index + 1])
      index += 1
      continue
    }

    if (arg === '--min-tier' && argv[index + 1]) {
      options.minTier = argv[index + 1] as ImportanceTier
      index += 1
      continue
    }

    if (arg === '--sitemap-seeds' && argv[index + 1]) {
      options.sitemapSeeds = Number(argv[index + 1])
      index += 1
      continue
    }

    if (arg === '--append') {
      options.append = true
      continue
    }

    if (arg === '--refresh-existing') {
      options.refreshExisting = true
    }

    if (arg === '--output' && argv[index + 1]) {
      options.output = path.resolve(argv[index + 1])
      index += 1
      continue
    }

    if (arg === '--seeds-output' && argv[index + 1]) {
      options.seedsOutput = path.resolve(argv[index + 1])
      index += 1
      continue
    }

    if (arg === '--geocode') {
      options.geocode = true
    }

    if (arg === '--fortepan') {
      options.fortepan = true
    }
  }

  return options
}

const main = async () => {
  const options = parseArgs(process.argv.slice(2))

  await runScrapePipeline({
    seeds: options.seeds,
    maxPages: options.maxPages,
    fetchDelayMs: options.fetchDelayMs,
    geocodeDelayMs: options.geocodeDelayMs,
    geocode: options.geocode,
    fortepan: options.fortepan,
    minTier: options.minTier,
    sitemapSeeds: options.sitemapSeeds,
    append: options.append,
    refreshExisting: options.refreshExisting,
    output: options.output,
    seedsOutput: options.seedsOutput,
  })
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Scrape failed: ${message}`)
  process.exit(1)
})
