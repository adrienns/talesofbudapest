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

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
}

export default withNextIntl(nextConfig)
