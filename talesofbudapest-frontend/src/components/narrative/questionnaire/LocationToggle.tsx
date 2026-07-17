'use client'

import { MapPin } from 'lucide-react'
import type { QuestionnaireLocationStatus } from '@/hooks/useQuestionnaire'

type LocationToggleProps = {
  nearMe: boolean
  locationStatus: QuestionnaireLocationStatus
  onToggle: () => void
  label: string
  requestingLabel: string
}

export const LocationToggle = ({
  nearMe,
  locationStatus,
  onToggle,
  label,
  requestingLabel,
}: LocationToggleProps) => (
  <button
    type="button"
    onClick={() => void onToggle()}
    disabled={locationStatus === 'requesting'}
    aria-pressed={nearMe}
    className={`mx-auto inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${
      nearMe ? 'bg-[var(--map-teal)] text-white' : 'glass-surface text-on-surface/70'
    }`}
  >
    <MapPin className="h-4 w-4" aria-hidden="true" />
    {locationStatus === 'requesting' ? requestingLabel : label}
  </button>
)
