import { NextResponse } from 'next/server'
import { emptyChronicle, mapChronicleRow } from '@/lib/server/locationChronicle'
import { getSupabaseRead } from '@/lib/server/supabaseAdmin'

export const revalidate = 86400

const CACHE_CONTROL = 'public, s-maxage=86400, stale-while-revalidate=604800'

type RouteContext = {
  params: Promise<{ id: string }>
}

const response = (body: unknown) =>
  NextResponse.json(body, { headers: { 'Cache-Control': CACHE_CONTROL } })

export const GET = async (_request: Request, context: RouteContext) => {
  const { id } = await context.params

  try {
    const supabase = getSupabaseRead()
    const { data, error } = await supabase
      .from('kg_location_chronicle')
      .select('location_id, facts, events, people, relations, updated_at')
      .eq('location_id', id)
      .maybeSingle()

    // The Chronicle is additive. A location or deployment without promoted graph
    // data remains a valid empty Chronicle instead of breaking the landmark drawer.
    if (error || !data) {
      if (error) console.warn('[location-chronicle]', error.message)
      return response(emptyChronicle(id))
    }

    return response(mapChronicleRow(id, data))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Chronicle unavailable'
    console.warn('[location-chronicle]', message)
    return response(emptyChronicle(id))
  }
}
