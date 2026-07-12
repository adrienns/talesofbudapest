#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeJson } from '../export/writeJson.js'
import {
  buildBudapestOpenPlacesQuery,
  pollBudapestOpenPlaces,
} from '../sources/wikidata/pollBudapest.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_LIMIT = 250
const DEFAULT_USER_AGENT = 'TalesOfBudapest/1.0 (open-data poller; contact: data@talesofbudapest.app)'

type Options = {
  dryRun: boolean
  limit: number
  offset: number
  modifiedSince?: string
  output: string
}

const readOption = (args: string[], name: string): string | undefined => {
  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}

const readPositiveInteger = (value: string | undefined, name: string, fallback: number): number => {
  if (value == null) {
    return fallback
  }
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`)
  }
  return parsed
}

const parseOptions = (args: string[]): Options => {
  const limit = readPositiveInteger(readOption(args, '--limit'), '--limit', DEFAULT_LIMIT)
  if (limit === 0 || limit > 500) {
    throw new Error('--limit must be between 1 and 500 to respect Wikidata Query Service limits')
  }

  const offset = readPositiveInteger(readOption(args, '--offset'), '--offset', 0)
  const modifiedSince = readOption(args, '--modified-since')
  if (modifiedSince && !/^\d{4}-\d{2}-\d{2}$/.test(modifiedSince)) {
    throw new Error('--modified-since must use YYYY-MM-DD')
  }

  const defaultOutput = path.join(
    __dirname,
    `../../output/open/wikidata_budapest_offset_${offset}.json`,
  )
  const outputValue = readOption(args, '--output')

  return {
    dryRun: args.includes('--dry-run'),
    limit,
    offset,
    modifiedSince,
    output: outputValue ? path.resolve(outputValue) : defaultOutput,
  }
}

const main = async (): Promise<void> => {
  const options = parseOptions(process.argv.slice(2))
  const queryOptions = {
    limit: options.limit,
    offset: options.offset,
    modifiedSince: options.modifiedSince,
  }

  if (options.dryRun) {
    console.log(buildBudapestOpenPlacesQuery(queryOptions))
    console.log(`Would write an open-data discovery batch to ${options.output}`)
    return
  }

  const { query, records } = await pollBudapestOpenPlaces({
    ...queryOptions,
    userAgent: process.env.OPEN_DATA_USER_AGENT ?? DEFAULT_USER_AGENT,
  })

  await writeJson(options.output, {
    source: 'wikidata',
    scope: 'Entities with coordinates within 15km of Budapest city centre',
    license: 'CC0-1.0',
    licenseEvidenceUrl: 'https://www.wikidata.org/wiki/Wikidata:Licensing',
    retrievedAt: new Date().toISOString(),
    query,
    records,
  })
  console.log(`Wrote ${records.length} CC0 Wikidata records to ${options.output}`)
  console.log('Discovery only: this command does not download Commons media or Wikipedia prose.')
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Open Wikidata poll failed: ${message}`)
  process.exit(1)
})
