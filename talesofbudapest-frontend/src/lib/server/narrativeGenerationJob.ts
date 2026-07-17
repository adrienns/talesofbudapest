import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'
import { selectNarrativePool } from '@/lib/server/narrativePool'
import { NARRATIVE_LANDMARK_SELECT } from '@/lib/server/narrativeLandmarkSelect'
// @ts-expect-error backend lib is plain JS in sibling workspace
import { findNarrativeByPrompt, finalizeChapterScripts, planNarrativeRoute, synthesizeNarrative } from '@backend/lib/narrativePipeline.js'

type JobRow = {
  id: string
  owner_id: string
  request_body: Record<string, any>
}

const updateJob = async (supabase: ReturnType<typeof getSupabaseAdmin>, id: string, values: Record<string, unknown>) => {
  const { error } = await supabase
    .from('narrative_generation_jobs')
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export const processNarrativeGenerationJob = async (jobId: string) => {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.rpc('claim_narrative_generation_job', { p_job_id: jobId })
  if (error) throw new Error(error.message)
  const job = (data?.[0] ?? null) as JobRow | null
  if (!job) return

  let narrativeId: string | null = null

  try {
    const body = job.request_body
    const draft = body?.draft
    let narrative

    const onNarrativeCreated = async (id: string) => {
      narrativeId = id
      await updateJob(supabase, job.id, { narrative_id: id, stage: 'audio' })
    }
    const onChapterSaved = async ({ completed, total }: { completed: number; total: number }) => {
      await updateJob(supabase, job.id, {
        stage: completed === total ? 'saving' : 'audio',
        progress_current: completed,
        progress_total: total,
      })
    }

    if (draft) {
      await updateJob(supabase, job.id, { stage: 'audio', progress_total: draft.chapters.length })
      narrative = await synthesizeNarrative({
        supabase,
        title: draft.title ?? 'Your Budapest Tour',
        userPrompt: draft.userPrompt,
        context: draft.context ?? {},
        chapters: draft.chapters,
        walkingRoute: draft.walkingRoute ?? null,
        ownerId: job.owner_id,
        idempotencyKey: body.idempotencyKey,
        onNarrativeCreated,
        onChapterSaved,
      })
    } else {
      const userPrompt = body.userPrompt
      const context = body.context ?? {}
      const cached = await findNarrativeByPrompt(supabase, userPrompt, job.owner_id)
      if (cached) {
        narrative = cached
        narrativeId = cached.id
      } else {
        const { data: landmarks, error: landmarksError } = await supabase
          .from('locations')
          .select(NARRATIVE_LANDMARK_SELECT)
        if (landmarksError) throw new Error(landmarksError.message)
        if (!landmarks?.length) throw new Error('No landmarks available')

        const pool = selectNarrativePool(landmarks, context, 40)
        const plan = await planNarrativeRoute({ userPrompt, context, landmarks: pool })
        await updateJob(supabase, job.id, {
          stage: 'writing',
          progress_total: plan.chapters.length,
        })
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
        narrative = await synthesizeNarrative({
          supabase,
          title: plan.title,
          userPrompt,
          context,
          chapters,
          ownerId: job.owner_id,
          idempotencyKey: body.idempotencyKey,
          onNarrativeCreated,
          onChapterSaved,
        })
      }
    }

    await updateJob(supabase, job.id, {
      status: 'completed',
      stage: 'completed',
      narrative_id: narrative.id,
      progress_current: narrative.chapters.length,
      progress_total: narrative.chapters.length,
      request_body: {},
    })
  } catch (jobError) {
    if (narrativeId) {
      await supabase.from('narratives').delete().eq('id', narrativeId)
    }
    const message = jobError instanceof Error ? jobError.message : 'Tour generation failed'
    await updateJob(supabase, job.id, {
      status: 'failed',
      stage: 'failed',
      narrative_id: null,
      error_message: message.slice(0, 500),
    })
  }
}

