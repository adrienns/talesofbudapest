import { NextResponse } from 'next/server'
// @ts-expect-error backend lib is plain JS in sibling workspace
import { buildContextualSuggestions } from '@backend/lib/suggestions.js'

export const POST = async (request: Request) => {
  try {
    const body = await request.json()
    const suggestions = buildContextualSuggestions(body?.context ?? body)

    return NextResponse.json({ suggestions })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to build suggestions'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
