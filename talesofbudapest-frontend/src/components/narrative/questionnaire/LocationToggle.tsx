'use client'

import { MapPin } from 'lucide-react'
import type { QuestionnaireLocationStatus } from '@/hooks/useQuestionnaire'

type LocationToggleProps = {
  nearMe: boolean
  locationStatus: QuestionnaireLocationStatus
  onToggle: () => Promise<void>
  label: string
  requestingLabel: string
}

export const LocationToggle = ({
  nearMe,
  locationStatus,
  onToggle,
  label,
  requestingLabel,
}: LocationToggleProps) => {
  const isRequesting = locationStatus === 'requesting'

  return (
    <div className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-on-surface/70">
      <MapPin className="h-4 w-4" aria-hidden="true" />
      <span>{isRequesting ? requestingLabel : label}</span>
      <button
        type="button"
        role="switch"
        onClick={() => void onToggle()}
        aria-checked={nearMe}
        aria-busy={isRequesting}
        aria-label={isRequesting ? requestingLabel : label}
        className={`inline-flex h-7 w-12 items-center rounded-full p-0.5 transition-colors ${
          nearMe ? 'bg-[var(--map-teal)]' : 'bg-on-surface/20'
        }`}
      >
        <span
          aria-hidden="true"
          className={`h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${
            nearMe ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}
