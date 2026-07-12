import { ADMIN_COOKIE_NAME, ADMIN_SESSION_SECONDS } from './authConstants'

type SessionPayload = {
  expiresAt: number
  issuedAt: number
  version: 1
}

const encoder = new TextEncoder()

function encodeBase64Url(value: Uint8Array | string): string {
  const bytes = typeof value === 'string' ? encoder.encode(value) : value
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function sessionSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('ADMIN_SESSION_SECRET must contain at least 32 characters')
  }
  return secret
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(sessionSecret()),
    { hash: 'SHA-256', name: 'HMAC' },
    false,
    ['sign', 'verify'],
  )
}

export async function createAdminSession(now = Date.now()): Promise<string> {
  const payload: SessionPayload = {
    expiresAt: now + ADMIN_SESSION_SECONDS * 1000,
    issuedAt: now,
    version: 1,
  }
  const encodedPayload = encodeBase64Url(JSON.stringify(payload))
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(), encoder.encode(encodedPayload))
  return `${encodedPayload}.${encodeBase64Url(new Uint8Array(signature))}`
}

export async function verifyAdminSession(token: string | undefined, now = Date.now()): Promise<boolean> {
  if (!token) return false
  const [encodedPayload, encodedSignature, extra] = token.split('.')
  if (!encodedPayload || !encodedSignature || extra) return false

  try {
    const validSignature = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(),
      decodeBase64Url(encodedSignature),
      encoder.encode(encodedPayload),
    )
    if (!validSignature) return false

    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(encodedPayload))) as Partial<SessionPayload>
    return (
      payload.version === 1 &&
      typeof payload.issuedAt === 'number' &&
      typeof payload.expiresAt === 'number' &&
      payload.issuedAt <= now + 60_000 &&
      payload.expiresAt > now &&
      payload.expiresAt - payload.issuedAt <= ADMIN_SESSION_SECONDS * 1000
    )
  } catch {
    return false
  }
}

export const adminCookieOptions = {
  httpOnly: true,
  maxAge: ADMIN_SESSION_SECONDS,
  path: '/',
  sameSite: 'strict' as const,
  secure: process.env.NODE_ENV === 'production',
}

export { ADMIN_COOKIE_NAME }
