const BASE_URL = 'https://budapest100.hu'
const USER_AGENT =
  'TalesOfBudapest/1.0 (local dev; contact: budapest100@kek.org.hu)'

export const buildHouseUrl = (slug: string): string => `${BASE_URL}/house/${slug}/`

export const extractSlugFromUrl = (url: string): string | null => {
  const match = url.match(/\/house\/([^/?#]+)/i)
  return match?.[1] ?? null
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

export { USER_AGENT }
