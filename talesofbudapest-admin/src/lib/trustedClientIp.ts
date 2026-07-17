import { isIP } from 'node:net'

const TRUSTED_CLIENT_IP_HEADER = 'x-tales-client-ip'

/** Only accept the address overwritten by our reverse proxy. */
export function trustedClientIp(request: Request): string {
  const value = request.headers.get(TRUSTED_CLIENT_IP_HEADER)?.trim()
  return value && isIP(value) !== 0 ? value : 'proxy-ip-unavailable'
}
