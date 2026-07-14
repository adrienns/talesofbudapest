import { NextResponse } from 'next/server'
import { filterMapPins, parseBboxParam } from '@/lib/server/mapLandmarksQuery'
import { getSupabaseRead } from '@/lib/server/supabaseAdmin'
import { mapLocationToMapPin, type MapPinRow } from '@/services/mappers/locationMapper'
import { DEFAULT_LOCALE, isAppLocale } from '@/types/locale'

const MAP_PIN_SELECT = `
  id,
  name,
  latitude,
  longitude,
  audio_url,
  image_url,
  source,
  landmark_type,
  map_theme,
  importance_tier,
  importance_score,
  location_translations (locale, name, audio_url)
`

export const GET = async (request: Request) => {
  try {
    const { searchParams } = new URL(request.url)
    const bbox = parseBboxParam(searchParams.get('bbox'))
    const zoom = Number(searchParams.get('zoom') ?? '13')
    const locale = isAppLocale(searchParams.get('locale') ?? '')
      ? (searchParams.get('locale') as typeof DEFAULT_LOCALE)
      : DEFAULT_LOCALE
    const showAll = searchParams.get('showAll') === 'true'

    if (!bbox) {
      return NextResponse.json({ error: 'bbox query param required (south,west,north,east)' }, { status: 400 })
    }

    const supabase = getSupabaseRead()
    const { data, error } = await supabase
      .from('locations')
      .select(MAP_PIN_SELECT)
      .gte('latitude', bbox.south)
      .lte('latitude', bbox.north)
      .gte('longitude', bbox.west)
      .lte('longitude', bbox.east)
      .order('importance_score', { ascending: false, nullsFirst: false })
      .limit(500)

    if (error) {
      throw new Error(error.message)
    }

    const pins = (data as MapPinRow[]).map((row) => mapLocationToMapPin(row, locale))
    const filtered = filterMapPins(pins, zoom, showAll)

    return NextResponse.json({ pins: filtered })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load map landmarks'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
