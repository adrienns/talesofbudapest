import { createClient } from '@supabase/supabase-js'
import { getCloudflareContext } from '@opennextjs/cloudflare'
// @ts-expect-error backend lib is plain JS in sibling workspace
import { resolveSupabaseServiceRoleKey } from '@backend/lib/supabaseServiceKey.js'

type RuntimeEnvironment = Record<string, string | undefined>

// Next.js replaces direct `process.env.NAME` references while compiling. That
// is useful for public browser values, but server credentials for the Worker
// must be read at request time from Cloudflare bindings instead.
const getRuntimeEnvironment = (): RuntimeEnvironment => {
  try {
    return getCloudflareContext().env as RuntimeEnvironment
  } catch {
    return {}
  }
}

const readEnvironment = (name: string) => {
  const runtimeValue = getRuntimeEnvironment()[name]
  return runtimeValue ?? process.env[name]
}

const getServiceRoleKey = () =>
  resolveSupabaseServiceRoleKey({
    serviceRoleKey: readEnvironment('SUPABASE_SERVICE_ROLE_KEY'),
    anonKey: readEnvironment('SUPABASE_ANON_KEY') ?? readEnvironment('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    jwtSecret: readEnvironment('SUPABASE_JWT_SECRET') ?? readEnvironment('JWT_SECRET'),
  })

export const getSupabaseAdmin = () => {
  const url = readEnvironment('SUPABASE_URL') ?? readEnvironment('NEXT_PUBLIC_SUPABASE_URL')
  const key = getServiceRoleKey()

  if (!url || !key) {
    throw new Error(
      'Supabase service-role credentials are missing. Server API routes must not fall back to an anon key.',
    )
  }

  return createClient(url, key)
}

export const getSupabaseRead = () => {
  const url = readEnvironment('SUPABASE_URL') ?? readEnvironment('NEXT_PUBLIC_SUPABASE_URL')
  const key = getServiceRoleKey()

  if (!url || !key) {
    throw new Error('Supabase credentials are not configured')
  }

  return createClient(url, key)
}
