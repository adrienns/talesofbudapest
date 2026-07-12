import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { LandmarkSeed } from '../types/landmark.js'
import { buildUpsertSql } from './buildUpsertSql.js'

const execFileAsync = promisify(execFile)

export type DockerUpsertResult = {
  id: string
  name: string
  inserted: boolean
}

export const upsertLandmarkDocker = async (
  container: string,
  seed: LandmarkSeed,
): Promise<DockerUpsertResult> => {
  const sql = buildUpsertSql(seed)
  const { stdout } = await execFileAsync('docker', [
    'exec',
    container,
    'psql',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-t',
    '-A',
    '-F',
    '|',
    '-c',
    sql,
  ])

  const line = stdout
    .trim()
    .split('\n')
    .find((value) => value.includes('|'))

  if (!line) {
    throw new Error(`Unexpected psql output for ${seed.name}: ${stdout}`)
  }

  const [id, name, inserted] = line.split('|')

  return {
    id,
    name,
    inserted: inserted === 't',
  }
}
