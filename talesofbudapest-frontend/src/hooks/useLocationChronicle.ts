'use client'

import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/services/queryKeys'
import type { LocationChronicle } from '@/types/chronicle'

export const useLocationChronicle = (locationId: string | null) => {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.chronicle(locationId ?? ''),
    queryFn: async ({ signal }) => {
      const result = await fetch(`/api/locations/${encodeURIComponent(locationId!)}/chronicle`, {
        signal,
      })
      if (!result.ok) throw new Error(`Chronicle request failed: ${result.status}`)
      return result.json() as Promise<LocationChronicle>
    },
    enabled: Boolean(locationId),
  })

  return {
    chronicle: data ?? null,
    isLoading,
  }
}
