'use client'

import { useCallback, useMemo, useState } from 'react'
import { useAdminResource } from './useAdminResource'
import type { ReviewDecision, ReviewItem } from '../types/admin'

type ReviewsResponse = { items: ReviewItem[]; total?: number }

export const useReviewInbox = () => {
  const resource = useAdminResource<ReviewsResponse>('/api/admin/reviews')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const items = resource.data?.items ?? []
  const current = items[0] ?? null

  const decide = useCallback(async (
    item: ReviewItem,
    decision: ReviewDecision,
    targetId?: string | null,
  ) => {
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const response = await fetch(
        '/api/admin/reviews/decision',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: item.kind,
            id: item.id,
            decision,
            ...(targetId ? { publicLocationId: targetId } : {}),
          }),
        },
      )
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error ?? `Decision failed (${response.status})`)
      }
      resource.setData((previous) => previous
        ? { ...previous, items: previous.items.filter((entry) => entry.id !== item.id) }
        : previous)
    } catch (cause) {
      setSubmitError(cause instanceof Error ? cause.message : 'Decision failed')
      throw cause
    } finally {
      setIsSubmitting(false)
    }
  }, [resource])

  return useMemo(() => ({
    ...resource,
    items,
    current,
    decide,
    isSubmitting,
    submitError,
  }), [current, decide, isSubmitting, items, resource, submitError])
}
