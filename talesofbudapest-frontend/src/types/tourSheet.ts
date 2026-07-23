import type { ReactNode } from 'react'
import type { PlaybackTransportProps } from '@/types/audio'
import type { ImageAttribution } from '@/types/narrative'

export type SheetSnap = 'collapsed' | 'expanded'

export type TourSheetMeta = {
  locationLine?: string | null
  timingLine?: string | null
  distanceLine?: string | null
}

export type TourSheetRouteStop = {
  id: string
  title: string
  imageUrl?: string | null
}

export type TourOfflineReadiness = {
  status: 'idle' | 'preparing' | 'ready' | 'partial' | 'unavailable' | 'offline'
  cachedCount: number
  totalCount: number
}

export type TourSheetMediaProps = {
  title: string
  chapterLabel?: string
  imageUrl?: string | null
  imageAlt?: string
  imageAttribution?: ImageAttribution | null
  script?: string | null
  meta?: TourSheetMeta
  onShare?: () => void
  onDownload?: () => void
  routeStops?: TourSheetRouteStop[]
  currentStopIndex?: number
}

export type TourSheetCollapsedProps = TourSheetMediaProps &
  PlaybackTransportProps & {
    onExpand: () => void
    distanceToStopLabel?: string | null
    arrivalPlayLabel?: string | null
    onArrivalPlay?: () => void
  }

export type TourSheetExpandedProps = TourSheetMediaProps &
  PlaybackTransportProps & {
    onCollapse: () => void
    chronicleLocationId?: string | null
    offlineReadiness?: TourOfflineReadiness | null
    onPrepareOffline?: () => void
    onOpenDirections?: () => void
    onManualArrival?: () => void
    onPlayNextStop?: () => void
    onSelectRouteStop?: (stopId: string) => void
    distanceToStopLabel?: string | null
    arrivalPlayLabel?: string | null
    onArrivalPlay?: () => void
    showChapterEndPrompt?: boolean
    onContinueToNextStop?: () => void
  }

export type SwipeableTourSheetProps = {
  snap: SheetSnap
  onSnapChange: (snap: SheetSnap) => void
  hideBottomNav?: boolean
  collapsed: ReactNode
  expanded: ReactNode
  ariaLabel: string
}
