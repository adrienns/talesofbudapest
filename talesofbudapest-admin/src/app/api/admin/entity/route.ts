import { NextRequest, NextResponse } from 'next/server'
import { getCanonicalEntityDetail, getStagingEntityDetail, isStagingKind, isUuid } from '@/lib/db/adminQueries'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')
  const source = request.nextUrl.searchParams.get('source') ?? 'canonical'
  const kind = request.nextUrl.searchParams.get('kind')
  if (!isUuid(id)) return NextResponse.json({ error: 'A valid entity UUID is required' }, { status: 400 })
  if (!['canonical', 'staging'].includes(source)) return NextResponse.json({ error: 'source must be canonical or staging' }, { status: 400 })
  if (source === 'staging' && !isStagingKind(kind)) return NextResponse.json({ error: 'Staging kind must be location, person, event, or organisation' }, { status: 400 })
  try {
    const detail = source === 'staging' && isStagingKind(kind) ? await getStagingEntityDetail(id, kind) : await getCanonicalEntityDetail(id)
    if (!detail) return NextResponse.json({ error: 'Entity not found' }, { status: 404 })
    return NextResponse.json(detail, { headers: { 'Cache-Control': 'no-store' } })
  } catch (cause) {
    console.error('[admin/entity] query failed:', cause instanceof Error ? cause.message : cause)
    return NextResponse.json({ error: 'Entity detail is temporarily unavailable' }, { status: 503 })
  }
}
