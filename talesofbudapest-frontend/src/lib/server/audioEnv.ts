// @ts-expect-error backend lib is plain JS in sibling workspace
import { getOpenRouterApiKey } from '@backend/lib/openRouterClient.js'

export const assertOpenRouterConfigured = () => {
  if (!getOpenRouterApiKey()) {
    throw new Error(
      'OPENROUTER_API_KEY is not configured. Add it to talesofbudapest-backend/.env to generate audio tours.',
    )
  }
}
