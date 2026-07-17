type DraftPayload = {
  title: string
  userPrompt: string
  context: Record<string, unknown>
  chapters: Array<Record<string, unknown>>
}

type DraftClient = {
  from: (table: string) => any
}

export const createNarrativeDraft = async (
  supabase: DraftClient,
  ownerId: string,
  payload: DraftPayload,
) => {
  const { data, error } = await supabase
    .from('narrative_drafts')
    .insert({ owner_id: ownerId, payload })
    .select('id, payload')
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Failed to save route preview')
  return data as { id: string; payload: DraftPayload }
}

export const getNarrativeDraft = async (supabase: DraftClient, ownerId: string, id: unknown) => {
  if (typeof id !== 'string' || !id) return null
  const { data, error } = await supabase
    .from('narrative_drafts')
    .select('id, payload')
    .eq('id', id)
    .eq('owner_id', ownerId)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as { id: string; payload: DraftPayload } | null
}

export const updateNarrativeDraft = async (supabase: DraftClient, ownerId: string, id: string, payload: DraftPayload) => {
  const { error } = await supabase
    .from('narrative_drafts')
    .update({ payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('owner_id', ownerId)
  if (error) throw new Error(error.message)
}
