'use client'

import { TOUR_DURATIONS, formatMinutesShort } from '@/constants/questionnaire'

type DurationPickerProps = {
  value: number
  onChange: (minutes: number) => void
  label: string
  hint: string
}

export const DurationPicker = ({ value, onChange, label, hint }: DurationPickerProps) => (
  <section>
    <div className="mb-3 flex items-center justify-between">
      <h3 className="font-bold text-on-surface">{label}</h3>
      <span className="q-duration-chip rounded-full px-3 py-1 text-sm font-bold">{formatMinutesShort(value)}</span>
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
