import type { LucideIcon } from 'lucide-react'
import {
  Building2,
  Crown,
  Flame,
  MapPin,
  MessageCircleMore,
  Palette,
  Shield,
  Star,
} from 'lucide-react'

export type AiChatSuggestion = {
  id: string
  label: string
  prompt: string
  icon: LucideIcon
}

export const AI_CHAT_GREETING = 'Where shall our story begin?'

export const AI_CHAT_DEFAULT_SUGGESTIONS: AiChatSuggestion[] = [
  {
    id: 'nearby',
    label: "What's right around me?",
    prompt: "Create an audio tour about what's right around me in Budapest",
    icon: MapPin,
  },
  {
    id: 'war',
    label: 'War Secrets',
    prompt: 'Uncover war secrets and hidden wartime stories of Budapest',
    icon: Shield,
  },
  {
    id: 'rebels',
    label: 'Rebels',
    prompt: 'Tell me stories of rebels and resistance movements in Budapest',
    icon: Flame,
  },
  {
    id: 'artists',
    label: 'Artists & Bohemians',
    prompt: 'Explore the artists and bohemian culture of Budapest',
    icon: Palette,
  },
  {
    id: 'architecture',
    label: 'Secrets of the Architecture',
    prompt: 'Reveal the secrets hidden in Budapest architecture',
    icon: Building2,
  },
  {
    id: 'jewish',
    label: 'Jewish stories',
    prompt: 'Share Jewish stories and heritage from Budapest',
    icon: Star,
  },
  {
    id: 'royal',
    label: 'Royal history',
    prompt: 'Walk me through royal history and palaces of Budapest',
    icon: Crown,
  },
  {
    id: 'anything',
    label: 'Give me anything',
    prompt: '',
    icon: MessageCircleMore,
  },
]

export const AI_CHAT_INPUT_PLACEHOLDER = 'Ask about Budapest…'

export const SUGGESTION_TOPIC_COLORS = [
  '--color-rose-pink',
  '--color-mustard-gold',
  '--color-soft-purple',
  '--color-teal',
  '--color-orange',
  '--color-blue',
] as const

export type SuggestionTopicColor = (typeof SUGGESTION_TOPIC_COLORS)[number]

export const shuffleSuggestionColors = (count: number): SuggestionTopicColor[] => {
  const pool = [...SUGGESTION_TOPIC_COLORS]

  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }

  return Array.from({ length: count }, (_, index) => pool[index % pool.length])
}
