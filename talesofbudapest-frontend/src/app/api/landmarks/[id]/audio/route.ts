import { NextResponse } from 'next/server'
import { DEFAULT_TOUR_STYLE_ID, isTourStyleId } from '@/constants/tourStyles'
import { assertGeminiTtsConfigured } from '@/lib/server/audioEnv'
import { loadBackendEnv } from '@/lib/server/loadBackendEnv'
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'
import { DEFAULT_LOCALE, isAppLocale } from '@/types/locale'
import {
  consumeExpensiveRequest,
  readJsonBody,
  requestGuardResponse,
  RequestGuardError,
} from '@/lib/server/expensiveRequestGuard'
import { getOrCreateVisitorId } from '@/lib/server/visitorIdentity'
// @ts-expect-error backend lib is plain JS in sibling workspace
import { generateLandmarkAudio } from '@backend/lib/landmarkAudioPipeline.js'

export const maxDuration = 120

type RouteContext = {
  params: Promise<{ id: string }>
}

export const POST = async (request: Request, context: RouteContext) => {
  try {
    loadBackendEnv()
    assertGeminiTtsConfigured()

    const { id } = await context.params
    const body = await readJsonBody(request, 8_192, true)
    const locale = isAppLocale(body?.locale) ? body.locale : DEFAULT_LOCALE
    const styleId = isTourStyleId(body?.styleId) ? body.styleId : DEFAULT_TOUR_STYLE_ID
    const topicIds = Array.isArray(body?.topicIds)
      ? body.topicIds.filter((item: unknown): item is string => typeof item === 'string')
      : []
    if (body?.force) {
      throw new RequestGuardError('Forced audio regeneration is not available publicly', 403)
    }
    if (topicIds.length > 5 || topicIds.some((item) => item.length > 50)) {
      throw new RequestGuardError('At most 5 valid topics are allowed', 400)
    }

    const supabase = getSupabaseAdmin()
    const visitorId = await getOrCreateVisitorId()
    await consumeExpensiveRequest({ supabase, request, visitorId, action: 'landmark_audio' })

    const { data: location, error: locationError } = await supabase
      .from('locations')
      .select('id, name, story_prompt, audio_url, source_material, history_depth')
      .eq('id', id)
      .maybeSingle()

    if (locationError) {
      throw new Error(locationError.message)
    }

    if (!location) {
      return NextResponse.json({ error: 'Landmark not found' }, { status: 404 })
    }

    const { data: translation, error: translationError } = await supabase
      .from('location_translations')
      .select('locale, name, story_prompt, audio_url, historical_narrative')
      .eq('location_id', id)
      .eq('locale', locale)
      .maybeSingle()

    if (translationError) {
      throw new Error(translationError.message)
    }

    const result = await generateLandmarkAudio({
      supabase,
      location,
      locale,
      translation,
      styleId,
      topicIds,
      force: false,
    })

    const historyDepth =
      (result as { historyDepth?: string }).historyDepth ??
      (location.history_depth as string | null | undefined) ??
      undefined

    return NextResponse.json({ ...result, historyDepth })
  } catch (error) {
    const guarded = requestGuardResponse(error)
    if (guarded) return guarded
    const message = error instanceof Error ? error.message : 'Failed to generate landmark audio'
    console.error('[landmark-audio]', message)
    const isConfigError =
      message.includes('GEMINI_API_KEY') ||
      message.includes('Unauthorized') ||
      message.includes('service role') ||
      message.includes('User not found')
    const status = isConfigError ? 503 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
