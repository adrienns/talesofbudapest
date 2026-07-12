import fs from 'node:fs/promises'
import path from 'node:path'

export const writeJson = async <T>(filePath: string, data: T): Promise<void> => {
  const directory = path.dirname(filePath)
  await fs.mkdir(directory, { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}
