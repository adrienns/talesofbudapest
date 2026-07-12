import { NextRequest, NextResponse } from 'next/server'

import { ADMIN_COOKIE_NAME, adminCookieOptions } from '@/lib/session'

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/login', request.url), 303)
  response.cookies.set(ADMIN_COOKIE_NAME, '', { ...adminCookieOptions, maxAge: 0 })
  return response
}
