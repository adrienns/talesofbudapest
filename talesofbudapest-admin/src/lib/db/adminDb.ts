import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getAdminServerEnv } from '@/lib/serverEnv'

let client: SupabaseClient | null = null

export function getAdminDb(): SupabaseClient {
  if (client) return client
  const { supabaseUrl, supabaseServiceRoleKey } = getAdminServerEnv()
  client = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { 'X-Client-Info': 'talesofbudapest-admin' } },
  })
  return client
}

export const asSafeError = (error: unknown) =>
  error instanceof Error ? error.message : 'Unknown database error'
