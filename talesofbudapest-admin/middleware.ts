import { NextRequest, NextResponse } from 'next/server'

import { ADMIN_COOKIE_NAME, verifyAdminSession } from '@/lib/session'

const PUBLIC_PATHS = new Set(['/login', '/api/auth/login'])

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (PUBLIC_PATHS.has(pathname)) {
    if (pathname === '/login' && (await verifyAdminSession(request.cookies.get(ADMIN_COOKIE_NAME)?.value))) {
      return NextResponse.redirect(new URL('/', request.url))
    }
    return NextResponse.next()
  }

  const authenticated = await verifyAdminSession(request.cookies.get(ADMIN_COOKIE_NAME)?.value)
  if (authenticated) return NextResponse.next()

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const loginUrl = new URL('/login', request.url)
  if (pathname !== '/') loginUrl.searchParams.set('next', pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
