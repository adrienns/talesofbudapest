import type { MapPin } from './landmark'
import type { NarrativeChapter, NarrativeRoute, WalkingRoute } from './narrative'

export type MapViewProps = {
  selectedLandmarkId: string | null
  focusLandmark?: MapPin | null
  onCenterChange?: (center: { lat: number; lng: number }) => void
  onLandmarkSelect: (landmark: MapPin) => void
  activeRoute?: NarrativeRoute | null
  selectedChapterId?: string | null
  onChapterSelect?: (chapter: NarrativeChapter) => void
  showLandmarks?: boolean
  temporaryRoute?: WalkingRoute | null
  userPosition?: { lat: number; lng: number } | null
  showUserPosition?: boolean
}

export type MapCenter = [number, number]
