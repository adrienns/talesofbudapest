'use client'

import { Marker } from '@vis.gl/react-maplibre'
import { MapPhotoMarker } from '@/components/map/MapMarkerVisual'
import type { NarrativeChapter } from '@/types/narrative'

type ChapterMarkerProps = {
  chapter: NarrativeChapter
  stopNumber: number
  isSelected: boolean
  onSelect: (chapter: NarrativeChapter) => void
}

export const ChapterMarker = ({ chapter, stopNumber, isSelected, onSelect }: ChapterMarkerProps) => (
  <Marker
    longitude={chapter.lng}
    latitude={chapter.lat}
    anchor="bottom"
    style={{ zIndex: isSelected ? 40 : 25 }}
    onClick={(event) => {
      event.originalEvent.stopPropagation()
      onSelect(chapter)
    }}
  >
    <MapPhotoMarker
      landmark={{
        name: chapter.title,
        image_url: chapter.imageUrl,
        map_theme: 'history',
        landmark_type: 'monument',
      }}
      isSelected={isSelected}
      stopNumber={stopNumber}
    />
  </Marker>
)
