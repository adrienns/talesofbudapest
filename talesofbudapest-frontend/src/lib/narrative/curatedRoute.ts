import { getCuratedTourDetailBySlug } from '@/constants/curatedTourDetails'
import type { NarrativeRoute } from '@/types/narrative'

type CuratedRoutePayload = NarrativeRoute & {
  curatedSlug?: string | null
}

/**
 * Keeps curated media usable when the backing Supabase instance is local.
 * The browser always receives same-origin audio URLs, while the server can
 * reach the configured storage origin.
 */
export const prepareCuratedRoute = (route: CuratedRoutePayload): NarrativeRoute => {
  if (!route.curatedSlug) return route

  const detail = getCuratedTourDetailBySlug(route.curatedSlug)
  return {
    ...route,
    chapters: route.chapters.map((chapter) => ({
      ...chapter,
      imageUrl: chapter.imageUrl ?? detail?.chapters[chapter.chapterIndex]?.imageUrl ?? null,
      audioUrl: chapter.audioUrl
        ? `/api/narratives/${encodeURIComponent(route.id)}/chapters/${chapter.chapterIndex}/audio`
        : null,
    })),
  }
}
