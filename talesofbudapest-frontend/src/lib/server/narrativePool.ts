/**
 * Ranks the full landmarks table down to a small pool before it reaches the
 * route-planning LLM. Without this, `/api/narratives/generate` used to
 * serialize all 1000+ rows (including budapest100 houses) into one prompt —
 * the questionnaire's style/topic answers had almost no effect on the result.
 */

import { haversineKm } from '@/lib/geo/haversine'

export type PoolStyleId = 'easy' | 'storyteller' | 'deep-dive'

export type PoolContext = {
  styleId?: string
  topicIds?: string[]
  nearMe?: boolean
  userLat?: number | null
  userLng?: number | null
}

export type PoolRow = {
  id: string | number
  name: string
  latitude: number
  longitude: number
  story_prompt?: string | null
  source?: string | null
  landmark_type?: string | null
  importance_tier?: string | null
  importance_score?: number | null
  history_depth?: string | null
}

type GeoCluster = 'buda-castle' | 'pest-core' | 'district7' | 'citywide'

const CLUSTER_CENTROIDS: Record<Exclude<GeoCluster, 'citywide'>, { lat: number; lng: number }> = {
  'buda-castle': { lat: 47.4969, lng: 19.0396 },
  'pest-core': { lat: 47.5, lng: 19.055 },
  district7: { lat: 47.501, lng: 19.064 },
}

/**
 * English + Hungarian keywords per topic — most budapest100/muemlekem source
 * texts are Hungarian, so English-only terms would rarely match (worse: short
 * English words like "war" false-positive inside Hungarian surnames such as
 * "Schwartz"). Keywords are matched as substrings on lowercased text, so
 * prefer longer, unambiguous stems.
 */
const TOPIC_KEYWORDS: Record<string, string[]> = {
  underground: [
    'cave', 'cellar', 'bunker', 'thermal', 'labyrinth', 'underground', 'tunnel',
    'barlang', 'pince', 'termál', 'fürdő', 'labirintus', 'alagút', 'óvóhely',
  ],
  shadows: [
    'jewish', 'ghetto', 'synagogue', '1956', 'communis', 'siege', 'holocaust', 'soviet', 'revolution',
    'zsidó', 'gettó', 'zsinagóga', 'kommunis', 'ostrom', 'világháború', 'holokauszt', 'szovjet', 'forradal', 'nyilas', 'államosít', 'kitelepít',
  ],
  duel: [
    'castle', 'royal', 'medieval', 'bridge', 'danube', 'palace',
    'királyi', 'középkor', 'híd', 'duna', 'palota',
  ],
  architecture: [
    'art nouveau', 'neo-gothic', 'neoclassical', 'facade', 'architect', 'basilica', 'opera', 'parliament',
    'szecesszió', 'neogótikus', 'neoklasszi', 'homlokzat', 'építész', 'bazilika', 'parlament',
  ],
  'local-life': [
    'market', 'tenement', 'courtyard', 'residential', 'neighbourhood', 'neighborhood', 'everyday',
    'piac', 'bérház', 'udvar', 'lakó', 'negyed', 'mindennap',
  ],
  'power-history': [
    'king', 'royal', 'empire', 'revolution', 'parliament', 'siege', 'communis', 'ottoman',
    'király', 'birodal', 'forradal', 'országház', 'ostrom', 'kommunis', 'török',
  ],
  'jewish-budapest': [
    'jewish', 'ghetto', 'synagogue', 'holocaust', 'zsidó', 'gettó', 'zsinagóga', 'holokauszt',
  ],
  'arts-culture': [
    'writer', 'poet', 'artist', 'theatre', 'theater', 'opera', 'music', 'literary',
    'író', 'költő', 'művész', 'színház', 'opera', 'zene', 'irodalm',
  ],
  'food-nightlife': [
    'coffee', 'café', 'wine', 'pub', 'ruin bar', 'restaurant', 'market',
    'kávé', 'bor', 'kocsma', 'romkocsma', 'étterem', 'piac',
  ],
  'danube-engineering': [
    'danube', 'bridge', 'river', 'flood', 'engineering', 'railway',
    'duna', 'híd', 'folyó', 'árvíz', 'mérnök', 'vasút',
  ],
  'legends-mysteries': [
    'legend', 'mystery', 'ghost', 'scandal', 'crime', 'secret', 'cave', 'bunker',
    'legenda', 'rejtély', 'szellem', 'botrány', 'bűn', 'titok', 'barlang', 'bunker',
  ],
  liquid: [
    'wine', 'ruin bar', 'pub', 'tavern', 'brewery',
    'romkocsma', 'kocsma', 'borozó', 'szőlő', 'pálinka', 'unicum', 'tokaj', 'söröző',
  ],
  coffeehouse: [
    'coffee', 'café', 'writer', 'poet', 'literary', 'literat',
    'kávéház', 'kávézó', 'költő', 'irodalm', 'műveltség',
  ],
}

