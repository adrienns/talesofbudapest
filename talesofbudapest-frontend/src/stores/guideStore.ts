'use client'

import { create } from 'zustand'
import { requestGuideAnswer } from '@/services/guideChatService'
import type { GuideChatContext, GuideMessage } from '@/types/guide'

type GuideStore = {
  messages: GuideMessage[]
  isLoading: boolean
  error: string | null
  lastRequest: { message: string; history: GuideMessage[]; context: GuideChatContext } | null
  send: (message: string, context: GuideChatContext) => Promise<void>
  retry: () => Promise<void>
  reset: () => void
}

const messageId = () => crypto.randomUUID()

export const useGuideStore = create<GuideStore>((set, get) => {
  const request = async (
    message: string,
    history: GuideMessage[],
    context: GuideChatContext,
    appendUser: boolean,
  ) => {
    const userMessage: GuideMessage = { id: messageId(), role: 'user', content: message }
    const nextMessages = appendUser ? [...history, userMessage] : history
    set({ messages: nextMessages, isLoading: true, error: null, lastRequest: { message, history, context } })

    try {
      const response = await requestGuideAnswer({ message, history, context })
      set({
        messages: [...nextMessages, {
          id: messageId(),
          role: 'assistant',
          content: response.answer,
          sources: response.sources,
          actions: response.actions,
        }],
        isLoading: false,
        error: null,
      })
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'The AI Guide is unavailable',
      })
    }
  }

  return {
    messages: [],
    isLoading: false,
    error: null,
    lastRequest: null,
    send: async (message, context) => {
      const trimmed = message.trim().slice(0, 500)
      if (!trimmed || get().isLoading) return
      await request(trimmed, get().messages, context, true)
    },
    retry: async () => {
      const last = get().lastRequest
      if (!last || get().isLoading) return
      await request(last.message, get().messages, last.context, false)
    },
    reset: () => set({ messages: [], isLoading: false, error: null, lastRequest: null }),
  }
})
