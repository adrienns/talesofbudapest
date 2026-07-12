'use client'

import Link from 'next/link'
import { useAdminResource } from '../../hooks/useAdminResource'
import type { AdminInsights, Metric, NamedCount } from '../../types/insights'
import { AsyncState } from './AsyncState'
import styles from './InsightsDashboard.module.css'

const number = new Intl.NumberFormat('en')
const label = (value: string) => value.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (letter) => letter.toUpperCase())
const formatCount = (value: number | null | undefined) => typeof value === 'number' ? number.format(value) : '—'

const MetricNote = ({ metric }: { metric: Metric<unknown> }) => !metric.available || metric.note || metric.truncated ? (
  <p className={styles.metricNote}>{!metric.available ? 'Unavailable' : metric.truncated ? 'Showing a limited result' : metric.note}{metric.note && metric.truncated ? ` · ${metric.note}` : ''}</p>
) : null

const BarList = ({ metric, noun }: { metric: Metric<NamedCount[]>; noun: string }) => {
  const items = metric.value ?? []
  const maximum = Math.max(1, ...items.map((item) => item.count))
  if (!metric.available) return <><p className={styles.unavailable}>Not available yet.</p><MetricNote metric={metric} /></>
  if (!items.length) return <p className={styles.unavailable}>No records in this group.</p>
  return (
    <>
      <ul className={styles.barList}>
        {items.map((item) => (
          <li className={styles.barItem} key={item.name}>
            <div className={styles.barLine}><span>{label(item.name)}</span><strong>{number.format(item.count)}</strong></div>
            <div className={styles.track} role="img" aria-label={`${label(item.name)}: ${number.format(item.count)} ${noun}`}>
              <span className={styles.fill} style={{ width: `${Math.max(item.count ? 2 : 0, item.count / maximum * 100)}%` }} />
            </div>
          </li>
        ))}
      </ul>
      <MetricNote metric={metric} />
    </>
  )
}

const Timeline = ({ metric }: { metric: Metric<NamedCount[]> }) => {
  const items = metric.value ?? []
  if (!metric.available) return <><p className={styles.unavailable}>Claim dates are unavailable.</p><MetricNote metric={metric} /></>
  if (!items.length) return <p className={styles.unavailable}>No dated claims are available.</p>
  const maximum = Math.max(1, ...items.map((item) => item.count))
  const width = Math.max(560, items.length * 58)
  const points = items.map((item, index) => ({
    x: items.length === 1 ? width / 2 : 24 + index * ((width - 48) / (items.length - 1)),
    y: 143 - (item.count / maximum * 128),
  }))
  return (
    <>
      <div className={styles.timelineScroll} aria-hidden="true">
        <svg className={styles.timeline} viewBox={`0 0 ${width} 190`} role="presentation">
          <line className={styles.axis} x1="24" y1="143" x2={width - 24} y2="143" />
          <polyline className={styles.timelineLine} points={points.map((point) => `${point.x},${point.y}`).join(' ')} />
          {points.map((point, index) => (
            <g key={`${items[index].name}-${index}`}>
              <circle className={styles.timelineDot} cx={point.x} cy={point.y} r="4" />
              <text className={styles.timelineValue} x={point.x} y={Math.max(11, point.y - 10)} textAnchor="middle">{formatCount(items[index].count)}</text>
              <text className={styles.timelineLabel} x={point.x} y="168" textAnchor="middle">{items[index].name}</text>
            </g>
          ))}
        </svg>
      </div>
      <table className={styles.srTable}>
        <caption>Claims by decade</caption><thead><tr><th>Decade</th><th>Claims</th></tr></thead>
        <tbody>{items.map((item) => <tr key={item.name}><td>{item.name}</td><td>{number.format(item.count)}</td></tr>)}</tbody>
      </table>
      <MetricNote metric={metric} />
    </>
  )
}

const pendingNames = new Set(['pending', 'needs_review', 'draft', 'quarantined'])

