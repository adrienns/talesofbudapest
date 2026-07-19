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
  publication_status,
  location_translations (locale, name, audio_url),
  location_media (url, alt_text, author, source_url, license, license_url, sort_order, review_status, commercial_use_allowed)
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

    const supabase = getSupabaseRead()
    let query = supabase
      .from('locations')
      .select(MAP_PIN_SELECT)
      .eq('publication_status', 'published')
      .order('importance_score', { ascending: false, nullsFirst: false })

    if (bbox) {
      query = query
        .gte('latitude', bbox.south)
        .lte('latitude', bbox.north)
        .gte('longitude', bbox.west)
        .lte('longitude', bbox.east)
        .limit(500)
    } else {
      query = query.order('name').limit(2_500)
    }

    const { data, error } = await query

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
