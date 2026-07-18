'use client'

import { Loader2, Search } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { Dropdown } from '@/components/ui/Dropdown'
import { useLandmarkSearch } from '@/features/landmarks/hooks/useLandmarkSearch'
import type { AppLocale } from '@/types/locale'
import type { MapPin } from '@/types/landmark'

type PlaceSearchProps = {
  onSelect: (pin: MapPin) => void
}

export const PlaceSearch = ({ onSelect }: PlaceSearchProps) => {
  const locale = useLocale() as AppLocale
  const t = useTranslations('search')
  const [isOpen, setIsOpen] = useState(false)
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const search = useLandmarkSearch(value, locale, isOpen)
  const visiblePins = value.trim().length === 0 ? search.pins.slice(0, 4) : search.pins

  useEffect(() => {
    if (!isOpen) return
    inputRef.current?.focus()
  }, [isOpen])

  const selectPin = (pin: MapPin) => {
    setIsOpen(false)
    setValue('')
    onSelect(pin)
  }

  const locationSummary = (pin: MapPin) => {
    if (/fisherman|stephen|gell[eé]rt/i.test(pin.name)) {
      return 'UNESCO World Heritage, Buda Side'
    }
    if (/parliament|buda castle/i.test(pin.name)) {
      return 'Historical Landmark, Pest Side'
    }
    const kind = pin.importance_tier === 'featured' || pin.source === 'iconic'
      ? 'Historical Landmark'
      : (pin.landmark_type ?? 'Landmark')
        .replaceAll('_', ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
    const side = pin.lng < 19.0445 ? 'Buda Side' : 'Pest Side'
    return `${kind}, ${side}`
  }

  const displayName = (pin: MapPin) => pin.name === 'Hungarian Parliament Building' ? 'Parliament Building' : pin.name

  return (
    <Dropdown
      open={isOpen}
      onOpenChange={setIsOpen}
      trigger={isOpen ? (
        <form
          role="search"
          data-place-search="active"
          className="map-search-pill flex h-12 w-full items-center gap-3 rounded-full px-4"
          onSubmit={(event) => event.preventDefault()}
        >
          <Search className="h-5 w-5 shrink-0 text-[var(--map-teal)]" aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            value={value}
            onChange={(event) => setValue(event.target.value.slice(0, 80))}
            placeholder={t('placeholder')}
            aria-label={t('placeholder')}
            aria-expanded="true"
            aria-haspopup="listbox"
            aria-controls="place-search-results"
            className="min-w-0 flex-1 bg-transparent text-[1.05rem] font-medium text-on-surface outline-none placeholder:text-on-surface/45"
          />
          {search.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-on-surface/45" aria-label={t('loading')} />
          ) : null}
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label={t('placeholder')}
          aria-expanded="false"
          aria-haspopup="listbox"
          aria-controls="place-search-results"
          className="map-search-pill flex h-12 w-full items-center gap-3 rounded-full px-4 text-left"
        >
          <Search className="h-5 w-5 shrink-0 text-[var(--map-teal)]" strokeWidth={2} aria-hidden="true" />
          <span className="truncate text-[1.05rem] font-medium text-on-surface/60">{t('placeholder')}</span>
        </button>
      )}
      panelProps={{
        id: 'place-search-results',
        role: 'listbox',
        'aria-label': t('results'),
        className: 'scrollbar-hide max-h-[min(18rem,calc(100dvh-8rem))] overflow-y-auto p-2',
      }}
    >
      {value.trim().length === 1 && (
        <p className="p-3 text-sm text-on-surface/60">{t('helper')}</p>
      )}

      {search.error && value.trim().length !== 1 && (
        <div className="p-3">
          <p className="text-sm text-on-surface">{t('error')}</p>
          <button type="button" onClick={() => search.retry()} className="mt-2 text-sm font-bold text-accent">
            {t('retry')}
          </button>
        </div>
      )}

      {value.trim().length >= 2 && !search.isLoading && !search.error && search.pins.length === 0 && search.query === value.trim() && (
        <p className="p-3 text-sm text-on-surface/60">{t('empty')}</p>
      )}

      {visiblePins.length > 0 && (
        <ul className="search-result-list px-1">
          {visiblePins.map((pin, index) => (
            <li key={pin.id}>
              <button
                type="button"
                role="option"
                onClick={() => selectPin(pin)}
                className="group flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-white/40 active:scale-[0.99]"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center" aria-hidden="true">
                  <span className={`search-result-pin ${index % 2 === 1 ? 'search-result-pin--warm' : ''}`}>
                    <span />
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold leading-tight text-on-surface">{displayName(pin)}</span>
                  <span className="mt-0.5 block truncate text-xs text-on-surface/60">{locationSummary(pin)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dropdown>
  )
}
