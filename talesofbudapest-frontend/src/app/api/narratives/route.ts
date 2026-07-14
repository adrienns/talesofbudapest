import { NextResponse } from 'next/server'
import { getSupabaseRead } from '@/lib/server/supabaseAdmin'
// @ts-expect-error backend lib is plain JS in sibling workspace
import { fetchAllNarratives } from '@backend/lib/narrativePipeline.js'

export const GET = async (request: Request) => {
  try {
    const localeParam = new URL(request.url).searchParams.get('locale')
    const locale = localeParam === 'en' || localeParam === 'hu' ? localeParam : null
    const supabase = getSupabaseRead()
    const narratives = await fetchAllNarratives(supabase, locale)

    return NextResponse.json({ narratives })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch narratives'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
