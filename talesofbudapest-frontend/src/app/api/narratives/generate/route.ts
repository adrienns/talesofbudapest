import { createHash } from 'node:crypto'
import { after, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'
import { getOrCreateVisitorId } from '@/lib/server/visitorIdentity'
import { processNarrativeGenerationJob } from '@/lib/server/narrativeGenerationJob'
import {
  consumeExpensiveRequest,
  readJsonBody,
  requestGuardResponse,
  RequestGuardError,
} from '@/lib/server/expensiveRequestGuard'
import { getNarrativeDraft } from '@/lib/server/narrativeDraft'
import { normalizeNarrativeRequest } from '@/lib/server/narrativeRequest'
// @ts-expect-error backend lib is plain JS in sibling workspace
import { findNarrativeByPrompt, fetchNarrativeById } from '@backend/lib/narrativePipeline.js'

export const maxDuration = 300

export const POST = async (request: Request) => {
  try {
    const body = await readJsonBody(request, 8_192)
    const supabase = getSupabaseAdmin()
    const ownerId = await getOrCreateVisitorId()
    const storedDraft = body?.draftId ? await getNarrativeDraft(supabase, ownerId, body.draftId) : null
    let jobRequest: Record<string, any>
    let idempotencyInput: Record<string, unknown>
    let progressTotal = 0
    let userPrompt: string

    if (body?.draftId) {
      if (!storedDraft) throw new RequestGuardError('Route preview not found or expired', 404)
      const draft = storedDraft.payload
      if (!Array.isArray(draft.chapters) || draft.chapters.length === 0 || draft.chapters.length > 12) {
        throw new RequestGuardError('Route preview is invalid', 400)
      }
      const chapterOrder = body?.chapterOrder
      if (!Array.isArray(chapterOrder) || chapterOrder.length !== draft.chapters.length ||
        !chapterOrder.every(Number.isInteger) || new Set(chapterOrder).size !== chapterOrder.length) {
        throw new RequestGuardError('chapterOrder must contain every preview chapter exactly once', 400)
      }
      const chaptersByDraftIndex = new Map(draft.chapters.map((chapter: any) => [chapter.draftChapterIndex, chapter]))
      const orderedChapters = chapterOrder.map((draftChapterIndex: number, chapterIndex: number) => {
        const chapter = chaptersByDraftIndex.get(draftChapterIndex)
        if (!chapter) throw new RequestGuardError('chapterOrder does not match route preview', 400)
        return { ...chapter, chapterIndex }
      })
      const trustedDraft = { ...draft, chapters: orderedChapters, walkingRoute: body?.walkingRoute ?? null }
      userPrompt = draft.userPrompt
      jobRequest = { draft: trustedDraft }
      idempotencyInput = { draftId: storedDraft.id, chapterOrder, walkingRoute: body?.walkingRoute ?? null }
      progressTotal = trustedDraft.chapters.length
    } else {
      const normalized = normalizeNarrativeRequest(body)
      userPrompt = normalized.userPrompt
      jobRequest = normalized
      idempotencyInput = { request: body.request, context: body.context, curatedSlug: body.curatedSlug ?? null }
    }

    const cached = await findNarrativeByPrompt(supabase, userPrompt, ownerId)
    if (cached) return NextResponse.json(cached)
    const idempotencyKey = createHash('sha256').update(JSON.stringify(idempotencyInput)).digest('hex')
    jobRequest.idempotencyKey = idempotencyKey
    const { data: existing, error: existingError } = await supabase
      .from('narrative_generation_jobs')
      .select('*')
      .eq('owner_id', ownerId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle()
    if (existingError) throw new Error(existingError.message)

    if (existing?.status === 'completed' && existing.narrative_id) {
      const narrative = await fetchNarrativeById(supabase, existing.narrative_id, null, ownerId)
      if (narrative) return NextResponse.json(narrative)
    }

    let job = existing
    if (existing?.status === 'failed') {
      if (existing.attempt_count >= 3) {
        return NextResponse.json({ error: existing.error_message ?? 'Tour generation failed after three attempts' }, { status: 422 })
      }
      const { data: retried, error } = await supabase
        .from('narrative_generation_jobs')
        .update({ status: 'queued', stage: 'queued', error_message: null, request_body: jobRequest })
        .eq('id', existing.id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      job = retried
    }

    if (!job) {
      await consumeExpensiveRequest({ supabase, request, visitorId: ownerId, action: 'tour_generate' })
      const { data: created, error } = await supabase
        .from('narrative_generation_jobs')
        .insert({
          owner_id: ownerId,
          idempotency_key: idempotencyKey,
          request_body: jobRequest,
          progress_total: progressTotal,
        })
        .select()
        .single()
      if (error) throw new Error(error.message)
      job = created
    }

    after(() => processNarrativeGenerationJob(job.id))
    return NextResponse.json({ jobId: job.id, status: job.status, stage: job.stage }, { status: 202 })
  } catch (error) {
    const guarded = requestGuardResponse(error)
    if (guarded) return guarded
    const message = error instanceof Error ? error.message : 'Failed to queue narrative'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
