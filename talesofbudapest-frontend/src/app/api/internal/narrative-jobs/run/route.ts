import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'
import { processNarrativeGenerationJob } from '@/lib/server/narrativeGenerationJob'

export const maxDuration = 300

const run = async (request: Request) => {
  const secret = process.env.NARRATIVE_WORKER_SECRET ?? process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  await supabase
    .from('narrative_generation_jobs')
    .update({ status: 'queued', stage: 'queued', updated_at: new Date().toISOString() })
    .eq('status', 'running')
    .lt('updated_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())

  const { data: job, error } = await supabase
    .from('narrative_generation_jobs')
    .select('id')
    .eq('status', 'queued')
    .lt('attempt_count', 3)
    .order('created_at')
    .limit(1)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!job) return NextResponse.json({ processed: false })

  await processNarrativeGenerationJob(job.id)
  return NextResponse.json({ processed: true, jobId: job.id })
}

export const GET = run
export const POST = run

