import type { NextConfig } from 'next'
import { config as loadEnv } from 'dotenv'
import createNextIntlPlugin from 'next-intl/plugin'
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'
import path from 'path'
import { fileURLToPath } from 'url'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const isCloudflareStagingBuild = process.env.NEXT_PUBLIC_TALES_CURATED_ONLY === 'true'

// Next loads `.env.local` before this configuration file. Never allow local
// Supabase endpoints or credentials to become fallbacks in the staging Worker.
if (isCloudflareStagingBuild) {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  delete process.env.SUPABASE_ANON_KEY
  delete process.env.SUPABASE_JWT_SECRET
}

// Load local services for development only. A Cloudflare deployment must not
// read or bundle the developer's local Supabase and AI credentials.
if (!isCloudflareStagingBuild) {
  loadEnv({ path: path.join(__dirname, '../talesofbudapest-backend/.env') })
  loadEnv({
    path: path.join(__dirname, '../infra/supabase-upstream/docker/.env'),
    override: false,
  })
}

initOpenNextCloudflareForDev()

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
  outputFileTracingExcludes: {
    '/*': [
      '../talesofbudapest-backend/.env',
      '../infra/supabase-upstream/docker/.env',
    ],
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
