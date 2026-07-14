import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'
import { selectNarrativePool } from '@/lib/server/narrativePool'
import { NARRATIVE_LANDMARK_SELECT } from '@/lib/server/narrativeLandmarkSelect'
// @ts-expect-error backend lib is plain JS in sibling workspace
import { findNarrativeByPrompt, finalizeChapterScripts, planNarrativeRoute, synthesizeNarrative } from '@backend/lib/narrativePipeline.js'

export const maxDuration = 120

/**
 * Body is either:
 *  - `{ draft: { title, userPrompt, context, chapters } }` — a preview the
 *    user confirmed. Skips planning, goes straight to audio synthesis.
 *  - `{ userPrompt, context }` — legacy/curated path: plans AND synthesizes
 *    in one call. Curated starters use this so tapping one never shows a
 *    preview; a cache hit on `userPrompt` makes repeat taps instant.
 */
export const POST = async (request: Request) => {
  try {
    const body = await request.json()
    const draft = body?.draft
    const supabase = getSupabaseAdmin()

    if (draft) {
      const userPrompt = draft.userPrompt?.trim()
      const chapters = draft.chapters

      if (!userPrompt || !Array.isArray(chapters) || chapters.length === 0) {
        return NextResponse.json({ error: 'draft with userPrompt and chapters is required' }, { status: 400 })
      }

      const narrative = await synthesizeNarrative({
        supabase,
        title: draft.title ?? 'Your Budapest Tour',
        userPrompt,
        context: draft.context ?? {},
        chapters,
        walkingRoute: draft.walkingRoute ?? null,
      })

      return NextResponse.json(narrative)
    }

    const userPrompt = body?.userPrompt?.trim()
    const context = body?.context ?? {}

    if (!userPrompt) {
      return NextResponse.json({ error: 'userPrompt is required' }, { status: 400 })
    }

    const cached = await findNarrativeByPrompt(supabase, userPrompt)
    if (cached) {
      return NextResponse.json(cached)
    }

    const { data: landmarks, error: landmarksError } = await supabase
      .from('locations')
      .select(NARRATIVE_LANDMARK_SELECT)

    if (landmarksError) {
      throw new Error(landmarksError.message)
    }

    if (!landmarks?.length) {
      return NextResponse.json({ error: 'No landmarks available' }, { status: 400 })
    }

    const pool = selectNarrativePool(landmarks, context, 40)
    const plan = await planNarrativeRoute({ userPrompt, context, landmarks: pool })

    // Ground scripts in the full source texts before TTS (pool rows are excerpted).
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

    const narrative = await synthesizeNarrative({
      supabase,
      title: plan.title,
      userPrompt,
      context,
      chapters,
    })

    return NextResponse.json(narrative)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate narrative'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