export const InsightsDashboard = () => {
  const { data, isLoading, error, reload } = useAdminResource<AdminInsights>('/api/admin/insights')
  if (isLoading) return <AsyncState mode="loading" />
  if (error) return <AsyncState mode="error" message={error} onRetry={reload} />
  if (!data) return <AsyncState mode="empty" message="No insight data is available." />

  const unavailableCount = [
    ...Object.values(data.totals), data.entityKinds.canonical, data.entityKinds.staging, data.pageStatuses,
    ...Object.values(data.reviewStatuses), ...Object.values(data.publication),
    data.predicates.canonical, data.predicates.staging, data.claimEras, data.claimDecades, data.sources,
    ...Object.values(data.quality),
  ].filter((metric) => !metric.available).length
  const reviewPressure: NamedCount[] = Object.entries(data.reviewStatuses).map(([kind, metric]) => ({
    name: kind,
    count: (metric.value ?? []).filter((row) => pendingNames.has(row.name.toLowerCase())).reduce((sum, row) => sum + row.count, 0),
  }))
  const pressureAvailable = Object.values(data.reviewStatuses).some((metric) => metric.available)
  const pressureTotal = reviewPressure.reduce((sum, item) => sum + item.count, 0)
  const qualityAlerts = [
    { title: 'Failed extracted pages', metric: data.quality.failedPages, severity: 'high', detail: 'Incomplete extraction windows need a retry; there is not yet a page-failure workspace.' },
    { title: 'Unresolved staging entities', metric: data.quality.unresolvedStagingEntities, severity: 'medium', detail: 'Resolve identities before canonical promotion.', href: '/graph?source=staging' },
    { title: 'Unresolved relation endpoints', metric: data.quality.unresolvedRelationEndpoints, severity: 'high', detail: 'These relations cannot yet connect two graph nodes.', href: '/graph?source=staging' },
    { title: 'Canonical items missing evidence', metric: data.quality.canonicalItemsMissingEvidence, severity: 'high', detail: 'Explore canonical records that lack a safe citation.', href: '/graph?source=canonical' },
    { title: 'Staging items missing evidence', metric: data.quality.stagingItemsMissingEvidence, severity: 'medium', detail: 'Evidence should be repaired before promotion.', href: '/graph?source=staging' },
  ]

  return (
    <>
      <header className={styles.pageHeader}>
        <div><p className={styles.kicker}>Curator workspace</p><h1 className={styles.title}>Where does the graph need attention?</h1><p className={styles.lede}>Compare coverage, bottlenecks, and evidence quality before deciding what to review or explore next.</p></div>
        <time className={styles.timestamp} dateTime={data.generatedAt}>Updated {new Date(data.generatedAt).toLocaleString()}</time>
      </header>

      {unavailableCount > 0 && <aside className={styles.notice}><strong>Partial view.</strong> {unavailableCount} {unavailableCount === 1 ? 'metric is' : 'metrics are'} unavailable; unavailable values remain blank rather than being counted as zero.</aside>}

      <section className={styles.totals} aria-label="Corpus totals">
        {Object.entries(data.totals).map(([key, metric]) => <article className={styles.total} key={key}><strong>{metric.available ? formatCount(metric.value) : '—'}</strong><span>{label(key)}</span>{metric.note && <small>{metric.note}</small>}</article>)}
      </section>

      <div className={styles.decisionStrip}>
        <div><strong>{pressureAvailable ? number.format(pressureTotal) : '—'}</strong><span>decisions waiting across the review queues</span></div>
        <Link className={styles.primaryLink} href="/reviews">Open Review Inbox <span aria-hidden="true">→</span></Link>
      </div>

      <div className={styles.grid}>
        <section className={`${styles.panel} ${styles.wide}`} aria-labelledby="coverage-heading">
          <header className={styles.panelHeader}><div><p className={styles.sectionIndex}>01 · Ingestion</p><h2 id="coverage-heading">Extraction coverage</h2></div><span>{data.sources.value?.length ?? 0} sources</span></header>
          {data.sources.available && data.sources.value?.length ? <div className={styles.coverageList}>{data.sources.value.map((source) => {
            const percent = typeof source.pages === 'number' && source.pages > 0 && typeof source.extractedPages === 'number' ? Math.min(100, Math.round(source.extractedPages / source.pages * 100)) : null
            return <article className={styles.coverageRow} key={source.id}>
              <div className={styles.coverageName}><strong>{source.title}</strong><span>{percent === null ? 'Page status unknown' : `${percent}% of pages marked extracted`} · license {source.licenseVerdict}</span></div>
              <div className={styles.coverageTrack} role="img" aria-label={`${source.title}: ${percent === null ? 'coverage unknown' : `${percent}% extracted`}`}>{percent !== null && <span style={{ width: `${percent}%` }} />}</div>
              <dl className={styles.coverageStats}><div><dt>Pages marked extracted</dt><dd>{formatCount(source.extractedPages)} / {formatCount(source.pages)}</dd></div><div><dt>Extraction windows</dt><dd>{formatCount(source.mentions)}</dd></div><div><dt>Failed pages</dt><dd>{formatCount(source.failedPages)}</dd></div><div><dt>Staging entities</dt><dd>{formatCount(source.stagingEntities)}</dd></div><div><dt>Facts</dt><dd>{formatCount(source.facts)}</dd></div><div><dt>Relations</dt><dd>{formatCount(source.relations)}</dd></div></dl>
            </article>
          })}</div> : <p className={styles.unavailable}>{data.sources.available ? 'No sources have coverage data.' : 'Source coverage is unavailable.'}</p>}
          <MetricNote metric={data.sources} />
        </section>

        <section className={styles.panel} aria-labelledby="funnel-heading"><header className={styles.panelHeader}><div><p className={styles.sectionIndex}>02 · Flow</p><h2 id="funnel-heading">Extraction pipeline</h2></div></header><BarList noun="pages" metric={data.pageStatuses} /></section>
        <section className={styles.panel} aria-labelledby="pressure-heading"><header className={styles.panelHeader}><div><p className={styles.sectionIndex}>03 · Decisions</p><h2 id="pressure-heading">Review pressure</h2></div><Link href="/reviews">Review</Link></header><BarList noun="pending decisions" metric={{ available: pressureAvailable, value: pressureAvailable ? reviewPressure : null }} /></section>

        <section className={`${styles.panel} ${styles.wide}`} aria-labelledby="alerts-heading">
          <header className={styles.panelHeader}><div><p className={styles.sectionIndex}>04 · Quality</p><h2 id="alerts-heading">Quality alerts</h2></div></header>
          <ul className={styles.alertList}>{qualityAlerts.map(({ title, metric, severity, detail, href }) => <li className={styles.alert} data-severity={metric.available && metric.value === 0 ? 'clear' : severity} key={title}><span className={styles.severity}>{metric.available && metric.value === 0 ? 'clear' : severity}</span><div><strong>{title}</strong><p>{metric.available ? detail : metric.note ?? 'This check is unavailable.'}</p></div><b>{metric.available ? formatCount(metric.value) : '—'}</b>{href && <Link href={href}>Explore <span aria-hidden="true">→</span></Link>}</li>)}</ul>
        </section>

        <section className={styles.panel} aria-labelledby="kinds-heading"><header className={styles.panelHeader}><div><p className={styles.sectionIndex}>05 · Shape</p><h2 id="kinds-heading">Canonical entity kinds</h2></div><Link href="/graph?source=canonical">Explore</Link></header><BarList noun="entities" metric={data.entityKinds.canonical} /></section>
        <section className={styles.panel} aria-labelledby="staging-kinds-heading"><header className={styles.panelHeader}><div><p className={styles.sectionIndex}>06 · Staging</p><h2 id="staging-kinds-heading">Staging entity kinds</h2></div><Link href="/graph?source=staging">Explore</Link></header><BarList noun="entities" metric={data.entityKinds.staging} /></section>
        <section className={styles.panel} aria-labelledby="predicate-heading"><header className={styles.panelHeader}><div><p className={styles.sectionIndex}>07 · Relations</p><h2 id="predicate-heading">Canonical predicates</h2></div><Link href="/graph">Open graph</Link></header><BarList noun="relations" metric={data.predicates.canonical} /></section>
        <section className={styles.panel} aria-labelledby="publication-heading"><header className={styles.panelHeader}><div><p className={styles.sectionIndex}>08 · Visibility</p><h2 id="publication-heading">Claim publication</h2></div></header><BarList noun="claims" metric={data.publication.claims} /></section>
        <section className={styles.panel} aria-labelledby="eras-heading"><header className={styles.panelHeader}><div><p className={styles.sectionIndex}>09 · Time</p><h2 id="eras-heading">Claim eras</h2></div></header><BarList noun="claims" metric={data.claimEras} /></section>
        <section className={styles.panel} aria-labelledby="timeline-heading"><header className={styles.panelHeader}><div><p className={styles.sectionIndex}>10 · Time</p><h2 id="timeline-heading">Claims by decade</h2></div></header><Timeline metric={data.claimDecades} /></section>
      </div>
    </>
  )
}
