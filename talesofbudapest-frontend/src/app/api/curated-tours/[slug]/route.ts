import { NextResponse } from 'next/server'
import { getSupabaseRead } from '@/lib/server/supabaseAdmin'
// @ts-expect-error backend content is plain JS in sibling workspace
import { findCuratedTour } from '@backend/content/curated/index.js'
// @ts-expect-error backend lib is plain JS in sibling workspace
import { fetchCuratedNarrative } from '@backend/lib/narrativePipeline.js'

type RouteParams = { params: Promise<{ slug: string }> }

export const GET = async (request: Request, { params }: RouteParams) => {
  try {
    const { slug } = await params
    const locale = new URL(request.url).searchParams.get('locale')
    if (locale !== 'en' && locale !== 'hu') {
      return NextResponse.json({ error: 'locale must be en or hu' }, { status: 400 })
    }

    const manifest = findCuratedTour(slug, locale)
    if (!manifest) return NextResponse.json({ error: 'Curated tour not found' }, { status: 404 })

    const narrative = await fetchCuratedNarrative(getSupabaseRead(), {
      slug,
      version: manifest.version,
      locale,
    })
    if (!narrative) {
      return NextResponse.json(
        { error: 'Curated tour content has not been seeded yet' },
        { status: 503 },
      )
    }
    return NextResponse.json(narrative)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load curated tour'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
