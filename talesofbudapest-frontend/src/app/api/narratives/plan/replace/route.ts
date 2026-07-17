import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'
import { selectNarrativePool } from '@/lib/server/narrativePool'
import { NARRATIVE_LANDMARK_SELECT } from '@/lib/server/narrativeLandmarkSelect'
import {
  consumeExpensiveRequest,
  readJsonBody,
  requestGuardResponse,
  RequestGuardError,
} from '@/lib/server/expensiveRequestGuard'
import { getOrCreateVisitorId } from '@/lib/server/visitorIdentity'
import { getNarrativeDraft, updateNarrativeDraft } from '@/lib/server/narrativeDraft'
// @ts-expect-error backend lib is plain JS in sibling workspace
import { finalizeChapterScripts, planReplacementStop } from '@backend/lib/narrativePipeline.js'

export const maxDuration = 30

export const POST = async (request: Request) => {
  try {
    const body = await readJsonBody(request, 4_096)
    const replaceIndex = body?.replaceIndex

    const supabase = getSupabaseAdmin()
    const visitorId = await getOrCreateVisitorId()
    const draft = await getNarrativeDraft(supabase, visitorId, body?.draftId)
    if (!draft) throw new RequestGuardError('Route preview not found or expired', 404)
    const { userPrompt, context, chapters } = draft.payload
    if (!Array.isArray(chapters) || chapters.length === 0 || chapters.length > 12) {
      throw new RequestGuardError('Route preview is invalid', 400)
    }
    if (!Number.isInteger(replaceIndex) || !chapters[replaceIndex]) {
      return NextResponse.json({ error: 'replaceIndex must reference an existing chapter' }, { status: 400 })
    }
    const usedLandmarkIds = new Set(
      chapters
        .map((chapter: { landmarkId?: string | null }) => chapter.landmarkId)
        .filter((id: string | null | undefined): id is string => Boolean(id)),
    )
    await consumeExpensiveRequest({ supabase, request, visitorId, action: 'tour_replace' })
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
      tourTitle: draft.payload.title,
      userPrompt,
      context,
    })

    const nextChapters = chapters.map((chapter: Record<string, unknown>, index: number) =>
      index === replaceIndex ? { ...finalized, draftChapterIndex: chapter.draftChapterIndex } : chapter,
    )
    await updateNarrativeDraft(supabase, visitorId, draft.id, { ...draft.payload, chapters: nextChapters })

    const { script, ...chapterPreview } = nextChapters[replaceIndex] as Record<string, unknown>
    return NextResponse.json({ chapter: chapterPreview })
  } catch (error) {
    const guarded = requestGuardResponse(error)
    if (guarded) return guarded
    const message = error instanceof Error ? error.message : 'Failed to replace stop'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
