import { NextResponse } from 'next/server'
import { getOverview } from '@/lib/db/adminQueries'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    return NextResponse.json(await getOverview(), { headers: { 'Cache-Control': 'no-store' } })
  } catch (cause) {
    console.error('[admin/overview] query failed:', cause instanceof Error ? cause.message : cause)
    return NextResponse.json({ health: { connected: false, state: 'unavailable', checkedAt: new Date().toISOString() }, counts: {}, statuses: {}, sources: [], pipeline: {}, unavailableTables: [] }, { status: 503 })
  }
}
