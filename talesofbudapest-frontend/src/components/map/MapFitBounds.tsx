'use client'

import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import type { NarrativeChapter } from '@/types/narrative'

type MapFitBoundsProps = {
  chapters: NarrativeChapter[]
  triggerKey?: string
}

export const MapFitBounds = ({ chapters, triggerKey }: MapFitBoundsProps) => {
  const map = useMap()

  useEffect(() => {
    if (chapters.length === 0) {
      return
    }

    const bounds = chapters.map((chapter) => [chapter.lat, chapter.lng] as [number, number])
    map.fitBounds(bounds, { padding: [80, 80], maxZoom: 15, animate: true })
  }, [chapters, map, triggerKey])

  return null
}
