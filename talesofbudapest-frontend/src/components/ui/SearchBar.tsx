'use client'

import { Search, SlidersHorizontal } from 'lucide-react'
import { MAP_SEARCH_PLACEHOLDER } from '@/constants/search'
import type { SearchBarProps } from '@/types/search'

export const SearchBar = ({
  value,
  onChange,
  placeholder = MAP_SEARCH_PLACEHOLDER,
  onFilterClick,
  filterAriaLabel = 'Open archival filters',
  showFilter = true,
}: SearchBarProps) => (
  <form
    role="search"
    className="flex h-12 w-full items-center gap-3 rounded-full border border-outline-variant/60 bg-surface/95 px-4 shadow-sm shadow-primary/5 backdrop-blur-sm"
    onSubmit={(event) => event.preventDefault()}
  >
    <Search className="h-5 w-5 shrink-0 text-accent" strokeWidth={2} aria-hidden="true" />
    <input
      type="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className="min-w-0 flex-1 bg-transparent text-body text-on-surface placeholder:text-on-surface/45 focus:outline-none"
    />
    {showFilter && (
      <button
        type="button"
        onClick={onFilterClick}
        aria-label={filterAriaLabel}
        className="ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-on-surface/60 transition active:scale-95 active:bg-surface-dim active:text-accent"
      >
        <SlidersHorizontal className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
      </button>
    )}
  </form>
)
