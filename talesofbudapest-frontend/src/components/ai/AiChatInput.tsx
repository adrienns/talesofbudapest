'use client'

import { useRef, type RefObject } from 'react'
import { Mic } from 'lucide-react'
import { AI_CHAT_INPUT_PLACEHOLDER } from '@/constants/aiChat'

type AiChatInputProps = {
  value: string
  isListening: boolean
  onChange: (value: string) => void
  onSubmit: () => void
  onMicClick: () => void
  inputRef?: RefObject<HTMLInputElement | null>
}

export const AiChatInput = ({
  value,
  isListening,
  onChange,
  onSubmit,
  onMicClick,
  inputRef,
}: AiChatInputProps) => (
  <form
    className="ai-chat-input prompt-bar-glass flex h-14 w-full items-center gap-3 rounded-full px-5"
    onSubmit={(event) => {
      event.preventDefault()
      onSubmit()
    }}
  >
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={AI_CHAT_INPUT_PLACEHOLDER}
      aria-label={AI_CHAT_INPUT_PLACEHOLDER}
      className="min-w-0 flex-1 bg-transparent text-body text-on-surface placeholder:text-on-surface/40 focus:outline-none"
    />
    <button
      type="button"
      onClick={onMicClick}
      aria-label="Dictate prompt"
      aria-pressed={isListening}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition active:scale-95 ${
        isListening ? 'bg-accent/15 text-accent' : 'text-on-surface'
      }`}
    >
      <Mic className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
    </button>
  </form>
)
