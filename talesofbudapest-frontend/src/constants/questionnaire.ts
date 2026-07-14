import type { LucideIcon } from 'lucide-react'
import {
  Building2,
  Camera,
  Coffee,
  Compass,
  Crown,
  Drama,
  Glasses,
  Martini,
  Shield,
  Sparkles,
  Sunset,
  Waves,
  Wine,
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
  /** Woven into the generation prompt. */
  promptPhrase: string
  /** "{adjective} … {noun}" pair used by the recap sentence. */
  recapAdjective: string
  recapNoun: string
}

export type GeoCluster = 'buda-castle' | 'pest-core' | 'district7' | 'citywide'

export type TopicTip = 'camera' | 'shoes' | 'coffee' | 'thirst' | 'reflective'

export type TourTopic = {
  id: string
  label: string
  icon: LucideIcon
  /** Standalone exploration time at storyteller pace. */
  baseMinutes: number
  /** Neighbourhood footprint — overlapping topics get a time discount. */
  geoCluster: GeoCluster
  tip: TopicTip
  /** Woven into the generation prompt. */
  promptPhrase: string
}

export const TOUR_STYLES: TourStyle[] = [
  {
    id: 'easy',
    label: 'Easy & Visual',
    blurb: 'Light pacing, photo-worthy stops',
    icon: Camera,
    modifier: 0.75,
    promptPhrase: 'light, visual',
    recapAdjective: 'breezy',
    recapNoun: 'stroll',
  },
  {
    id: 'storyteller',
    label: 'The Storyteller',
    blurb: 'Legends, characters and drama',
    icon: Drama,
    modifier: 1,
    promptPhrase: 'vivid, story-driven',
    recapAdjective: 'tailored',
    recapNoun: 'trek',
  },
  {
    id: 'deep-dive',
    label: 'Historian Deep Dive',
    blurb: 'Rich context, archival detail',
    icon: Glasses,
    modifier: 1.5,
    promptPhrase: 'richly detailed, historian-grade',
    recapAdjective: 'comprehensive',
    recapNoun: 'exploration',
  },
]

export const TOUR_TOPICS: TourTopic[] = [
  {
    id: 'underground',
    label: 'Underground Budapest & Thermal Secrets',
    icon: Waves,
    baseMinutes: 105,
    geoCluster: 'buda-castle',
    tip: 'shoes',
    promptPhrase:
      'the labyrinth beneath Buda Castle, thermal bath culture and Cold War bunkers',
  },
  {
    id: 'shadows',
    label: 'Shadows of the 20th Century',
    icon: Shield,
    baseMinutes: 90,
    geoCluster: 'pest-core',
    tip: 'reflective',
    promptPhrase:
      'the scars of WWII and communism, the Jewish Quarter and the 1956 revolution',
  },
  {
    id: 'duel',
    label: 'The Duel of Two Cities',
    icon: Compass,
    baseMinutes: 80,
    geoCluster: 'citywide',
    tip: 'shoes',
    promptPhrase:
      'the architectural rivalry between royal medieval Buda and booming 19th-century Pest',
  },
  {
    id: 'architecture',
    label: 'Gilded Age Masterpieces',
    icon: Building2,
    baseMinutes: 75,
    geoCluster: 'pest-core',
    tip: 'camera',
    promptPhrase:
      'gilded age splendor from the Opera House and Basilica to the Parliament',
  },
  {
    id: 'liquid',
    label: 'Liquid History: Ruin Bars & Wine',
    icon: Wine,
    baseMinutes: 40,
    geoCluster: 'district7',
    tip: 'thirst',
    promptPhrase:
      "District VII's ruin bars born from abandoned WWII spaces, with Tokaj wine and Unicum lore",
  },
  {
    id: 'coffeehouse',
    label: "Coffeehouse Culture & Writers' Secrets",
    icon: Coffee,
    baseMinutes: 30,
    geoCluster: 'pest-core',
    tip: 'coffee',
    promptPhrase:
      'the golden age coffeehouses where writers, artists and rebels plotted',
  },
]

export const MAX_TOPICS = 2

export const MIN_TOUR_MINUTES = 45
export const MAX_TOUR_MINUTES = 240
export const TOUR_MINUTES_STEP = 30

/** Fixed getting-started / transit overhead baked into every tour. */
const BASE_OVERHEAD_MINUTES = 30
/** Discount applied to additional topics sharing a geo cluster. */
const CLUSTER_OVERLAP_FACTOR = 0.5

const roundTo15 = (minutes: number) => Math.round(minutes / 15) * 15

