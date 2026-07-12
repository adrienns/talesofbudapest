import { NextResponse } from 'next/server'
import { getSupabaseRead } from '@/lib/server/supabaseAdmin'
// @ts-expect-error backend lib is plain JS in sibling workspace
import { fetchNarrativeById } from '@backend/lib/narrativePipeline.js'

type RouteParams = {
  params: Promise<{ id: string }>
}

export const GET = async (_request: Request, { params }: RouteParams) => {
  try {
    const { id } = await params
    const supabase = getSupabaseRead()
    const narrative = await fetchNarrativeById(supabase, id)

    if (!narrative) {
      return NextResponse.json({ error: 'Narrative not found' }, { status: 404 })
    }

    return NextResponse.json(narrative)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch narrative'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
