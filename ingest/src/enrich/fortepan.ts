const FORTEPAN_SEARCH_BASE = 'https://fortepan.hu/hu/photos/'

export const buildFortepanSearchUrl = (address: string): string => {
  const params = new URLSearchParams({ q: address })
  return `${FORTEPAN_SEARCH_BASE}?${params.toString()}`
}

export const fetchFortepanImages = async (_address: string): Promise<string[]> => {
  return []
}
