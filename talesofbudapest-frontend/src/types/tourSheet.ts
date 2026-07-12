import type { ReactNode } from 'react'
import type { PlaybackTransportProps } from '@/types/audio'

export type SheetSnap = 'collapsed' | 'expanded'

export type TourSheetMeta = {
  locationLine?: string | null
  timingLine?: string | null
  distanceLine?: string | null
}

export type TourSheetMediaProps = {
  title: string
  subtitle?: string
  chapterLabel?: string
  imageUrl?: string | null
  imageAlt?: string
  script?: string | null
  meta?: TourSheetMeta
  onShare?: () => void
  onDownload?: () => void
}

export type TourSheetCollapsedProps = TourSheetMediaProps &
  PlaybackTransportProps & {
    onExpand: () => void
  }

export type TourSheetExpandedProps = TourSheetMediaProps &
  PlaybackTransportProps & {
    onCollapse: () => void
    chronicleLocationId?: string | null
  }

export type SwipeableTourSheetProps = {
  snap: SheetSnap
  onSnapChange: (snap: SheetSnap) => void
  hideBottomNav?: boolean
  collapsed: ReactNode
  expanded: ReactNode
  ariaLabel: string
}
