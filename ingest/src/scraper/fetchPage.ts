import axios from 'axios'
import { sleep, USER_AGENT } from './constants.js'

const MAX_RETRIES = 3

export const fetchPage = async (url: string): Promise<string> => {
  let lastError: unknown

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await axios.get<string>(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html',
        },
        responseType: 'text',
        timeout: 30_000,
        validateStatus: (status) => status >= 200 && status < 300,
      })

      return response.data
    } catch (error) {
      lastError = error
      if (attempt < MAX_RETRIES) {
        await sleep(1500 * attempt)
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}
