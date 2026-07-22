// @ts-expect-error backend lib is plain JS in sibling workspace
import { getGeminiApiKey } from '@backend/lib/geminiTtsClient.js'

export const assertGeminiTtsConfigured = () => getGeminiApiKey()
