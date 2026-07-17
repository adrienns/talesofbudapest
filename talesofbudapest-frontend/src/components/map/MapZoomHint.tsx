'use client'

import { useTranslations } from 'next-intl'
import { useMapSettingsStore } from '@/stores/mapSettingsStore'
import { PIN_REVEAL_ZOOM } from '@/lib/map/visibleLandmarks'

type MapZoomHintProps = {
  zoom: number
  showAllBuildings: boolean
}

export const MapZoomHint = ({ zoom, showAllBuildings }: MapZoomHintProps) => {
  const t = useTranslations('map')
  const hintDismissed = useMapSettingsStore((state) => state.hintDismissed)
  const dismissHint = useMapSettingsStore((state) => state.dismissHint)

  if (hintDismissed || showAllBuildings || zoom >= PIN_REVEAL_ZOOM) {
    return null
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-20 flex justify-center px-4">
      <div className="pointer-events-auto flex max-w-sm items-center gap-3 rounded-full border border-outline-variant/40 bg-surface/95 px-4 py-2 text-sm text-on-surface shadow-lg backdrop-blur">
        <span>{t('zoomHint')}</span>
        <button
          type="button"
          onClick={dismissHint}
          className="shrink-0 text-on-surface/55 transition hover:text-on-surface"
          aria-label={t('dismissHint')}
        >
          ×
        </button>
      </div>
    </div>
  )
}
