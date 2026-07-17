import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'
import { getOrCreateVisitorId } from '@/lib/server/visitorIdentity'
// @ts-expect-error backend lib is plain JS in sibling workspace
import { fetchNarrativeById } from '@backend/lib/narrativePipeline.js'

type RouteParams = {
  params: Promise<{ id: string }>
}

export const GET = async (request: Request, { params }: RouteParams) => {
  try {
    const { id } = await params
    const ownerId = await getOrCreateVisitorId()
    const supabase = getSupabaseAdmin()
    const localeParam = new URL(request.url).searchParams.get('locale')
    const locale = localeParam === 'en' || localeParam === 'hu' ? localeParam : null
    const narrative = await fetchNarrativeById(supabase, id, locale, ownerId)

    if (!narrative) {
      return NextResponse.json({ error: 'Narrative not found' }, { status: 404 })
    }

    return NextResponse.json(narrative)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch narrative'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
