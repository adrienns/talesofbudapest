import { config as loadEnv } from 'dotenv'
import path from 'path'

let loaded = false

export const loadBackendEnv = () => {
  if (loaded) {
    return
  }

  loadEnv({ path: path.join(process.cwd(), '../talesofbudapest-backend/.env') })
  loadEnv({
    path: path.join(process.cwd(), '../infra/supabase-upstream/docker/.env'),
    override: false,
  })

  loaded = true
}
