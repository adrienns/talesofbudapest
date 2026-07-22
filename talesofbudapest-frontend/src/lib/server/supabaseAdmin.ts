import { createClient } from '@supabase/supabase-js'
import { getCloudflareContext } from '@opennextjs/cloudflare'
// @ts-expect-error backend lib is plain JS in sibling workspace
import { resolveSupabaseServiceRoleKey } from '@backend/lib/supabaseServiceKey.js'

type RuntimeEnvironment = Record<string, string | undefined>
type SupabaseCredentials = { url: string; key: string }

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

const credentialsFromEnvironment = (
  environment: RuntimeEnvironment,
): SupabaseCredentials | null => {
  const url = environment.SUPABASE_URL ?? environment.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = environment.SUPABASE_ANON_KEY ?? environment.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const jwtSecret = environment.SUPABASE_JWT_SECRET ?? environment.JWT_SECRET

  if (!url || (!serviceRoleKey && !(anonKey && jwtSecret))) {
    return null
  }

  return {
    url,
    key: resolveSupabaseServiceRoleKey({ serviceRoleKey, anonKey, jwtSecret }),
  }
}

const getSupabaseCredentials = (): SupabaseCredentials | null =>
  credentialsFromEnvironment(getRuntimeEnvironment())
  ?? credentialsFromEnvironment(process.env)

export const getSupabaseAdmin = () => {
  const credentials = getSupabaseCredentials()

  if (!credentials) {
    throw new Error(
      'Supabase service-role credentials are missing. Server API routes must not fall back to an anon key.',
    )
  }

  return createClient(credentials.url, credentials.key)
}

export const getSupabaseRead = () => {
  const credentials = getSupabaseCredentials()

  if (!credentials) {
    throw new Error('Supabase credentials are not configured')
  }

  return createClient(credentials.url, credentials.key)
}
