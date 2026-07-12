import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'

export function verifyAdminPassword(candidate: string): boolean {
  const expected = process.env.ADMIN_PASSWORD
  const secret = process.env.ADMIN_SESSION_SECRET
  if (!expected || !secret || secret.length < 32) {
    throw new Error('Admin authentication environment is not configured')
  }

  const digest = (value: string) => createHmac('sha256', secret).update(value, 'utf8').digest()
  return timingSafeEqual(digest(candidate), digest(expected))
}