const TOPIC_GEO_CLUSTER: Record<string, GeoCluster> = {
  underground: 'buda-castle',
  shadows: 'pest-core',
  duel: 'citywide',
  architecture: 'pest-core',
  liquid: 'district7',
  coffeehouse: 'pest-core',
}

const TIER_WEIGHT: Record<string, number> = { featured: 1, standard: 0.6, archive: 0.3 }
const DEPTH_WEIGHT: Record<string, number> = { rich: 1, standard: 0.6, thin: 0.15 }

const normalize = (value: string): string => value.toLowerCase()

/**
 * All positions (in the original string — `normalize` is length-preserving)
 * where any keyword of the given topics occurs. Used to anchor the excerpt
 * windows on the content the landmark was actually selected for.
 */
export const findTopicHitPositions = (text: string, topicIds: string[]): number[] => {
  if (!text || topicIds.length === 0) {
    return []
  }

  const haystack = normalize(text)
  const positions: number[] = []

  for (const topicId of topicIds) {
    for (const keyword of TOPIC_KEYWORDS[topicId] ?? []) {
      let from = 0
      while (positions.length < 24) {
        const at = haystack.indexOf(keyword, from)
        if (at === -1) {
          break
        }
        positions.push(at)
        from = at + keyword.length
      }
    }
  }

  return [...new Set(positions)].sort((a, b) => a - b)
}

const WORD_SNAP_RANGE = 30
/** Every excerpt keeps this much of the opening so the LLM knows what the building is. */
const EXCERPT_LEAD_CHARS = 80

const snapStart = (text: string, index: number): number => {
  if (index <= 0) {
    return 0
  }
  const space = text.lastIndexOf(' ', index)
  return space >= 0 && space > index - WORD_SNAP_RANGE ? space + 1 : index
}

const snapEnd = (text: string, index: number): number => {
  if (index >= text.length) {
    return text.length
  }
  const space = text.indexOf(' ', index)
  return space !== -1 && space < index + WORD_SNAP_RANGE ? space : index
}

/**
 * Budget-bounded excerpt anchored on keyword hits. Long budapest100 entries
 * are biography-style — construction details first, the dramatic history
 * several paragraphs in — so "first N chars" used to cut off exactly the
 * content a topic-matched landmark was selected for.
 */
export const buildExcerpt = (text: string, hitPositions: number[], budget: number): string => {
  if (text.length <= budget) {
    return text
  }

  const leadEnd = snapEnd(text, Math.min(EXCERPT_LEAD_CHARS, budget))
  const relevantHits = hitPositions.filter((position) => position >= leadEnd)

  if (relevantHits.length === 0) {
    return text.slice(0, snapEnd(text, budget))
  }

  const remaining = Math.max(0, budget - leadEnd)
  const firstHit = relevantHits[0]
  // A second window only makes sense for a hit cluster beyond the first window's reach.
  const secondHit = relevantHits.find((position) => position > firstHit + remaining / 2)
  const windowSize = secondHit !== undefined ? Math.floor(remaining / 2) : remaining

  const makeWindow = (center: number): [number, number] => {
    const start = snapStart(text, Math.max(leadEnd, center - Math.floor(windowSize / 2)))
    const end = snapEnd(text, Math.min(text.length, start + windowSize))
    return [start, end]
  }

  const ranges: Array<[number, number]> = [[0, leadEnd], makeWindow(firstHit)]
  if (secondHit !== undefined) {
    ranges.push(makeWindow(secondHit))
  }

  ranges.sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = []
  for (const range of ranges) {
    const last = merged[merged.length - 1]
    if (last && range[0] <= last[1] + 3) {
      last[1] = Math.max(last[1], range[1])
    } else {
      merged.push([range[0], range[1]])
    }
  }

  return merged
    .map(([start, end]) => text.slice(start, end).trim())
    .filter(Boolean)
    .join(' … ')
}

const topicMatchScore = (row: PoolRow, topicIds: string[]): number => {
  if (topicIds.length === 0) {
    return 0
  }

  const haystack = normalize(`${row.name} ${row.story_prompt ?? ''}`)
  let best = 0

  for (const topicId of topicIds) {
    const keywords = TOPIC_KEYWORDS[topicId] ?? []
    const hits = keywords.reduce((count, kw) => (haystack.includes(kw) ? count + 1 : count), 0)
    let score = Math.min(1, hits / 3)

    const cluster = TOPIC_GEO_CLUSTER[topicId]
    if (cluster && cluster !== 'citywide') {
      const centroid = CLUSTER_CENTROIDS[cluster]
      const km = haversineKm(
        { lat: row.latitude, lng: row.longitude },
        centroid,
      )
      if (km <= 1.2) {
        score = Math.min(1, score + 0.3)
      }
    }

    best = Math.max(best, score)
  }

  return best
}

