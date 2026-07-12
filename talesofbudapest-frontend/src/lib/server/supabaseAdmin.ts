import { createClient } from '@supabase/supabase-js'
// @ts-expect-error backend lib is plain JS in sibling workspace
import { resolveSupabaseServiceRoleKey } from '@backend/lib/supabaseServiceKey.js'

export const getSupabaseAdmin = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const serviceKey = resolveSupabaseServiceRoleKey()
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY

  const key = serviceKey ?? anonKey

  if (!url || !key) {
    throw new Error(
      'Supabase credentials missing. Set SUPABASE_SERVICE_ROLE_KEY (recommended) or NEXT_PUBLIC_SUPABASE_ANON_KEY in talesofbudapest-backend/.env or talesofbudapest-frontend/.env.local',
    )
  }

  return createClient(url, key)
}

export const getSupabaseRead = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const key =
    resolveSupabaseServiceRoleKey() ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error('Supabase credentials are not configured')
  }

  return createClient(url, key)
}
