#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeJson } from '../export/writeJson.js'
import { sleep } from '../scraper/constants.js'
import { BUDAPEST_LANDMARKS } from '../sources/wikipedia/curatedLandmarks.js'
import { buildWikidataLandmark } from '../sources/wikipedia/fetchWikidata.js'
import { toWikipediaLandmarkSeed } from '../sources/wikipedia/toLandmarkSeed.js'
import type { LandmarkSeed } from '../types/landmark.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const defaultOutput = path.join(__dirname, '../../output/wikipedia_landmarks.json')

const main = async () => {
  const output = process.argv.includes('--output')
    ? path.resolve(process.argv[process.argv.indexOf('--output') + 1])
    : defaultOutput

  const seeds: LandmarkSeed[] = []
  let skipped = 0

  for (const curated of BUDAPEST_LANDMARKS) {
    console.log(`Fetching ${curated.wikiTitle} (${curated.qId})...`)
    try {
      const landmark = await buildWikidataLandmark(curated.qId, curated.wikiTitle)
      if (!landmark) {
        skipped += 1
        console.warn(`  skipped: missing data`)
        continue
      }

      seeds.push(toWikipediaLandmarkSeed(landmark, curated))
      console.log(`  ok: ${landmark.name}`)
    } catch (error) {
      skipped += 1
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`  skipped: ${message}`)
    }

    await sleep(500)
  }

  await writeJson(output, seeds)
  console.log(`Wrote ${seeds.length} Wikipedia landmarks (${skipped} skipped) to ${output}`)
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Wikipedia ingest failed: ${message}`)
  process.exit(1)
})
