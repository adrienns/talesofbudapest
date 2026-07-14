import { NextResponse } from 'next/server'

type Point = { lat: number; lng: number }

const isPoint = (value: unknown): value is Point => {
  if (!value || typeof value !== 'object') return false
  const point = value as Point
  return Number.isFinite(point.lat) && Number.isFinite(point.lng)
    && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180
}

/** Server-side proxy keeps the ORS token out of the browser bundle. */
export const POST = async (request: Request) => {
  const apiKey = process.env.ORS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Walking routes are not configured' }, { status: 503 })
  }

  try {
    const body = await request.json()
    const points = body?.points
    if (!Array.isArray(points) || points.length < 2 || points.length > 50 || !points.every(isPoint)) {
      return NextResponse.json({ error: '2–50 valid route points are required' }, { status: 400 })
    }

    const response = await fetch(
      'https://api.heigit.org/openrouteservice/v2/directions/foot-walking/geojson',
      {
        method: 'POST',
        headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ coordinates: points.map(({ lat, lng }: Point) => [lng, lat]) }),
        signal: AbortSignal.timeout(12_000),
      },
    )

    if (!response.ok) {
      return NextResponse.json({ error: 'Walking route unavailable' }, { status: response.status === 429 ? 429 : 502 })
    }

    const payload = await response.json()
    const feature = payload?.features?.[0]
    const coordinates = feature?.geometry?.coordinates
    const summary = feature?.properties?.summary
    if (!Array.isArray(coordinates) || coordinates.length < 2 || !coordinates.every((point: unknown) =>
      Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]),
    )) {
      return NextResponse.json({ error: 'Walking route returned invalid geometry' }, { status: 502 })
    }

    return NextResponse.json({
      geometry: coordinates.map(([lng, lat]: [number, number]) => [lat, lng]),
      distanceMeters: Number(summary?.distance) || 0,
      durationSeconds: Number(summary?.duration) || 0,
    })
  } catch {
    return NextResponse.json({ error: 'Walking route unavailable' }, { status: 502 })
  }
}
