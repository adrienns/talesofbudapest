'use client'

import { Check, type LucideIcon } from 'lucide-react'
import type { CSSProperties } from 'react'
import { TOPIC_COLORS } from '@/constants/questionnaire'

type QuestionnaireChoiceCardProps = {
  icon: LucideIcon
  label: string
  description?: string
  colorIndex: number
  selected: boolean
  onSelect: () => void
  variant: 'style' | 'topic'
}

const optionStyle = (index: number): CSSProperties => ({
  backgroundColor: `var(${TOPIC_COLORS[index % TOPIC_COLORS.length]})`,
  animationDelay: `${index * 45}ms`,
})

export const QuestionnaireChoiceCard = ({
  icon: Icon,
  label,
  description,
  colorIndex,
  selected,
  onSelect,
  variant,
}: QuestionnaireChoiceCardProps) => {
  const isStyle = variant === 'style'

  return (
    <button
      type="button"
      onClick={onSelect}
      style={optionStyle(colorIndex)}
      aria-pressed={selected}
      className={`relative overflow-hidden rounded-2xl shadow-md shadow-black/30 text-center  text-white transition active:scale-95 ${
        isStyle
          ? `aspect-square min-w-0 px-2 py-3 ${selected ? 'ring-2 ring-on-surface ring-offset-2' : ''}`
          : `flex min-h-28 flex-col items-center justify-center gap-2 px-3 py-3 ${selected ? 'ring-2 ring-on-surface ring-offset-2' : 'opacity-90'}`
      }`}
    >
      {selected && !isStyle && (
        <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white/25">
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      )}
      {isStyle ? (
        <span className="flex h-full flex-col items-center justify-center gap-2">
          <span className="rounded-full bg-white/20 p-2">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <b className="block text-xs leading-tight sm:text-sm">{label}</b>
            {description && <span className="mt-1 block text-[0.625rem] leading-tight text-white/75 sm:text-xs">{description}</span>}
          </span>
        </span>
      ) : (
        <>
          <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span className="text-xs font-bold leading-tight">{label}</span>
        </>
      )}
    </button>
  )
}
