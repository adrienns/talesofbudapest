import { NextRequest, NextResponse } from 'next/server'
import { getReviewQuestions } from '@/lib/reviews/service'
import { cappedLimit } from '@/lib/reviews/validation'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const kind = request.nextUrl.searchParams.get('kind')
    const items = await getReviewQuestions(cappedLimit(request.nextUrl.searchParams.get('limit')), kind)
    return NextResponse.json({ items, count: items.length }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (cause) {
    console.error('[admin/reviews] query failed:', cause instanceof Error ? cause.message : cause)
    return NextResponse.json({ error: 'Review queue is temporarily unavailable', items: [], count: 0 }, { status: 503 })
  }
}

