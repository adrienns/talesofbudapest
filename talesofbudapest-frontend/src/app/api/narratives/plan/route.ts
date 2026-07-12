import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'
import { selectNarrativePool } from '@/lib/server/narrativePool'
import { NARRATIVE_LANDMARK_SELECT } from '@/lib/server/narrativeLandmarkSelect'
// @ts-expect-error backend lib is plain JS in sibling workspace
import { finalizeChapterScripts, planNarrativeRoute } from '@backend/lib/narrativePipeline.js'

export const maxDuration = 60

export const POST = async (request: Request) => {
  try {
    const body = await request.json()
    const userPrompt = body?.userPrompt?.trim()
    const context = body?.context ?? {}

    if (!userPrompt) {
      return NextResponse.json({ error: 'userPrompt is required' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
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

    return NextResponse.json({
      title: plan.title,
      userPrompt,
      context,
      chapters,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to plan narrative'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
