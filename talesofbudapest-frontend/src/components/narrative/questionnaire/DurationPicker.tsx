'use client'

import type { ReactNode } from 'react'
import { TOUR_DURATIONS, formatMinutesShort } from '@/constants/questionnaire'

type DurationPickerProps = {
  value: number
  onChange: (minutes: number) => void
  label: string
  hint: string
  headerAction?: ReactNode
}

export const DurationPicker = ({ value, onChange, label, hint, headerAction }: DurationPickerProps) => (
  <section>
    <div className="mb-3 flex items-center justify-between gap-4">
      <h3 className="min-w-0 font-bold text-on-surface">{label}</h3>
      {headerAction}
    </div>
    <input
      type="range"
      min="0"
      max={TOUR_DURATIONS.length - 1}
      step="1"
      value={TOUR_DURATIONS.indexOf(value as typeof TOUR_DURATIONS[number])}
      onChange={(event) => onChange(TOUR_DURATIONS[Number(event.target.value)])}
      className="w-full accent-[var(--map-teal)]"
      aria-label={label}
    />
    <div className="mt-2 flex justify-between text-xs text-on-surface/55">
      {TOUR_DURATIONS.map((minutes) => <span key={minutes}>{formatMinutesShort(minutes)}</span>)}
    </div>
    <p className="mt-3 text-sm text-on-surface/60">{hint}</p>
  </section>
)
