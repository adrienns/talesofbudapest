#!/usr/bin/env node
import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { readJson } from '../export/readJson.js'
import type { Budapest100MapAnchor } from '../types/mapAnchor.js'
import type { MuemlekemAnchor } from '../sources/muemlekem/ingestMuemlekem.js'
import type { ImportanceTier } from '../types/landmark.js'

const execFileAsync = promisify(execFile)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outputDir = path.join(__dirname, '../../output')
const BATCH_SIZE = 200

const escapeSql = (value: string): string => value.replace(/'/g, "''")

const runSqlDocker = async (container: string, sql: string): Promise<void> => {
  await execFileAsync('docker', [
    'exec',
    '-i',
    container,
    'psql',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    sql,
  ])
}

const buildBatchSql = (
  rows: Array<{ source: string; external_id: string; tier: ImportanceTier; score: number }>,
): string => {
  const values = rows
    .map(
      (row) =>
        `('${escapeSql(row.source)}', '${escapeSql(row.external_id)}', '${row.tier}', ${row.score})`,
    )
    .join(',\n  ')

  return `
update public.locations as l
set
  importance_tier = v.tier,
  importance_score = v.score
from (values
  ${values}
) as v(source, external_id, tier, score)
where l.source = v.source
  and l.external_id = v.external_id;
`.trim()
}

const backfillDocker = async (container: string) => {
  const budapest100 =
    (await readJson<Budapest100MapAnchor[]>(
      path.join(outputDir, 'budapest100_map_anchors.json'),
    )) ?? []
  const muemlekem =
    (await readJson<MuemlekemAnchor[]>(path.join(outputDir, 'muemlekem_anchors.json'))) ?? []

  const rows = [
    ...budapest100.map((anchor) => ({
      source: 'budapest100',
      external_id: anchor.slug,
      tier: anchor.importanceTier,
      score: anchor.importanceScore,
    })),
    ...muemlekem.map((anchor) => ({
      source: 'muemlekem',
      external_id: anchor.external_id,
      tier: anchor.importanceTier,
      score: anchor.importanceScore,
    })),
  ]

  let batches = 0
  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    const batch = rows.slice(index, index + BATCH_SIZE)
    await runSqlDocker(container, buildBatchSql(batch))
    batches += 1
  }

  console.log(
    `Backfill complete via docker (${container}). ${rows.length} anchors in ${batches} batch(es): ${budapest100.length} budapest100 + ${muemlekem.length} muemlekem.`,
  )
}

const main = async () => {
  const container = process.env.SUPABASE_DB_CONTAINER ?? 'supabase-db'
  await backfillDocker(container)
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Backfill failed: ${message}`)
  process.exit(1)
})
