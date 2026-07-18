import type { GuideChatContext, GuideChatResponse, GuideMessage } from '@/types/guide'

export const requestGuideAnswer = async ({
  message,
  history,
  context,
}: {
  message: string
  history: GuideMessage[]
  context: GuideChatContext
}): Promise<GuideChatResponse> => {
  const response = await fetch('/api/guide/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      history: history.slice(-10).map(({ role, content }) => ({ role, content: content.slice(0, 500) })),
      context,
    }),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error ?? 'The AI Guide is unavailable')
  return body as GuideChatResponse
}
