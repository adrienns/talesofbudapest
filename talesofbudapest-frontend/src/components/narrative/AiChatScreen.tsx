'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AiChatHeader } from '@/components/ai/AiChatHeader'
import { AiChatInput } from '@/components/ai/AiChatInput'
import { AiOrb } from '@/components/ai/AiOrb'
import { AiSuggestionChip } from '@/components/ai/AiSuggestionChip'
import {
  AI_CHAT_DEFAULT_SUGGESTIONS,
  AI_CHAT_GREETING,
  shuffleSuggestionColors,
  type AiChatSuggestion,
  type SuggestionTopicColor,
} from '@/constants/aiChat'
import type { NarrativeContext } from '@/types/narrative'

type AiChatScreenProps = {
  isOpen: boolean
  context: NarrativeContext
  onClose: () => void
  onGenerate: (prompt: string) => void
  startDictation?: boolean
}

export const AiChatScreen = ({
  isOpen,
  context,
  onClose,
  onGenerate,
  startDictation = false,
}: AiChatScreenProps) => {
  const [prompt, setPrompt] = useState('')
  const [suggestions, setSuggestions] = useState<AiChatSuggestion[]>(AI_CHAT_DEFAULT_SUGGESTIONS)
  const [isListening, setIsListening] = useState(false)
  const [suggestionColors, setSuggestionColors] = useState<SuggestionTopicColor[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const colorSeed = useMemo(() => (isOpen ? suggestions.length : 0), [isOpen, suggestions.length])

  useEffect(() => {
    if (!isOpen) {
      setSuggestionColors([])
      return
    }

    setSuggestionColors(shuffleSuggestionColors(suggestions.length))
  }, [isOpen, colorSeed])

  useEffect(() => {
    if (!isOpen) {
      setPrompt('')
      setIsListening(false)
      setSuggestions(AI_CHAT_DEFAULT_SUGGESTIONS)
      return
    }

    const loadSuggestions = async () => {
      try {
        const response = await fetch('/api/narratives/suggestions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ context }),
        })
        const payload = await response.json()
        const apiLabels: string[] = payload.suggestions ?? []

        if (apiLabels.length === 0) {
          return
        }

        setSuggestions((current) => {
          const merged = [...current]
          apiLabels.slice(0, 2).forEach((label, index) => {
            const slot = merged[index]
            if (slot) {
              merged[index] = { ...slot, label, prompt: label }
            }
          })
          return merged
        })
      } catch {
        setSuggestions(AI_CHAT_DEFAULT_SUGGESTIONS)
      }
    }

    loadSuggestions()
  }, [context, isOpen])

  useEffect(() => {
    if (!isOpen || !startDictation) {
      return
    }

    inputRef.current?.focus()
    startSpeechRecognition()
  }, [isOpen, startDictation])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  const startSpeechRecognition = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any
    const SpeechRecognitionCtor = win.SpeechRecognition ?? win.webkitSpeechRecognition

    if (!SpeechRecognitionCtor) {
      return
    }

    const recognition = new SpeechRecognitionCtor()
    recognition.lang = 'en-US'
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.onstart = () => setIsListening(true)
    recognition.onend = () => setIsListening(false)
    recognition.onerror = () => setIsListening(false)
    recognition.onresult = (event: { results: Array<Array<{ transcript: string }>> }) => {
      const transcript = event.results[0]?.[0]?.transcript
      if (transcript) {
        setPrompt((current) => (current ? `${current} ${transcript}` : transcript))
      }
    }

    recognition.start()
  }

  const handleSubmit = () => {
    const trimmed = prompt.trim()
    if (!trimmed) {
      return
    }

    onGenerate(trimmed)
  }

  const handleSuggestionSelect = (suggestion: AiChatSuggestion) => {
    if (suggestion.id === 'anything' || !suggestion.prompt) {
      inputRef.current?.focus()
      return
    }

    onGenerate(suggestion.prompt)
  }

  if (!isOpen) {
    return null
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="AI narrative guide"
      className="ai-chat-screen fixed inset-0 z-50 flex flex-col"
    >
      <div className="flex flex-1 flex-col px-5 pb-4 pt-[max(0.875rem,env(safe-area-inset-top))]">
        <AiChatHeader onMenuClick={onClose} />

        <div className="flex flex-1 flex-col items-center justify-center gap-8 px-2">
          <AiOrb />

          <h2 className="max-w-xs text-center text-[1.625rem] font-bold leading-tight tracking-tight text-on-surface">
            {AI_CHAT_GREETING}
          </h2>

          <div className="flex w-full max-w-sm flex-wrap items-center justify-center gap-2.5">
            {suggestions.map((suggestion, index) => (
              <AiSuggestionChip
                key={suggestion.id}
                label={suggestion.label}
                icon={suggestion.icon}
                colorVar={suggestionColors[index]}
                onSelect={() => handleSuggestionSelect(suggestion)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <AiChatInput
          value={prompt}
          isListening={isListening}
          onChange={setPrompt}
          onSubmit={handleSubmit}
          onMicClick={startSpeechRecognition}
          inputRef={inputRef}
        />
      </div>
    </div>
  )
}
