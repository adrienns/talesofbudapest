import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { trustedClientIp } from '@/lib/server/trustedClientIp'

export type ExpensiveAction =
  | 'tour_plan'
  | 'tour_replace'
  | 'tour_generate'
  | 'landmark_audio'
  | 'walking_route'
  | 'guide_chat'

type SupabaseRpcClient = {
  rpc: (name: string, params: Record<string, unknown>) => PromiseLike<{
    data: Array<{ allowed: boolean; retry_after_seconds: number }> | null
    error: { message: string } | null
  }>
}

export class RequestGuardError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfter?: number,
  ) {
    super(message)
  }
}

export const readJsonBody = async (
  request: Request,
  maxBytes: number,
  allowEmpty = false,
): Promise<Record<string, any>> => {
  const declaredSize = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
    throw new RequestGuardError('Request body is too large', 413)
  }

  const raw = await request.text()
  if (!raw && allowEmpty) return {}
  if (!raw) throw new RequestGuardError('JSON request body is required', 400)
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    throw new RequestGuardError('Request body is too large', 413)
  }

  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('body must be an object')
    }
    return parsed
  } catch {
    throw new RequestGuardError('Request body must be valid JSON', 400)
  }
}

export const requirePrompt = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new RequestGuardError('userPrompt is required', 400)
  }
  const prompt = value.trim()
  if (prompt.length > 500) {
    throw new RequestGuardError('userPrompt must be 500 characters or fewer', 400)
  }
  return prompt
}

const clientIpKey = (request: Request) => {
  const ip = trustedClientIp(request) ?? 'proxy-ip-unavailable'
  return `ip:${createHash('sha256').update(ip).digest('hex')}`
}

const consumeForActor = async (
  supabase: SupabaseRpcClient,
  actorKey: string,
  action: ExpensiveAction,
  scope: 'visitor' | 'ip',
) => {
  const { data, error } = await supabase.rpc('consume_expensive_request', {
    p_actor_key: actorKey,
    p_action: action,
    p_scope: scope,
  })

  if (error) {
    console.error('expensive request guard RPC failed', { action, scope, message: error.message })
    throw new RequestGuardError('Request protection is temporarily unavailable', 503)
  }

  const result = data?.[0]
  if (!result?.allowed) {
    throw new RequestGuardError(
      'Too many requests. Please try again later.',
      429,
      Math.max(1, result?.retry_after_seconds ?? 60),
    )
  }
}

export const consumeExpensiveRequest = async ({
  supabase,
  request,
  visitorId,
  action,
}: {
  supabase: SupabaseRpcClient
  request: Request
  visitorId: string
  action: ExpensiveAction
}) => {
  await consumeForActor(supabase, `visitor:${visitorId}`, action, 'visitor')
  await consumeForActor(supabase, clientIpKey(request), action, 'ip')
}

export const requestGuardResponse = (error: unknown): NextResponse | null => {
  if (!(error instanceof RequestGuardError)) return null

  const headers = error.retryAfter
    ? { 'Retry-After': String(error.retryAfter) }
    : undefined
  return NextResponse.json({ error: error.message }, { status: error.status, headers })
}
