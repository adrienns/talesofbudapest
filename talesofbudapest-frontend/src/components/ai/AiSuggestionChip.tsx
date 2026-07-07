import type { CSSProperties } from 'react'
import type { LucideIcon } from 'lucide-react'
import { SUGGESTION_TOPIC_COLORS, type SuggestionTopicColor } from '@/constants/aiChat'

type AiSuggestionChipProps = {
  label: string
  icon: LucideIcon
  colorVar?: SuggestionTopicColor
  onSelect: () => void
}

export const AiSuggestionChip = ({
  label,
  icon: Icon,
  colorVar,
  onSelect,
}: AiSuggestionChipProps) => {
  const resolvedColor = colorVar ?? SUGGESTION_TOPIC_COLORS[0]

  const chipStyle = {
    '--chip-bg': `var(${resolvedColor})`,
    backgroundColor: `var(${resolvedColor})`,
    color: '#ffffff',
    boxShadow: `4px 10px 22px -4px color-mix(in srgb, var(${resolvedColor}) 55%, transparent)`,
  } as CSSProperties

  return (
    <button
      type="button"
      onClick={onSelect}
      style={chipStyle}
      className="inline-flex w-fit items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold whitespace-nowrap text-white transition active:scale-95"
    >
      <Icon className="h-4 w-4 shrink-0 text-white" strokeWidth={1.75} aria-hidden="true" />
      {label}
    </button>
  )
}
