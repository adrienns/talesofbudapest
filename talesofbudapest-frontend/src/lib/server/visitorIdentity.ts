import { cookies } from 'next/headers'

const VISITOR_COOKIE = 'tales_visitor_id'
const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const getOrCreateVisitorId = async (): Promise<string> => {
  const cookieStore = await cookies()
  const existing = cookieStore.get(VISITOR_COOKIE)?.value

  if (existing && UUID_PATTERN.test(existing)) {
    return existing
  }

  const visitorId = crypto.randomUUID()
  cookieStore.set(VISITOR_COOKIE, visitorId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: VISITOR_COOKIE_MAX_AGE,
    path: '/',
  })

  return visitorId
}

