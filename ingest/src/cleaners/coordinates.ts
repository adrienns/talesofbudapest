const DMS_PATTERN =
  /N\s*(\d+)\s*°\s*([\d,]+)'\s*[^E]*E\s*(\d+)\s*°\s*([\d,]+)'/i

const parseDmsPart = (degrees: string, minutes: string): number =>
  Number(degrees) + Number(minutes.replace(',', '.')) / 60

export const parseHungarianCoordinateString = (
  value: string,
): { lat: number; lng: number } | null => {
  const match = value.match(DMS_PATTERN)
  if (!match) {
    return null
  }

  const lat = parseDmsPart(match[1], match[2])
  const lng = parseDmsPart(match[3], match[4])

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null
  }

  return { lat, lng }
}
