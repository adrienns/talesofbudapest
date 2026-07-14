'use client'

import { Marker } from 'react-leaflet'
import { createChapterIcon } from '@/components/map/createLandmarkIcon'
import type { NarrativeChapter } from '@/types/narrative'

type ChapterMarkerProps = {
  chapter: NarrativeChapter
  stopNumber: number
  isSelected: boolean
  onSelect: (chapter: NarrativeChapter) => void
}

export const ChapterMarker = ({ chapter, stopNumber, isSelected, onSelect }: ChapterMarkerProps) => (
  <Marker
    position={[chapter.lat, chapter.lng]}
    icon={createChapterIcon(isSelected, chapter, stopNumber)}
    zIndexOffset={isSelected ? 1000 : 0}
    riseOnHover
    eventHandlers={{
      click: () => onSelect(chapter),
    }}
  />
)
