import type { LucideIcon } from 'lucide-react'
import {
  Building2,
  Camera,
  Coffee,
  Crown,
  Drama,
  Glasses,
  Landmark,
  Martini,
  Music2,
  ShipWheel,
  Sparkles,
  Sunset,
} from 'lucide-react'

export const TOPIC_COLORS = [
  '--color-rose-pink',
  '--color-mustard-gold',
  '--color-soft-purple',
  '--color-teal',
  '--color-orange',
  '--color-blue',
] as const

export type TopicColor = (typeof TOPIC_COLORS)[number]

export type TourStyle = {
  id: string
  label: string
  blurb: string
  icon: LucideIcon
  /** Multiplier applied to the summed topic minutes. */
  modifier: number
  /** "{adjective} … {noun}" pair used by the recap sentence. */
  recapAdjective: string
  recapNoun: string
}

export type TourTopic = {
  id: string
  label: string
  icon: LucideIcon
}

export const TOUR_STYLES: TourStyle[] = [
  {
    id: 'easy',
    label: 'Easy & Visual',
    blurb: 'Light pacing, photo-worthy stops',
    icon: Camera,
    modifier: 0.75,
    recapAdjective: 'breezy',
    recapNoun: 'stroll',
  },
  {
    id: 'storyteller',
    label: 'The Storyteller',
    blurb: 'Legends, characters and drama',
    icon: Drama,
    modifier: 1,
    recapAdjective: 'tailored',
    recapNoun: 'trek',
  },
  {
    id: 'deep-dive',
    label: 'Historian Deep Dive',
    blurb: 'Rich context, archival detail',
    icon: Glasses,
    modifier: 1.5,
    recapAdjective: 'comprehensive',
    recapNoun: 'exploration',
  },
]

export const TOUR_TOPICS: TourTopic[] = [
  {
    id: 'architecture', label: 'Architecture & design', icon: Building2,
  },
  {
    id: 'local-life', label: 'Local life & neighborhoods', icon: Coffee,
  },
  {
    id: 'power-history', label: 'Kings, politics & revolutions', icon: Crown,
  },
  {
    id: 'jewish-budapest', label: 'Jewish Budapest', icon: Landmark,
  },
  {
    id: 'arts-culture', label: 'Artists, writers & music', icon: Music2,
  },
  {
    id: 'food-nightlife', label: 'Food, cafés & nightlife', icon: Martini,
  },
  {
    id: 'danube-engineering', label: 'Danube, bridges & engineering', icon: ShipWheel,
  },
  {
    id: 'legends-mysteries', label: 'Legends, scandals & mysteries', icon: Sparkles,
  },
]

export const MAX_TOPICS = 3

export const TOUR_DURATIONS = [45, 60, 90, 120, 180] as const
export const DEFAULT_TOUR_MINUTES = 90

/** "≈ 2 h 30" — compact form for the live chip and adjuster. */
export const formatMinutesShort = (minutes: number): string => {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest} min`
  if (rest === 0) return `${hours} h`
  return `${hours} h ${rest.toString().padStart(2, '0')}`
}

/**
 * One-tap starters modeled on the most-booked Budapest tour themes (icons,
 * Castle District, Jewish Quarter & ruin bars, hidden Pest, golden-hour
 * Danube). These skip the questionnaire and skip the route preview — the
 * fixed prompt is trusted, and repeat taps hit the generation cache.
 */
type CuratedStarterBase = {
  slug: string
  imageSrc: string
  icon: LucideIcon
  styleId: string
  topicIds: string[]
}

export type FixedCuratedStarter = CuratedStarterBase & {
  kind: 'fixed'
  titleKey: string
  taglineKey: string
  imageAltKey: string
}

export type GeneratedCuratedStarter = CuratedStarterBase & {
  kind: 'generated'
  title: string
  tagline: string
  imageAlt: string
}

export type CuratedStarter = FixedCuratedStarter | GeneratedCuratedStarter

export const CURATED_STARTERS: CuratedStarter[] = [
  {
    kind: 'fixed',
    slug: 'how-budapest-became-budapest',
    titleKey: 'quickStarts.flagshipTitle',
    taglineKey: 'quickStarts.flagshipTagline',
    imageAltKey: 'quickStarts.flagshipImageAlt',
    imageSrc: '/quick-start/parliement.webp',
    icon: Camera,
    styleId: 'easy',
    topicIds: ['architecture'],
  },
  {
    kind: 'generated',
    slug: 'castle-royal',
    title: 'Castle District Royal Walk',
    tagline: '~2 h · kings, sieges & legends',
    imageSrc: '/quick-start/royal_castle.webp',
    imageAlt: "Fisherman's Bastion on the Buda Castle hill",
    icon: Crown,
    styleId: 'storyteller',
    topicIds: ['duel'],
  },
  {
    kind: 'generated',
    slug: 'jewish-quarter-ruin-bars',
    title: 'Jewish Quarter & Ruin Bars',
    tagline: '~2 h · memory meets nightlife',
    imageSrc: '/quick-start/dohany_street_synagogue.webp',
    imageAlt: 'Dohány Street Synagogue in Budapest',
    icon: Martini,
    styleId: 'storyteller',
    topicIds: ['shadows', 'liquid'],
  },
  {
    kind: 'generated',
    slug: 'hidden-pest',
    title: 'Hidden Corners of Pest',
    tagline: '~2.5 h · gems most visitors miss',
    imageSrc: '/quick-start/hidden-pest.webp',
    imageAlt: 'Vörösmarty Square in central Pest',
    icon: Sparkles,
    styleId: 'deep-dive',
    topicIds: ['coffeehouse'],
  },
  {
    kind: 'generated',
    slug: 'danube-golden-hour',
    title: 'Danube at Golden Hour',
    tagline: '~1.5 h · riverside romance',
    imageSrc: '/quick-start/danube-golden-hour.webp',
    imageAlt: 'Széchenyi Chain Bridge over the Danube in Budapest',
    icon: Sunset,
    styleId: 'storyteller',
    topicIds: ['duel'],
  },
]
