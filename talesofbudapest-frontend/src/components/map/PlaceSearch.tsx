'use client'

import { Loader2, MapPinIcon, Search, X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
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
  const search = useLandmarkSearch(value, locale)
  const suggestions = [t('suggestionParliament'), t('suggestionChainBridge'), t('suggestionCastle')]

  useEffect(() => {
    if (!isOpen) return
    inputRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  const selectPin = (pin: MapPin) => {
    setIsOpen(false)
    setValue('')
    onSelect(pin)
  }

  return (
    <div className="relative">
      {isOpen ? (
        <form
          role="search"
          className="map-search-pill flex h-12 w-full items-center gap-3 rounded-full px-4"
          onSubmit={(event) => event.preventDefault()}
        >
          <Search className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            value={value}
            onChange={(event) => setValue(event.target.value.slice(0, 80))}
            placeholder={t('placeholder')}
            aria-label={t('placeholder')}
            aria-expanded="true"
            aria-controls="place-search-results"
            className="min-w-0 flex-1 bg-transparent text-body text-on-surface outline-none placeholder:text-on-surface/45"
          />
          {search.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-on-surface/45" aria-label={t('loading')} />
          ) : null}
          <button
            type="button"
            onClick={() => (value ? setValue('') : setIsOpen(false))}
            aria-label={value ? t('clear') : t('back')}
            className="shrink-0"
          >
            <X className="h-5 w-5 text-on-surface/50" aria-hidden="true" />
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label={t('placeholder')}
          aria-expanded="false"
          className="map-search-pill flex h-12 w-full items-center gap-3 rounded-full px-4 text-left"
        >
          <Search className="h-5 w-5 shrink-0 text-[var(--map-teal)]" strokeWidth={2} aria-hidden="true" />
          <span className="truncate text-body font-medium text-on-surface/60">{t('placeholder')}</span>
        </button>
      )}

      {isOpen && (
        <section
          id="place-search-results"
          role="listbox"
          aria-label={t('results')}
          className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-50 max-h-[min(22rem,calc(100dvh-11rem))] overflow-y-auto rounded-2xl border border-outline-variant/35 bg-surface p-2 shadow-xl"
        >
          {value.trim().length < 2 && (
            <div className="p-2">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-on-surface/45">{t('helper')}</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setValue(suggestion)}
                    className="rounded-full bg-surface-dim px-3 py-2 text-sm font-semibold text-on-surface transition hover:bg-accent/10"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {value.trim().length >= 2 && search.error && (
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

          {search.pins.length > 0 && (
            <ul className="flex flex-col gap-1">
              {search.pins.map((pin) => (
                <li key={pin.id}>
                  <button
                    type="button"
                    role="option"
                    onClick={() => selectPin(pin)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-surface-dim active:scale-[0.99]"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                      <MapPinIcon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-on-surface">{pin.name}</span>
                      {pin.landmark_type && (
                        <span className="mt-0.5 block truncate text-xs capitalize text-on-surface/50">{pin.landmark_type}</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
