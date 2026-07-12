import { NextRequest, NextResponse } from 'next/server'
import { applyDecision } from '@/lib/reviews/service'
import { parseDecisionInput } from '@/lib/reviews/validation'

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (!origin || origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'Cross-origin decisions are not allowed' }, { status: 403 })
  }
  let input
  try {
    input = parseDecisionInput(await request.json())
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid decision' }, { status: 400 })
  }
  try {
    const result = await applyDecision(input)
    return NextResponse.json({ ok: true, result }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Decision failed'
    const status = /not found/i.test(message) ? 404 : /already|conflict/i.test(message) ? 409 : 422
    return NextResponse.json({ ok: false, error: message }, { status })
  }
}
