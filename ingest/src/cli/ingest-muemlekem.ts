#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readJson } from '../export/readJson.js'
import { writeJson } from '../export/writeJson.js'
import {
  ingestMuemlekemCity,
  type MuemlekemAnchor,
} from '../sources/muemlekem/ingestMuemlekem.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const defaultOutput = path.join(__dirname, '../../output/muemlekem_anchors.json')

type CliOptions = {
  city: string
  maxItems: number
  geocode: boolean
  fetchDelayMs: number
  append: boolean
  output: string
}

const parseArgs = (argv: string[]): CliOptions => {
  const options: CliOptions = {
    city: 'Budapest',
    maxItems: 0,
    geocode: true,
    fetchDelayMs: 1200,
    append: false,
    output: defaultOutput,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--city' && argv[index + 1]) {
      options.city = argv[index + 1]
      index += 1
      continue
    }

    if (arg === '--max-items' && argv[index + 1]) {
      options.maxItems = Number(argv[index + 1])
      index += 1
      continue
    }

    if (arg === '--fetch-delay-ms' && argv[index + 1]) {
      options.fetchDelayMs = Number(argv[index + 1])
      index += 1
      continue
    }

    if (arg === '--output' && argv[index + 1]) {
      options.output = path.resolve(argv[index + 1])
      index += 1
      continue
    }

    if (arg === '--append') {
      options.append = true
    }

    if (arg === '--no-geocode') {
      options.geocode = false
    }
  }

  return options
}

const mergeAnchors = (
  existing: MuemlekemAnchor[],
  scraped: MuemlekemAnchor[],
): MuemlekemAnchor[] => {
  const byId = new Map<string, MuemlekemAnchor>()
  for (const anchor of existing) {
    byId.set(anchor.external_id, anchor)
  }
  for (const anchor of scraped) {
    byId.set(anchor.external_id, anchor)
  }
  return [...byId.values()].sort((a, b) => b.importanceScore - a.importanceScore)
}

const main = async () => {
  const options = parseArgs(process.argv.slice(2))
  const existing = options.append ? await readJson<MuemlekemAnchor[]>(options.output) : null
  const existingAnchors = existing ?? []
  const existingIds = new Set(existingAnchors.map((anchor) => anchor.external_id))

  console.log(
    `Ingesting Műemlékem monuments for ${options.city}${existingIds.size > 0 ? ` (${existingIds.size} already scraped)` : ''}...`,
  )

  let checkpointAnchors = [...existingAnchors]

  const scraped = await ingestMuemlekemCity({
    city: options.city,
    maxItems: options.maxItems,
    geocode: options.geocode,
    fetchDelayMs: options.fetchDelayMs,
    existingIds,
    onProgress: (current: number, total: number, name: string) => {
      console.log(`[${current}/${total}] ${name}`)
    },
    onCheckpoint: async (batch) => {
      checkpointAnchors = mergeAnchors(existingAnchors, batch)
      await writeJson(options.output, checkpointAnchors)
      console.log(`  checkpoint: ${checkpointAnchors.length} anchors saved`)
    },
  })

  const anchors = mergeAnchors(existingAnchors, scraped)
  await writeJson(options.output, anchors)

  const loadable = anchors.filter(
    (anchor) => anchor.importanceTier !== 'skip' && anchor.geocodeStatus === 'ok',
  )
  console.log(`Wrote ${anchors.length} anchors (${loadable.length} loadable) to ${options.output}`)
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Műemlékem ingest failed: ${message}`)
  process.exit(1)
})
