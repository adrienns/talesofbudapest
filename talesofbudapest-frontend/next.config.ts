import type { NextConfig } from 'next'
import { config as loadEnv } from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Load sibling backend .env so API routes get OPENROUTER/GROQ, HF_TOKEN, Supabase keys in dev.
loadEnv({ path: path.join(__dirname, '../talesofbudapest-backend/.env') })

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

export default nextConfig
