import { defineCloudflareConfig } from '@opennextjs/cloudflare'

// The beta does not need durable incremental-cache storage. Avoiding R2 keeps
// the staging environment within the no-cost setup.
export default defineCloudflareConfig({})
