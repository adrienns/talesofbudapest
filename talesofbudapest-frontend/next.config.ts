import type { NextConfig } from 'next'
import { config as loadEnv } from 'dotenv'
import createNextIntlPlugin from 'next-intl/plugin'
import path from 'path'
import { fileURLToPath } from 'url'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Load sibling backend .env so API routes get OPENROUTER, Supabase keys in dev.
loadEnv({ path: path.join(__dirname, '../talesofbudapest-backend/.env') })
loadEnv({
  path: path.join(__dirname, '../infra/supabase-upstream/docker/.env'),
  override: false,
})

const isProduction = process.env.NODE_ENV === 'production'

// The visitor app uses map tiles and editorial media hosted on HTTPS origins.
// Keep those resources available without permitting third-party scripts.
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? '' : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://tiles.openfreemap.org",
  `connect-src 'self' https://tiles.openfreemap.org${isProduction ? '' : ' ws: wss:'}`,
  "media-src 'self' blob: https:",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "manifest-src 'self'",
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'geolocation=(self), camera=(), microphone=(), payment=(), usb=()',
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  ...(isProduction
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
    : []),
]

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Hides Next.js's development "N" route/status indicator.
  devIndicators: false,
  experimental: {
    externalDir: true,
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@backend': path.join(__dirname, '../talesofbudapest-backend'),
    }
    return config
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}

export default withNextIntl(nextConfig)
