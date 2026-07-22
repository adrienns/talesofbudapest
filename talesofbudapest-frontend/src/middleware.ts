import createMiddleware from 'next-intl/middleware'
import { NextResponse, type NextRequest } from 'next/server'
import { routing } from '@/i18n/routing'

const intlMiddleware = createMiddleware(routing)

const stagingDisabledApiPrefixes = [
  '/api/directions/walking',
  '/api/guide/chat',
  '/api/internal/narrative-jobs',
  '/api/landmarks',
  '/api/narratives/generate',
  '/api/narratives/plan',
]

const isCuratedOnlyStaging = () => process.env.TALES_CURATED_ONLY === 'true'

export default function middleware(request: NextRequest) {
  const pathname = new URL(request.url).pathname

  if (
    isCuratedOnlyStaging()
    && stagingDisabledApiPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  ) {
    const response = NextResponse.json(
      { error: 'This feature is disabled in the curated-tour beta.' },
      { status: 403 },
    )
    response.headers.set('X-Robots-Tag', 'noindex, nofollow')
    return response
  }

  const response = pathname.startsWith('/api/')
    ? NextResponse.next()
    : intlMiddleware(request)

  if (isCuratedOnlyStaging()) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow')
  }

  return response
}

export const config = {
  matcher: ['/api/:path*', '/', '/(hu|en)/:path*', '/((?!_next|_vercel|.*\\..*).*)'],
}
