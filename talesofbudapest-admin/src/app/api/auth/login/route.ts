import { NextRequest, NextResponse } from 'next/server'

import { verifyAdminPassword } from '@/lib/password'
import { ADMIN_COOKIE_NAME, adminCookieOptions, createAdminSession } from '@/lib/session'

const attempts = new Map<string, { count: number; resetAt: number }>()
const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 8

function clientKey(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
}

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return true
  try {
    return new URL(origin).host === request.nextUrl.host
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
  }

  const key = clientKey(request)
  const now = Date.now()
  const previous = attempts.get(key)
  const record = !previous || previous.resetAt <= now ? { count: 0, resetAt: now + WINDOW_MS } : previous
  if (record.count >= MAX_ATTEMPTS) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again later.' },
      { headers: { 'Cache-Control': 'no-store', 'Retry-After': String(Math.ceil((record.resetAt - now) / 1000)) }, status: 429 },
    )
  }

  let password = ''
  try {
    const body = (await request.json()) as { password?: unknown }
    if (typeof body.password === 'string') password = body.password
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  try {
    if (!verifyAdminPassword(password)) {
      record.count += 1
      attempts.set(key, record)
      return NextResponse.json({ error: 'Invalid credentials' }, { headers: { 'Cache-Control': 'no-store' }, status: 401 })
    }

    attempts.delete(key)
    const response = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
    response.cookies.set(ADMIN_COOKIE_NAME, await createAdminSession(), adminCookieOptions)
    return response
  } catch (error) {
    console.error('Admin login is not configured', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Admin login is unavailable' }, { status: 503 })
  }
}
