import { isIP } from 'node:net'

/**
 * Only trust the dedicated header written by our edge proxy. Do not fall back
 * to X-Forwarded-For or X-Real-IP: a client can send both of those headers.
 *
 * Production must keep the Node origin private and configure its proxy to
 * overwrite this header (see infra/nginx/app.conf). When it is absent, callers
 * share a conservative fallback bucket instead of choosing their own IP.
 */
const TRUSTED_CLIENT_IP_HEADER = 'x-tales-client-ip'

export const trustedClientIp = (request: Request): string | null => {
  const value = request.headers.get(TRUSTED_CLIENT_IP_HEADER)?.trim()
  return value && isIP(value) !== 0 ? value : null
}
