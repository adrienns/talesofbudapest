import { NextRequest, NextResponse } from 'next/server'
import { getGraph, getStagingGraph } from '@/lib/db/adminQueries'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const staging = params.get('source') === 'staging'
  try {
    const graph = staging ? await getStagingGraph(params) : await getGraph(params)
    return NextResponse.json(graph, { headers: { 'Cache-Control': 'no-store' } })
  } catch (cause) {
    console.error(`[admin/graph] ${staging ? 'staging' : 'canonical'} query failed:`, cause instanceof Error ? cause.message : cause)
    return NextResponse.json({ error: 'Graph data is temporarily unavailable', entities: [], edges: [], claims: [] }, { status: 503 })
  }
}

