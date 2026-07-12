#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeJson } from '../export/writeJson.js'
import { pollOpenCommonsCategory } from '../sources/wikimedia/pollCommonsCategory.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_CATEGORY = 'Budapest'
const DEFAULT_LIMIT = 100
const DEFAULT_USER_AGENT = 'TalesOfBudapest/1.0 (open-media poller; contact: data@talesofbudapest.app)'

const optionValue = (args: string[], name: string): string | undefined => {
  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}

const main = async (): Promise<void> => {
  const args = process.argv.slice(2)
  const category = optionValue(args, '--category') ?? DEFAULT_CATEGORY
  const limit = Number(optionValue(args, '--limit') ?? DEFAULT_LIMIT)
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new Error('--limit must be an integer between 1 and 500')
  }

  const continuation = optionValue(args, '--continue')
  const output = optionValue(args, '--output')
    ? path.resolve(optionValue(args, '--output')!)
    : path.join(__dirname, `../../output/open/commons_${category.replace(/[^a-z0-9]+/gi, '_')}.json`)

  if (args.includes('--dry-run')) {
    console.log(`Would poll Category:${category}, retaining only Public Domain, CC0, CC BY, and CC BY-SA files.`)
    console.log(`Would write the result to ${output}`)
    return
  }

  const { records, continuation: nextContinuation } = await pollOpenCommonsCategory({
    category,
    limit,
    continuation,
    userAgent: process.env.OPEN_DATA_USER_AGENT ?? DEFAULT_USER_AGENT,
  })
  await writeJson(output, {
    source: 'wikimedia-commons',
    category,
    retainedLicenses: ['Public Domain', 'CC0', 'CC BY', 'CC BY-SA'],
    retrievedAt: new Date().toISOString(),
    nextContinuation,
    records,
  })

  console.log(`Wrote ${records.length} open-licensed Commons files to ${output}`)
  console.log(nextContinuation ? `Next page: --continue ${nextContinuation}` : 'No next page.')
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Open Commons poll failed: ${message}`)
  process.exit(1)
})
