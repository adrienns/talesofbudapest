import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'
import {
  consumeExpensiveRequest,
  readJsonBody,
  requestGuardResponse,
} from '@/lib/server/expensiveRequestGuard'
import { getOrCreateVisitorId } from '@/lib/server/visitorIdentity'

type Point = { lat: number; lng: number }

const BUDAPEST_BOUNDS = { south: 47.30, north: 47.65, west: 18.85, east: 19.35 }

const isPoint = (value: unknown): value is Point => {
  if (!value || typeof value !== 'object') return false
  const point = value as Point
  return Number.isFinite(point.lat) && Number.isFinite(point.lng)
    && point.lat >= BUDAPEST_BOUNDS.south && point.lat <= BUDAPEST_BOUNDS.north
    && point.lng >= BUDAPEST_BOUNDS.west && point.lng <= BUDAPEST_BOUNDS.east
}

/** Server-side proxy keeps the ORS token out of the browser bundle. */
export const POST = async (request: Request) => {
  const apiKey = process.env.ORS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Walking routes are not configured' }, { status: 503 })
  }

  try {
    const body = await readJsonBody(request, 8_192)
    const points = body?.points
    if (!Array.isArray(points) || points.length < 2 || points.length > 50 || !points.every(isPoint)) {
      return NextResponse.json({ error: '2–50 valid Budapest route points are required' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const visitorId = await getOrCreateVisitorId()
    await consumeExpensiveRequest({ supabase, request, visitorId, action: 'walking_route' })

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
  } catch (error) {
    const guarded = requestGuardResponse(error)
    if (guarded) return guarded
    return NextResponse.json({ error: 'Walking route unavailable' }, { status: 502 })
  }
}
