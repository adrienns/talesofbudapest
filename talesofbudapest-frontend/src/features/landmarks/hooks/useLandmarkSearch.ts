'use client'

import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { searchLandmarks } from '@/services/landmarkSearchService'
import { queryKeys } from '@/services/queryKeys'
import type { AppLocale } from '@/types/locale'

export const useLandmarkSearch = (query: string, locale: AppLocale, enabled = true) => {
  const [debouncedQuery, setDebouncedQuery] = useState(query.trim())
  const canSearch = enabled && (debouncedQuery.length === 0 || debouncedQuery.length >= 2)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [query])

  const result = useQuery({
    queryKey: queryKeys.landmarkSearch(locale, debouncedQuery),
    queryFn: ({ signal }) => searchLandmarks(debouncedQuery, locale, signal),
    enabled: canSearch,
    retry: 1,
  })

  return {
    query: debouncedQuery,
    pins: result.data ?? [],
    isLoading: result.isFetching,
    error: result.error instanceof Error ? result.error.message : null,
    retry: result.refetch,
  }
}
