import { NextResponse } from 'next/server'
import { getSupabaseRead } from '@/lib/server/supabaseAdmin'
import { mapLocationToMapPin, type MapPinRow } from '@/services/mappers/locationMapper'
import { DEFAULT_LOCALE, isAppLocale, type AppLocale } from '@/types/locale'

const SEARCH_SELECT = `
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

const DEFAULT_LOCATION_NAMES = [
  'Hungarian Parliament Building',
  'Buda Castle',
  "Fisherman's Bastion",
  "St. Stephen's Basilica",
  'Gellért Hill',
  'Gellert Hill',
] as const

const normalize = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim()

const scoreRow = (row: MapPinRow, query: string, locale: AppLocale) => {
  const localized = row.location_translations?.find((item) => item.locale === locale)?.name ?? row.name
  const names = [localized, row.name, ...(row.location_translations?.map((item) => item.name) ?? [])]
    .map(normalize)
  const exact = names.some((name) => name === query)
  const prefix = names.some((name) => name.startsWith(query))
  const substring = names.some((name) => name.includes(query))
  return (exact ? 1_000 : prefix ? 500 : substring ? 100 : 0) + (row.importance_score ?? 0)
}

export const GET = async (request: Request) => {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')?.trim() ?? ''
    const searchTerm = query.replace(/[%_]/g, ' ').replace(/\s+/g, ' ').trim()
    if ((searchTerm.length > 0 && searchTerm.length < 2) || query.length > 80) {
      return NextResponse.json({ error: 'Search must be between 2 and 80 characters' }, { status: 400 })
    }

    const locale = isAppLocale(searchParams.get('locale') ?? '')
      ? (searchParams.get('locale') as AppLocale)
      : DEFAULT_LOCALE
    const supabase = getSupabaseRead()

    if (!searchTerm) {
      const featuredResult = await supabase
        .from('locations')
        .select(SEARCH_SELECT)
        .eq('publication_status', 'published')
        .in('name', [...DEFAULT_LOCATION_NAMES])

      if (featuredResult.error) throw new Error(featuredResult.error.message)
      const order = new Map(DEFAULT_LOCATION_NAMES.map((name, index) => [name, Math.min(index, 4)]))
      const pins = (featuredResult.data as MapPinRow[])
        .sort((a, b) =>
          (order.get(a.name as typeof DEFAULT_LOCATION_NAMES[number]) ?? 99)
          - (order.get(b.name as typeof DEFAULT_LOCATION_NAMES[number]) ?? 99))
        .slice(0, 4)
        .map((row) => mapLocationToMapPin(row, locale))
      return NextResponse.json({ pins })
    }

    const [canonicalResult, translationResult, aliasResult] = await Promise.all([
      supabase.from('locations').select(SEARCH_SELECT).eq('publication_status', 'published').ilike('name', `%${searchTerm}%`).limit(24),
      supabase.from('location_translations').select('location_id').ilike('name', `%${searchTerm}%`).limit(24),
      supabase.from('location_aliases').select('location_id').ilike('alias', `%${searchTerm}%`).limit(24),
    ])

    if (canonicalResult.error) throw new Error(canonicalResult.error.message)
    if (translationResult.error) throw new Error(translationResult.error.message)
    if (aliasResult.error) throw new Error(aliasResult.error.message)

    const translatedIds = [...new Set([
      ...(translationResult.data ?? []).map((row) => row.location_id),
      ...(aliasResult.data ?? []).map((row) => row.location_id),
    ])]
    const translatedResult = translatedIds.length
      ? await supabase.from('locations').select(SEARCH_SELECT).eq('publication_status', 'published').in('id', translatedIds)
      : { data: [], error: null }

    if (translatedResult.error) throw new Error(translatedResult.error.message)

    const byId = new Map<string, MapPinRow>()
    for (const row of [...(canonicalResult.data ?? []), ...(translatedResult.data ?? [])] as MapPinRow[]) {
      byId.set(String(row.id), row)
    }

    const normalizedQuery = normalize(searchTerm)
    const pins = [...byId.values()]
      .sort((a, b) => scoreRow(b, normalizedQuery, locale) - scoreRow(a, normalizedQuery, locale))
      .slice(0, 8)
      .map((row) => mapLocationToMapPin(row, locale))

    return NextResponse.json({ pins })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to search landmarks'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
