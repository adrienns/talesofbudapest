import 'server-only'

export type AdminServerEnv = {
  supabaseServiceRoleKey: string
  supabaseUrl: string
}

/** Read privileged database settings only from server-side modules. */
export function getAdminServerEnv(): AdminServerEnv {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  }
  return { supabaseServiceRoleKey, supabaseUrl }
}
