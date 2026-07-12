'use client'

import { useAdminResource } from '../../hooks/useAdminResource'
import type { AdminOverview } from '../../types/admin'
import { AsyncState } from './AsyncState'
import styles from './AdminDashboard.module.css'

const number = new Intl.NumberFormat('en')

export const OverviewDashboard = () => {
  const { data, isLoading, error, reload } = useAdminResource<AdminOverview>('/api/admin/overview')

  if (isLoading) return <AsyncState mode="loading" />
  if (error) return <AsyncState mode="error" message={error} onRetry={reload} />
  if (!data) return <AsyncState mode="empty" message="No operational data is available." />

  const metrics = [
    ['Pending decisions', data.pipeline.reviewQueue],
    ['Canonical entities', data.pipeline.canonicalEntities ?? 0],
    ['Public claims', data.pipeline.publicClaims ?? 0],
    ['Staged records', data.pipeline.stagedRecords],
  ] as const

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.kicker}>Archive control room</p>
          <h1 className={styles.title}>The city graph, at a glance.</h1>
          <p className={styles.lede}>Monitor what entered the corpus, what still needs judgment, and what is safe to publish.</p>
        </div>
        <time className={styles.timestamp} dateTime={data.health.checkedAt}>{data.health.state} · {data.health.latencyMs ?? '—'} ms</time>
      </header>

      <section className={styles.metricGrid} aria-label="Knowledge graph status">
        {metrics.map(([label, value]) => (
          <article className={styles.metric} key={label}>
            <strong className={styles.metricValue}>{number.format(value)}</strong>
            <span className={styles.metricLabel}>{label}</span>
          </article>
        ))}
      </section>

      <div className={styles.sectionGrid}>
        <section className={styles.panel} aria-labelledby="source-coverage-title">
          <header className={styles.panelHeader}>
            <h2 id="source-coverage-title" className={styles.panelTitle}>Source coverage</h2>
            <span className={styles.panelMeta}>{data.sources?.length ?? 0} sources</span>
          </header>
          {data.sources?.length ? (
            <ul className={styles.sourceList}>
              {data.sources.map((source) => {
                const coverage = source.pages && source.extractedPages !== null
                  ? Math.min(100, Math.round((source.extractedPages / source.pages) * 100))
                  : 0
                return (
                  <li className={styles.sourceItem} key={source.id}>
                    <div className={styles.sourceLine}>
                      <span className={styles.sourceTitle}>{source.title}</span>
                      <span className={styles.sourceStats}>{coverage}% · {source.approvedClaims === null ? '—' : number.format(source.approvedClaims)} approved</span>
                    </div>
                    <div className={styles.bar} aria-label={`${coverage}% extracted`}>
                      <span className={styles.barFill} style={{ width: `${coverage}%` }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : <AsyncState mode="empty" message="No sources have been registered." />}
        </section>

        <section className={styles.panel} aria-labelledby="pipeline-title">
          <header className={styles.panelHeader}>
            <h2 id="pipeline-title" className={styles.panelTitle}>Pipeline ledger</h2>
          </header>
          <ul className={styles.pipelineList}>
            {Object.entries(data.statuses).map(([key, count]) => (
              <li className={styles.pipelineItem} key={key}>
                <span><i className={styles.statusDot} data-status={count === null ? 'blocked' : count > 0 ? 'warning' : 'healthy'} aria-hidden="true" />{key.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase())}</span>
                <strong>{count === null ? '—' : number.format(count)}</strong>
              </li>
            ))}
          </ul>
          {data.unavailableTables.length > 0 && (
            <p className={styles.errorText} style={{ padding: '0 1.2rem 1rem' }}>{data.unavailableTables.length} table checks unavailable</p>
          )}
        </section>
      </div>
    </>
  )
}
