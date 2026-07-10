#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { findMekBook, MEK_BUDAPEST_BOOKS, type MekBook } from '../sources/mek/books.js'
import { downloadMekPdf, type MekManifestFile } from '../sources/mek/fetchMek.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_USER_AGENT = 'TalesOfBudapest/1.0 (local MEK corpus intake; https://github.com/talesofbudapest)'
const DEFAULT_CORPUS_ROOT = path.join(__dirname, '../../corpus')
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const optionValues = (args: string[], name: string): string[] =>
  args.flatMap((arg, index) => arg === name && args[index + 1] ? [args[index + 1]] : [])

const main = async (): Promise<void> => {
  const args = process.argv.slice(2)
  const requestedIds = optionValues(args, '--book')
  const books: MekBook[] = requestedIds.length === 0
    ? MEK_BUDAPEST_BOOKS
    : requestedIds.map((mekId) => {
      const book = findMekBook(mekId)
      if (!book) {
        throw new Error(`Unknown or non-green MEK title: ${mekId}`)
      }
      return book
    })
  const corpusRootValue = optionValues(args, '--corpus-root')[0]
  const corpusRoot = corpusRootValue ? path.resolve(corpusRootValue) : DEFAULT_CORPUS_ROOT
  const manifestPath = path.join(corpusRoot, 'mek', 'manifest.json')

  if (args.includes('--dry-run')) {
    for (const book of books) {
      for (const pdf of book.pdfs) {
        console.log(`${book.mekId} [${book.license.identifier}] ${pdf.url}`)
      }
    }
    console.log(`Would write originals under ${path.join(corpusRoot, 'mek', 'raw')}`)
    return
  }

  const files: MekManifestFile[] = []
  for (const book of books) {
    for (const pdf of book.pdfs) {
      console.log(`Downloading ${book.mekId} (${pdf.label})…`)
      const file = await downloadMekPdf({
        book,
        pdf,
        corpusRoot,
        userAgent: process.env.MEK_USER_AGENT ?? DEFAULT_USER_AGENT,
      })
      files.push(file)
      console.log(`  ${file.bytes.toLocaleString()} bytes, sha256 ${file.sha256}`)
      await sleep(2_000)
    }
  }

  await fs.mkdir(path.dirname(manifestPath), { recursive: true })
  await fs.writeFile(manifestPath, `${JSON.stringify({
    source: 'MEK / OSZK',
    fetchedAt: new Date().toISOString(),
    files,
  }, null, 2)}\n`, 'utf8')
  console.log(`Wrote manifest: ${manifestPath}`)
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`MEK fetch failed: ${message}`)
  process.exit(1)
})
