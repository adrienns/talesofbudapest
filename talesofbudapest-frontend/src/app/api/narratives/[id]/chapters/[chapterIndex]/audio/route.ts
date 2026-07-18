import { NextResponse } from 'next/server'
import { getSupabaseRead } from '@/lib/server/supabaseAdmin'

type RouteContext = {
  params: Promise<{ id: string; chapterIndex: string }>
}

const audioResponseHeaders = (source: Headers) => {
  const headers = new Headers({
    'Content-Type': source.get('Content-Type') ?? 'audio/mpeg',
    'Accept-Ranges': source.get('Accept-Ranges') ?? 'bytes',
    // The original file is immutable for a given curated content version.
    'Cache-Control': 'public, max-age=86400',
  })

  for (const name of ['Content-Length', 'Content-Range', 'ETag', 'Last-Modified']) {
    const value = source.get(name)
    if (value) headers.set(name, value)
  }

  return headers
}

export const GET = async (request: Request, { params }: RouteContext) => {
  try {
    const { id, chapterIndex: rawChapterIndex } = await params
    const chapterIndex = Number(rawChapterIndex)
    if (!Number.isInteger(chapterIndex) || chapterIndex < 0) {
      return NextResponse.json({ error: 'Invalid chapter index' }, { status: 400 })
    }

    const supabase = getSupabaseRead()
    const { data: narrative, error: narrativeError } = await supabase
      .from('narratives')
      .select('id, curated_slug')
      .eq('id', id)
      .maybeSingle()

    if (narrativeError) throw new Error(narrativeError.message)
    if (!narrative?.curated_slug) {
      return NextResponse.json({ error: 'Curated tour not found' }, { status: 404 })
    }

    const { data: chapter, error: chapterError } = await supabase
      .from('narrative_chapters')
      .select('audio_url')
      .eq('narrative_id', id)
      .eq('chapter_index', chapterIndex)
      .maybeSingle()

    if (chapterError) throw new Error(chapterError.message)
    if (!chapter?.audio_url) {
      return NextResponse.json({ error: 'Audio is not available for this chapter' }, { status: 404 })
    }

    const sourceUrl = new URL(chapter.audio_url)
    if (sourceUrl.protocol !== 'http:' && sourceUrl.protocol !== 'https:') {
      return NextResponse.json({ error: 'Invalid audio source' }, { status: 500 })
    }

    const range = request.headers.get('range')
    const source = await fetch(sourceUrl, {
      cache: 'no-store',
      headers: range ? { range } : undefined,
    })

    if (!source.ok && source.status !== 206) {
      return NextResponse.json({ error: 'Audio source is unavailable' }, { status: 502 })
    }

    return new NextResponse(source.body, {
      status: source.status,
      headers: audioResponseHeaders(source.headers),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load audio'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
