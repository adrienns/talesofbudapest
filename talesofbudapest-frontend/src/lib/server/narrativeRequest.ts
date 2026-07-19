import { RequestGuardError } from '@/lib/server/expensiveRequestGuard'
// @ts-expect-error backend content is plain JS in sibling workspace
import { findCuratedTour } from '@backend/content/curated/index.js'
// @ts-expect-error backend lib is plain JS in sibling workspace
import { buildNarrativePrompt, curatedNarrativeRequest, isTourStyleId } from '@backend/lib/tourStyles.js'

const VALID_DURATIONS = new Set([45, 60, 90, 120, 180])

type Context = Record<string, unknown> & { locale?: 'en' | 'hu' }

export const normalizeNarrativeRequest = (body: Record<string, any>) => {
  const context = (body?.context && typeof body.context === 'object') ? body.context as Context : {}
  const raw = (body?.request && typeof body.request === 'object') ? body.request : {}
  const locale = context.locale === 'hu' ? 'hu' : 'en'
  const requestedSlug = typeof body?.curatedSlug === 'string' ? body.curatedSlug : null

  // Fixed tours already have reviewed scripts and audio. Never let an old or
  // stale client turn one back into an expensive generation request.
  if (requestedSlug && findCuratedTour(requestedSlug, locale)) {
    throw new RequestGuardError('Ready-made tours must be loaded, not generated', 409)
  }

  const curated = requestedSlug ? curatedNarrativeRequest(requestedSlug) : null

  if (body?.curatedSlug && !curated) {
    throw new RequestGuardError('Unknown curated tour', 400)
  }

  const styleId = curated?.styleId ?? raw.styleId
  const topicIds = curated?.topicIds ?? raw.topicIds
  const minutes = raw.timeBudgetMinutes ?? 90
  const intent = raw.intent ?? ''

  if (!isTourStyleId(styleId)) throw new RequestGuardError('A valid tour style is required', 400)
  if (!Array.isArray(topicIds) || topicIds.length > 3 || topicIds.some((id) => typeof id !== 'string')) {
    throw new RequestGuardError('Up to three topics are required', 400)
  }
  if (!VALID_DURATIONS.has(minutes)) throw new RequestGuardError('A valid tour duration is required', 400)
  if (typeof intent !== 'string' || intent.length > 500) throw new RequestGuardError('intent must be 500 characters or fewer', 400)

  const safeContext = {
    hour: Number.isFinite(context.hour) ? context.hour : undefined,
    userLat: Number.isFinite(context.userLat) ? context.userLat : null,
    userLng: Number.isFinite(context.userLng) ? context.userLng : null,
    locale,
    timeBudgetMinutes: minutes,
    styleId,
    topicIds,
    nearMe: raw.nearMe === true,
    intent: intent.trim() || undefined,
  }

  return {
    context: safeContext,
    userPrompt: curated?.prompt ?? buildNarrativePrompt(safeContext, locale),
  }
}
