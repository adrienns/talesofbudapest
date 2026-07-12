'use client'

import { useEffect, useState } from 'react'
import { useReviewInbox } from '../../hooks/useReviewInbox'
import type { ReviewDecision } from '../../types/admin'
import { AsyncState } from './AsyncState'
import styles from './AdminDashboard.module.css'

export const ReviewInbox = () => {
  const { current, items, isLoading, error, reload, decide, isSubmitting, submitError } = useReviewInbox()
  const [targetId, setTargetId] = useState('')
  const [pendingDecision, setPendingDecision] = useState<ReviewDecision | null>(null)

  useEffect(() => {
    setTargetId(current?.suggestions?.find((suggestion) => suggestion.autoMatch)?.publicLocationId ?? '')
    setPendingDecision(null)
  }, [current?.id, current?.suggestions])

  if (isLoading) return <AsyncState mode="loading" />
  if (error) return <AsyncState mode="error" message={error} onRetry={reload} />
  if (!current) return <AsyncState mode="empty" message="Inbox clear. Every proposed record has a decision." />

  const canApprove = current.kind !== 'location_connection' || Boolean(targetId)

  const confirm = async () => {
    if (!pendingDecision) return
    try {
      await decide(current, pendingDecision, targetId || null)
      setPendingDecision(null)
    } catch {
      // The hook preserves the error and current item for a safe retry.
    }
  }

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.kicker}>Human judgment required</p>
          <h1 className={styles.title}>One question at a time.</h1>
          <p className={styles.lede}>Approve only what the evidence supports. Raw source text stays outside this interface.</p>
        </div>
        <span className={styles.timestamp}>{items.length} remaining</span>
      </header>

      <div className={styles.reviewFrame}>
        <article className={styles.reviewCard} aria-labelledby="review-question">
          <span className={styles.reviewKind}>{current.kind} review</span>
          <h2 id="review-question" className={styles.question}>{current.question}</h2>
          <p className={styles.subject}>{current.title}</p>
          {current.detail && <p className={styles.summary}>{current.detail}</p>}
          <span className={styles.confidence}>{current.status.replaceAll('_', ' ')}</span>

          {current.suggestions && current.suggestions.length > 0 && (
            <div className={styles.candidateField}>
              <label htmlFor="candidate-target">Canonical match</label>
              <select
                id="candidate-target"
                className={styles.select}
                value={targetId}
                onChange={(event) => setTargetId(event.target.value)}
              >
                <option value="">Select a canonical map location</option>
                {current.suggestions.map((candidate) => (
                  <option key={candidate.publicLocationId} value={candidate.publicLocationId}>
                    {candidate.name} — {Math.round(candidate.score * 100)}%
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className={styles.actions}>
            <button className={`${styles.button} ${styles.buttonPrimary}`} type="button" disabled={!canApprove} onClick={() => setPendingDecision('approve')}>Approve</button>
            <button className={styles.button} type="button" onClick={() => setPendingDecision('reject')}>Reject</button>
          </div>

          {pendingDecision && (
            <div className={styles.confirm} role="alertdialog" aria-labelledby="confirm-title" aria-describedby="confirm-detail">
              <p id="confirm-title"><strong>Confirm {pendingDecision}</strong></p>
              <p id="confirm-detail">This records a curator decision and advances to the next question.</p>
              <div className={styles.confirmActions}>
                <button className={`${styles.button} ${pendingDecision === 'approve' ? styles.buttonPrimary : ''}`} type="button" disabled={isSubmitting} onClick={() => void confirm()}>
                  {isSubmitting ? 'Recording…' : `Yes, ${pendingDecision}`}
                </button>
                <button className={styles.button} type="button" disabled={isSubmitting} onClick={() => setPendingDecision(null)}>Cancel</button>
              </div>
            </div>
          )}
          {submitError && <p className={styles.errorText} role="alert">{submitError}</p>}
        </article>

        <aside className={`${styles.panel} ${styles.evidence}`} aria-labelledby="evidence-title">
          <h2 id="evidence-title" className={styles.evidenceTitle}>Evidence summary</h2>
          {current.context && Object.keys(current.context).length ? Object.entries(current.context).map(([label, value]) => (
            <div className={styles.citation} key={label}>
              <strong>{label.replace(/([A-Z])/g, ' $1')}</strong>
              <span>{Array.isArray(value) ? value.filter(Boolean).join('–') || 'Not recorded' : String(value ?? 'Not recorded')}</span>
            </div>
          )) : <p className={styles.summary}>No structured evidence summary is attached. Reject unless independently verified.</p>}
        </aside>
      </div>
    </>
  )
}
