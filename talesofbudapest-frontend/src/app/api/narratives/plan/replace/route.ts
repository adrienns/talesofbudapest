import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'
import { selectNarrativePool } from '@/lib/server/narrativePool'
import { NARRATIVE_LANDMARK_SELECT } from '@/lib/server/narrativeLandmarkSelect'
// @ts-expect-error backend lib is plain JS in sibling workspace
import { finalizeChapterScripts, planReplacementStop } from '@backend/lib/narrativePipeline.js'

export const maxDuration = 30

export const POST = async (request: Request) => {
  try {
    const body = await request.json()
    const userPrompt = body?.draft?.userPrompt?.trim()
    const context = body?.draft?.context ?? {}
    const chapters = body?.draft?.chapters
    const replaceIndex = body?.replaceIndex

    if (!userPrompt || !Array.isArray(chapters)) {
      return NextResponse.json({ error: 'draft with userPrompt and chapters is required' }, { status: 400 })
    }

    if (typeof replaceIndex !== 'number' || !chapters[replaceIndex]) {
      return NextResponse.json({ error: 'replaceIndex must reference an existing chapter' }, { status: 400 })
    }

    const usedLandmarkIds = new Set(
      chapters
        .map((chapter: { landmarkId?: string | null }) => chapter.landmarkId)
        .filter((id: string | null | undefined): id is string => Boolean(id)),
    )

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

    const remaining = landmarks.filter((row: { id: string | number }) => !usedLandmarkIds.has(String(row.id)))
    const pool = selectNarrativePool(remaining, context, 40)

    const replacement = await planReplacementStop({
      userPrompt,
      context,
      landmarks: pool,
      existingChapters: chapters,
      replaceIndex,
    })

    // Ground the replacement's script in its full source text (pool rows only
    // carry excerpts). `landmarks` still holds the untruncated rows.
    const landmarksById = new Map(
      landmarks.map((row: { id: string | number }) => [String(row.id), row]),
    )
    const [finalized] = await finalizeChapterScripts({
      supabase,
      chapters: [replacement],
      landmarksById,
      tourTitle: body?.draft?.title ?? '',
      userPrompt,
      context,
    })

    return NextResponse.json({ chapter: finalized })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to replace stop'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
