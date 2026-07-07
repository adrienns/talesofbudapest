import type { Landmark } from './landmark'
import type { NarrativeChapter, NarrativeRoute } from './narrative'

export type MapViewProps = {
  landmarks: Landmark[]
  selectedLandmarkId: string | null
  onLandmarkSelect: (landmark: Landmark) => void
  activeRoute?: NarrativeRoute | null
  selectedChapterId?: string | null
  onChapterSelect?: (chapter: NarrativeChapter) => void
  showLandmarks?: boolean
}

export type MapCenter = [number, number]
