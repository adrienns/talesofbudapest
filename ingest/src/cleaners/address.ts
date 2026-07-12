const STREET_SUFFIX_PATTERN =
  /\b(utca|út|u\.|tér|krt\.|körút|köz|sétány|fasor|rakpart|sor)\b/i

const HOUSE_NUMBER_PATTERN = /^\d+[a-zA-Z]?\.?$/

const slugPartToWord = (part: string): string => {
  if (HOUSE_NUMBER_PATTERN.test(part)) {
    return part.replace(/\.$/, '') + '.'
  }

  if (STREET_SUFFIX_PATTERN.test(part)) {
    const normalized = part.toLowerCase()
    if (normalized === 'utca') return 'utca'
    if (normalized === 'ut') return 'út'
    if (normalized === 'u') return 'u.'
    if (normalized === 'ter') return 'tér'
    if (normalized === 'krt') return 'krt.'
    if (normalized === 'korut') return 'körút'
    if (normalized === 'koz') return 'köz'
    if (normalized === 'setany') return 'sétány'
    if (normalized === 'fasor') return 'fasor'
    if (normalized === 'rakpart') return 'rakpart'
    if (normalized === 'sor') return 'sor'
    return part
  }

  return part.charAt(0).toUpperCase() + part.slice(1)
}

export const slugToAddress = (slug: string): string => {
  const parts = slug.split('-').filter(Boolean)
  if (parts.length === 0) {
    return ''
  }

  const words = parts.map(slugPartToWord)
  return words.join(' ')
}

const ADDRESS_FROM_HEADING_PATTERN =
  /^(.+?\s+(?:utca|út|u\.|tér|körút|krt\.|köz|sétány|fasor|rakpart|sor)\s+\d+\.?)/i

export const extractAddressFromHeading = (heading: string): string | null => {
  const match = heading.match(ADDRESS_FROM_HEADING_PATTERN)
  if (!match) {
    return null
  }

  const address = match[1].trim()
  return address.endsWith('.') ? address : `${address}.`
}

export const normalizeAddress = (slug: string, heading: string): string => {
  const fromHeading = extractAddressFromHeading(heading)
  if (fromHeading) {
    return fromHeading
  }

  const fromSlug = slugToAddress(slug)
  return fromSlug.endsWith('.') ? fromSlug : `${fromSlug}.`
}
