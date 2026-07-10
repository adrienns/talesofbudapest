import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import axios from 'axios'
import type { MekBook } from './books.js'

export type MekManifestFile = {
  mekId: string
  title: string
  sourceUrl: string
  originalUrl: string
  localPath: string
  sha256: string
  bytes: number
  fetchedAt: string
  license: MekBook['license']
}

const assertPdf = (data: Buffer, url: string): void => {
  if (!data.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new Error(`Expected a PDF from ${url}, but the response was not a PDF`)
  }
}

const filenameFor = (book: MekBook, label: string): string =>
  `${book.mekId.toLowerCase()}_${label}.pdf`

export const downloadMekPdf = async (options: {
  book: MekBook
  pdf: MekBook['pdfs'][number]
  corpusRoot: string
  userAgent: string
}): Promise<MekManifestFile> => {
  const response = await axios.get<ArrayBuffer>(options.pdf.url, {
    responseType: 'arraybuffer',
    headers: { 'User-Agent': options.userAgent, Accept: 'application/pdf' },
    timeout: 120_000,
    maxContentLength: 200 * 1024 * 1024,
  })
  const data = Buffer.from(response.data)
  assertPdf(data, options.pdf.url)

  const targetDirectory = path.join(options.corpusRoot, 'mek', 'raw')
  const targetPath = path.join(targetDirectory, filenameFor(options.book, options.pdf.label))
  await fs.mkdir(targetDirectory, { recursive: true })
  await fs.writeFile(targetPath, data)

  return {
    mekId: options.book.mekId,
    title: options.book.title,
    sourceUrl: options.book.sourceUrl,
    originalUrl: options.pdf.url,
    localPath: path.relative(options.corpusRoot, targetPath),
    sha256: createHash('sha256').update(data).digest('hex'),
    bytes: data.byteLength,
    fetchedAt: new Date().toISOString(),
    license: options.book.license,
  }
}
