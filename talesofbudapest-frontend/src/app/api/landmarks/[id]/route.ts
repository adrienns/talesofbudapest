import { NextResponse } from 'next/server'
import { getSupabaseRead } from '@/lib/server/supabaseAdmin'
import { mapLocationToLandmark, type LocationRow } from '@/services/mappers/locationMapper'
import { DEFAULT_LOCALE, isAppLocale } from '@/types/locale'

const DETAIL_SELECT = `
  id, name, latitude, longitude, story_prompt, audio_url, image_url, images,
  source, landmark_type, map_theme, importance_tier, importance_score,
  publication_status,
  location_translations (locale, name, story_prompt, audio_url, audio_script, historical_narrative),
  location_media (url, alt_text, author, source_url, license, license_url, sort_order, review_status, commercial_use_allowed),
  location_audio_variants (locale, style_id, audio_script, audio_url)
`

export const GET = async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  try {
    const { id } = await params
    const localeParam = new URL(request.url).searchParams.get('locale') ?? ''
    const locale = isAppLocale(localeParam) ? localeParam : DEFAULT_LOCALE
    const supabase = getSupabaseRead()
    const { data, error } = await supabase.from('locations').select(DETAIL_SELECT)
      .eq('publication_status', 'published').eq('id', id).maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return NextResponse.json({ error: 'Landmark not found' }, { status: 404 })
    return NextResponse.json({ landmark: mapLocationToLandmark(data as LocationRow, locale) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load landmark' }, { status: 500 })
  }
}
