import type { MapPin } from './landmark'
import type { NarrativeChapter, NarrativeRoute, WalkingRoute } from './narrative'

export type MapViewProps = {
  selectedLandmarkId: string | null
  onLandmarkSelect: (landmark: MapPin) => void
  activeRoute?: NarrativeRoute | null
  selectedChapterId?: string | null
  onChapterSelect?: (chapter: NarrativeChapter) => void
  showLandmarks?: boolean
  temporaryRoute?: WalkingRoute | null
}

export type MapCenter = [number, number]
