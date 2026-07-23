export const formatWalkDistance = (meters: number): string => {
  if (meters < 1000) {
    return `${Math.round(meters)} m`
  }

  return `${(meters / 1000).toFixed(1)} km`
}