const clampMinutes = (minutes: number) =>
  Math.min(MAX_TOUR_MINUTES, Math.max(MIN_TOUR_MINUTES, minutes))

/**
 * Estimates the ideal tour duration: topics sum with an overlap discount for
 * shared neighbourhoods, then the style's pacing modifier is applied.
 */
export const estimateTourMinutes = (style: TourStyle, topics: TourTopic[]): number => {
  const seenClusters = new Set<GeoCluster>()
  const sum = [...topics]
    .sort((a, b) => b.baseMinutes - a.baseMinutes)
    .reduce((total, topic) => {
      const overlaps = seenClusters.has(topic.geoCluster)
      seenClusters.add(topic.geoCluster)
      return total + topic.baseMinutes * (overlaps ? CLUSTER_OVERLAP_FACTOR : 1)
    }, 0)

  return clampMinutes(roundTo15((BASE_OVERHEAD_MINUTES + sum) * style.modifier))
}

/** "≈ 2 h 30" — compact form for the live chip and adjuster. */
export const formatMinutesShort = (minutes: number): string => {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest} min`
  if (rest === 0) return `${hours} h`
  return `${hours} h ${rest.toString().padStart(2, '0')}`
}

/** "1.5-hour" / "45-minute" — adjective form for the recap sentence. */
const formatMinutesProse = (minutes: number): string => {
  if (minutes % 30 === 0) return `${minutes / 60}-hour`
  return `${minutes}-minute`
}

/** "1.5 hours" / "45 minutes" — noun form for the generation prompt. */
const formatMinutesNoun = (minutes: number): string => {
  if (minutes % 30 === 0) {
    const hours = minutes / 60
    return `${hours} hour${hours === 1 ? '' : 's'}`
  }
  return `${minutes} minutes`
}

const CLUSTER_DISPLAY: Record<GeoCluster, string> = {
  'buda-castle': "the Castle's hidden depths",
  'pest-core': 'the heart of Pest',
  district7: "District VII's storied ruins",
  citywide: 'both banks of the Danube',
}

const TIP_SENTENCES: Record<TopicTip, string> = {
  camera: 'Bring your camera!',
  shoes: 'Wear comfortable shoes.',
  coffee: 'It ends with a coffee recommendation.',
  thirst: 'Come thirsty.',
  reflective: 'Expect stories that stay with you.',
}

const joinPhrases = (phrases: string[]): string =>
  phrases.length <= 1 ? (phrases[0] ?? '') : `${phrases.slice(0, -1).join(', ')} and ${phrases[phrases.length - 1]}`

/** Deterministic, personalized recap line — no LLM round-trip needed. */
export const buildRecap = (style: TourStyle, topics: TourTopic[], minutes: number): string => {
  const clusters = joinPhrases([...new Set(topics.map((t) => CLUSTER_DISPLAY[t.geoCluster]))])
  const heaviest = [...topics].sort((a, b) => b.baseMinutes - a.baseMinutes)[0]
  const tip = heaviest ? TIP_SENTENCES[heaviest.tip] : ''

  return `We've crafted a ${style.recapAdjective} ${formatMinutesProse(minutes)} ${style.recapNoun} through ${clusters}. ${tip}`
}

/** Weaves the picks into a single natural-language prompt for the generator. */
export const composeNarrativePrompt = (
  style: TourStyle,
  topics: TourTopic[],
  minutes: number,
): string => {
  const themes = joinPhrases(topics.map((t) => t.promptPhrase))
  return `Create a ${style.promptPhrase} Budapest audio walking tour exploring ${themes}, sized for about ${formatMinutesNoun(minutes)} of walking and listening.`
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
  prompt: string
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
    prompt:
      'Create a vivid, story-driven audio walking tour of the Buda Castle District — Buda Castle, Matthias Church, and Fisherman’s Bastion — full of royal history, sieges, and the legends that still haunt the hill. [v2]',
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
    prompt:
      "Create a vivid, story-driven audio walking tour of District VII's Jewish Quarter — the Dohány Street Synagogue, Kazinczy Street, and the Gozsdu Passage — tracing its history and how its ruined WWII-era spaces became the world's first ruin bars. [v2]",
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
    prompt:
      'Create a richly detailed, historian-grade audio walking tour of downtown Pest that skips the famous landmarks in favor of lesser-known residential buildings, hidden courtyards, and golden-age coffeehouses with real, specific local history. [v2]',
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
    prompt:
      'Create a vivid, story-driven evening audio walking tour along the Danube at golden hour, taking in the Chain Bridge and the view of Buda Castle across the water, with romantic and reflective storytelling. [v2]',
  },
]
