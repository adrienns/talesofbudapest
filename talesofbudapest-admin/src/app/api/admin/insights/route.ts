import { NextResponse } from 'next/server'
import { getInsights } from '@/lib/db/adminQueries'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    return NextResponse.json(await getInsights(), { headers: { 'Cache-Control': 'no-store' } })
  } catch (cause) {
    console.error('[admin/insights] query failed:', cause instanceof Error ? cause.message : cause)
    return NextResponse.json({ error: 'Insights are temporarily unavailable' }, { status: 503 })
  }
}
