'use client'

import { Marker } from 'react-leaflet'
import { createChapterIcon } from '@/components/map/createLandmarkIcon'
import type { NarrativeChapter } from '@/types/narrative'

type ChapterMarkerProps = {
  chapter: NarrativeChapter
  isSelected: boolean
  onSelect: (chapter: NarrativeChapter) => void
}

export const ChapterMarker = ({ chapter, isSelected, onSelect }: ChapterMarkerProps) => (
  <Marker
    position={[chapter.lat, chapter.lng]}
    icon={createChapterIcon(isSelected, chapter.chapterIndex + 1)}
    eventHandlers={{
      click: () => onSelect(chapter),
    }}
  />
)
