import { createClient } from '@supabase/supabase-js'
// @ts-expect-error backend lib is plain JS in sibling workspace
import { resolveSupabaseServiceRoleKey } from '@backend/lib/supabaseServiceKey.js'

export const getSupabaseAdmin = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const key = resolveSupabaseServiceRoleKey()

  if (!url || !key) {
    throw new Error(
      'Supabase service-role credentials are missing. Server API routes must not fall back to an anon key.',
    )
  }

  return createClient(url, key)
}

export const getSupabaseRead = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const key = resolveSupabaseServiceRoleKey()

  if (!url || !key) {
    throw new Error('Supabase credentials are not configured')
  }

  return createClient(url, key)
}