const styleBoost = (row: PoolRow, styleId: string | undefined): number => {
  const tier = row.importance_tier ?? 'archive'
  const depth = row.history_depth ?? 'thin'
  const isGemSource = row.source === 'budapest100' || row.source === 'muemlekem'

  if (styleId === 'easy') {
    return tier === 'featured' ? 0.8 : 0
  }

  if (styleId === 'deep-dive') {
    return isGemSource && depth === 'rich' ? 0.8 : 0
  }

  // storyteller (default): reward anything with real narrative material
  return depth !== 'thin' ? 0.4 : 0
}

/** Exported for tests — pure scoring function for a single row. */
export const scorePoolRow = (row: PoolRow, ctx: PoolContext): number => {
  const tier = row.importance_tier ?? 'archive'
  const depth = row.history_depth ?? 'thin'
  const topicIds = ctx.topicIds ?? []

  const topicScore = topicMatchScore(row, topicIds)
  const tierScore = TIER_WEIGHT[tier] ?? 0.3
  const depthScore = DEPTH_WEIGHT[depth] ?? 0.15

  let proximityScore = 0.5
  if (ctx.nearMe && ctx.userLat != null && ctx.userLng != null) {
    const km = haversineKm(
      { lat: row.latitude, lng: row.longitude },
      { lat: ctx.userLat, lng: ctx.userLng },
    )
    proximityScore = Math.exp(-km / 1.5)
  }

  return (
    2.0 * topicScore +
    1.5 * tierScore +
    1.0 * depthScore +
    1.5 * proximityScore +
    styleBoost(row, ctx.styleId)
  )
}

const isFeaturedAnchor = (row: PoolRow): boolean => (row.importance_tier ?? 'archive') === 'featured'

const isRichGem = (row: PoolRow): boolean =>
  (row.source === 'budapest100' || row.source === 'muemlekem') && row.history_depth === 'rich'

/**
 * Selects and ranks a bounded pool of landmarks for the route-planning LLM.
 * Deterministic (stable sort by score then id) so results are reproducible.
 */
export const selectNarrativePool = <T extends PoolRow>(
  rows: T[],
  ctx: PoolContext,
  limit = 40,
): T[] => {
  const candidates = rows.filter((row) => (row.importance_tier ?? 'archive') !== 'skip')

  const scored = candidates
    .map((row) => ({ row, score: scorePoolRow(row, ctx) }))
    .sort((a, b) => b.score - a.score || String(a.row.id).localeCompare(String(b.row.id)))

  const typeCap = Math.max(1, Math.ceil(limit * 0.4))
  const typeCounts = new Map<string, number>()
  const selected: T[] = []
  const selectedIds = new Set<string>()

  const tryAdd = (row: T): boolean => {
    const id = String(row.id)
    if (selectedIds.has(id)) {
      return false
    }

    const type = row.landmark_type ?? 'unknown'
    const count = typeCounts.get(type) ?? 0
    if (count >= typeCap) {
      return false
    }

    selected.push(row)
    selectedIds.add(id)
    typeCounts.set(type, count + 1)
    return true
  }

  for (const { row } of scored) {
    if (selected.length >= limit) {
      break
    }
    tryAdd(row)
  }

  // Guarantee tourist anchors are present regardless of greedy fill order.
  const featuredFloor = 5
  const featuredCount = selected.filter(isFeaturedAnchor).length
  if (featuredCount < featuredFloor) {
    for (const { row } of scored) {
      if (selected.filter(isFeaturedAnchor).length >= featuredFloor) break
      if (!selectedIds.has(String(row.id)) && isFeaturedAnchor(row)) {
        selected.push(row)
        selectedIds.add(String(row.id))
      }
    }
  }

  // Deep-dive tours should always have a healthy supply of hidden gems.
  if (ctx.styleId === 'deep-dive') {
    const gemFloor = 10
    const gemCount = selected.filter(isRichGem).length
    if (gemCount < gemFloor) {
      for (const { row } of scored) {
        if (selected.filter(isRichGem).length >= gemFloor) break
        if (!selectedIds.has(String(row.id)) && isRichGem(row)) {
          selected.push(row)
          selectedIds.add(String(row.id))
        }
      }
    }
  }

  // Tiered budgets: same total prompt size as a flat 40×300, but the top-ranked
  // candidates — the ones the LLM will most likely pick — get room for real content.
  const TOP_TIER_COUNT = 8
  const TOP_TIER_BUDGET = 700
  const BASE_BUDGET = 200
  const topicIds = ctx.topicIds ?? []

  return selected
    .slice(0, Math.max(limit, featuredFloor))
    .map((row, index) => {
      const text = row.story_prompt
      if (!text) {
        return row
      }

      const budget = index < TOP_TIER_COUNT ? TOP_TIER_BUDGET : BASE_BUDGET
      return {
        ...row,
        story_prompt: buildExcerpt(text, findTopicHitPositions(text, topicIds), budget),
      }
    })
}
