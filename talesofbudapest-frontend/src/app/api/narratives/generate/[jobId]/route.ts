import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'
import { getOrCreateVisitorId } from '@/lib/server/visitorIdentity'
// @ts-expect-error backend lib is plain JS in sibling workspace
import { fetchNarrativeById } from '@backend/lib/narrativePipeline.js'

type RouteParams = { params: Promise<{ jobId: string }> }

export const GET = async (_request: Request, { params }: RouteParams) => {
  try {
    const { jobId } = await params
    const ownerId = await getOrCreateVisitorId()
    const supabase = getSupabaseAdmin()
    const { data: job, error } = await supabase
      .from('narrative_generation_jobs')
      .select('id, status, stage, progress_current, progress_total, narrative_id, error_message, attempt_count')
      .eq('id', jobId)
      .eq('owner_id', ownerId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!job) return NextResponse.json({ error: 'Generation job not found' }, { status: 404 })

    const narrative = job.status === 'completed' && job.narrative_id
      ? await fetchNarrativeById(supabase, job.narrative_id, null, ownerId)
      : null

    return NextResponse.json({
      id: job.id,
      status: job.status,
      stage: job.stage,
      progressCurrent: job.progress_current,
      progressTotal: job.progress_total,
      attemptCount: job.attempt_count,
      error: job.status === 'failed' ? job.error_message : null,
      narrative,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to check generation job'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

