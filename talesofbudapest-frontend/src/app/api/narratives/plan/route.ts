import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'
import { selectNarrativePool } from '@/lib/server/narrativePool'
import { NARRATIVE_LANDMARK_SELECT } from '@/lib/server/narrativeLandmarkSelect'
import {
  consumeExpensiveRequest,
  readJsonBody,
  requestGuardResponse,
} from '@/lib/server/expensiveRequestGuard'
import { getOrCreateVisitorId } from '@/lib/server/visitorIdentity'
import { createNarrativeDraft } from '@/lib/server/narrativeDraft'
import { normalizeNarrativeRequest } from '@/lib/server/narrativeRequest'
// @ts-expect-error backend lib is plain JS in sibling workspace
import { finalizeChapterScripts, planNarrativeRoute } from '@backend/lib/narrativePipeline.js'

export const maxDuration = 60

export const POST = async (request: Request) => {
  try {
    const body = await readJsonBody(request, 16_384)
    const { userPrompt, context } = normalizeNarrativeRequest(body)

    const supabase = getSupabaseAdmin()
    const visitorId = await getOrCreateVisitorId()
    await consumeExpensiveRequest({ supabase, request, visitorId, action: 'tour_plan' })
    const { data: landmarks, error: landmarksError } = await supabase
      .from('locations')
      .select(NARRATIVE_LANDMARK_SELECT)
      .eq('publication_status', 'published')
      .eq('tour_eligible', true)

    if (landmarksError) {
      throw new Error(landmarksError.message)
    }

    if (!landmarks?.length) {
      return NextResponse.json({ error: 'No landmarks available' }, { status: 400 })
    }

    const pool = selectNarrativePool(landmarks, context as any, 40)
    const plan = await planNarrativeRoute({ userPrompt, context, landmarks: pool })

    // Ground each chosen stop's script in its FULL source text — the pool rows
    // the planner saw only carry budget-bounded excerpts.
    const landmarksById = new Map(
      landmarks.map((row: { id: string | number }) => [String(row.id), row]),
    )
    const chapters = await finalizeChapterScripts({
      supabase,
      chapters: plan.chapters,
      landmarksById,
      tourTitle: plan.title,
      userPrompt,
      context,
    })

    const draft = await createNarrativeDraft(supabase, visitorId, {
      title: plan.title,
      userPrompt,
      context,
      chapters: chapters.map((chapter: Record<string, unknown>, draftChapterIndex: number) => ({
        ...chapter,
        draftChapterIndex,
      })),
    })

    return NextResponse.json({
      id: draft.id,
      title: plan.title,
      context,
      // Scripts and the assembled prompt remain server-owned until a visitor
      // confirms the tour. The preview only needs stop metadata and hooks.
      chapters: draft.payload.chapters.map(({ script, ...chapter }: Record<string, unknown>) => chapter),
    })
  } catch (error) {
    const guarded = requestGuardResponse(error)
    if (guarded) return guarded
    const message = error instanceof Error ? error.message : 'Failed to plan narrative'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
