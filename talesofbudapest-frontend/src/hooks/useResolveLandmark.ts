'use client'

import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useLocale } from 'next-intl'
import { getLandmarkById } from '@/services/repositories/landmarksRepository'
import { queryKeys } from '@/services/queryKeys'
import type { AppLocale } from '@/types/locale'
import type { Landmark, MapPin } from '@/types/landmark'

export const useResolveLandmark = () => {
  const locale = useLocale() as AppLocale
  const queryClient = useQueryClient()

  const resolveLandmark = useCallback(
    async (pin: MapPin): Promise<Landmark> => {
      const detail = await queryClient.ensureQueryData({
        queryKey: queryKeys.landmarkDetail(pin.id, locale),
        queryFn: () => getLandmarkById(pin.id, locale),
      })

      if (!detail) {
        return {
          ...pin,
          story_prompt: '',
          images: pin.image_url ? [{ url: pin.image_url, alt: pin.name }] : [],
        }
      }

      return detail
    },
    [queryClient, locale],
  )

  return { resolveLandmark }
}
