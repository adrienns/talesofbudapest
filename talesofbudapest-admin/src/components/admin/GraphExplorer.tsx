'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAdminResource } from '../../hooks/useAdminResource'
import type { AdminGraph } from '../../types/admin'
import type { AdminEntityDetail } from '../../types/insights'
import { AsyncState } from './AsyncState'
import styles from './GraphExplorer.module.css'

const WIDTH = 960
const HEIGHT = 540
const MAX_NODES = 120
const SOURCE_STORAGE_KEY = 'tob-graph-source'

type Source = 'canonical' | 'staging'
type View = 'network' | 'relations' | 'ledger'
type SortKey = 'name' | 'kind' | 'status' | 'degree'
type Node = { id: string; label: string; kind: string; status: string; description?: string | null; needsResearch?: boolean }
type Edge = { id: string; sourceId: string; targetId: string; label: string; status: string }
type Point = { x: number; y: number }

const statusOptions: Record<Source, string[]> = {
  canonical: ['draft', 'needs_review', 'approved', 'rejected'],
  staging: ['pending', 'resolved', 'rejected', 'quarantined'],
}

const kindColour = (kind: string) => kind === 'location' ? '#d6a756' : kind === 'person' ? '#72c69b' : kind === 'event' ? '#e88474' : kind === 'organisation' ? '#a88bd8' : '#8aaac4'

/** A deterministic, component-aware force layout. It keeps disconnected stories apart,
 * pulls related records together, then resolves node collisions without a chart library. */
const buildLayout = (nodes: Node[], edges: Edge[]) => {
  const positions = new Map<string, Point>()
  if (!nodes.length) return positions
  const ids = new Set(nodes.map((node) => node.id))
  const adjacency = new Map(nodes.map((node) => [node.id, new Set<string>()]))
  for (const edge of edges) {
    if (!ids.has(edge.sourceId) || !ids.has(edge.targetId)) continue
    adjacency.get(edge.sourceId)?.add(edge.targetId)
    adjacency.get(edge.targetId)?.add(edge.sourceId)
  }
  const components: string[][] = []
  const seen = new Set<string>()
  const ordered = [...nodes].sort((a, b) => (adjacency.get(b.id)?.size ?? 0) - (adjacency.get(a.id)?.size ?? 0) || a.label.localeCompare(b.label))
  for (const node of ordered) {
    if (seen.has(node.id)) continue
    const component: string[] = []
    const queue = [node.id]
    seen.add(node.id)
    while (queue.length) {
      const id = queue.shift()!
      component.push(id)
      for (const neighbor of adjacency.get(id) ?? []) if (!seen.has(neighbor)) { seen.add(neighbor); queue.push(neighbor) }
    }
    components.push(component)
  }
  components.sort((a, b) => b.length - a.length)
  const cols = Math.max(1, Math.ceil(Math.sqrt(components.length * (WIDTH / HEIGHT))))
  const rows = Math.ceil(components.length / cols)
  const cellW = WIDTH / cols
  const cellH = HEIGHT / rows
  components.forEach((component, componentIndex) => {
    const cx = (componentIndex % cols + .5) * cellW
    const cy = (Math.floor(componentIndex / cols) + .5) * cellH
    const radius = Math.min(cellW, cellH) * Math.min(.4, .13 + component.length / 90)
    const ranked = [...component].sort((a, b) => (adjacency.get(b)?.size ?? 0) - (adjacency.get(a)?.size ?? 0) || a.localeCompare(b))
    ranked.forEach((id, index) => {
      if (index === 0 && ranked.length > 2) positions.set(id, { x: cx, y: cy })
      else {
        const angle = ((index - (ranked.length > 2 ? 1 : 0)) / Math.max(1, ranked.length - 1)) * Math.PI * 2 + componentIndex * .47
        const ring = radius * (.48 + .52 * (((index * 7) % 13) / 13))
        positions.set(id, { x: cx + Math.cos(angle) * ring, y: cy + Math.sin(angle) * ring })
      }
    })
  })
  // A few stable relaxation passes: attraction on edges plus pairwise collision.
  for (let iteration = 0; iteration < 34; iteration++) {
    const delta = new Map(nodes.map((node) => [node.id, { x: 0, y: 0 }]))
    for (const edge of edges) {
      const a = positions.get(edge.sourceId); const b = positions.get(edge.targetId)
      if (!a || !b) continue
      const dx = b.x - a.x; const dy = b.y - a.y; const distance = Math.max(1, Math.hypot(dx, dy))
      const force = (distance - 78) * .018
      delta.get(edge.sourceId)!.x += dx / distance * force; delta.get(edge.sourceId)!.y += dy / distance * force
      delta.get(edge.targetId)!.x -= dx / distance * force; delta.get(edge.targetId)!.y -= dy / distance * force
    }
    for (let aIndex = 0; aIndex < nodes.length; aIndex++) for (let bIndex = aIndex + 1; bIndex < nodes.length; bIndex++) {
      const a = positions.get(nodes[aIndex].id)!; const b = positions.get(nodes[bIndex].id)!
      let dx = b.x - a.x; let dy = b.y - a.y
      if (dx === 0 && dy === 0) { dx = ((aIndex % 3) - 1) || 1; dy = ((bIndex % 3) - 1) || -1 }
      const distance = Math.max(1, Math.hypot(dx, dy)); const minimum = 30
      if (distance >= minimum) continue
      const push = (minimum - distance) * .1
      delta.get(nodes[aIndex].id)!.x -= dx / distance * push; delta.get(nodes[aIndex].id)!.y -= dy / distance * push
      delta.get(nodes[bIndex].id)!.x += dx / distance * push; delta.get(nodes[bIndex].id)!.y += dy / distance * push
    }
    for (const node of nodes) {
      const point = positions.get(node.id)!; const move = delta.get(node.id)!
      positions.set(node.id, { x: Math.max(24, Math.min(WIDTH - 24, point.x + move.x)), y: Math.max(24, Math.min(HEIGHT - 24, point.y + move.y)) })
    }
  }
  return positions
}

export const GraphExplorer = () => {
  const [source, setSource] = useState<Source>('canonical')
  const [view, setView] = useState<View>('network')
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState('all')
  const [status, setStatus] = useState('all')
  const [predicate, setPredicate] = useState('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sort, setSort] = useState<SortKey>('degree')
  const [ascending, setAscending] = useState(false)
  const [detail, setDetail] = useState<AdminEntityDetail | null>(null)
  const [detailState, setDetailState] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle')
  const [transform, setTransform] = useState({ scale: 1, tx: 0, ty: 0 })

  useEffect(() => {
    const linked = new URLSearchParams(window.location.search).get('source')
    if (linked === 'staging' || linked === 'canonical') setSource(linked)
    else {
      const saved = window.localStorage.getItem(SOURCE_STORAGE_KEY)
      if (saved === 'staging' || saved === 'canonical') setSource(saved)
    }
  }, [])
  const { data, isLoading, error, reload } = useAdminResource<AdminGraph>(`/api/admin/graph?source=${source}`)

  const changeSource = (next: Source) => {
    setSource(next); setStatus('all'); setPredicate('all'); setSelectedId(null); setDetail(null); setDetailState('idle'); setTransform({ scale: 1, tx: 0, ty: 0 })
    window.localStorage.setItem(SOURCE_STORAGE_KEY, next)
    const url = new URL(window.location.href); url.searchParams.set('source', next); window.history.replaceState({}, '', url)
  }

  const allNodes = useMemo<Node[]>(() => (data?.entities ?? []).map((entity) => ({
    id: entity.id, label: entity.canonical_name_en, kind: entity.entity_kind,
    status: entity.review_status ?? (source === 'staging' ? 'pending' : 'draft'), description: entity.description_en,
    needsResearch: entity.needs_research === true,
  })), [data?.entities, source])
  const allEdges = useMemo<Edge[]>(() => (data?.edges ?? []).map((edge) => ({
    id: edge.id, sourceId: edge.subject_entity_id, targetId: edge.object_entity_id,
    label: edge.predicate, status: edge.review_status ?? (source === 'staging' ? 'pending' : 'draft'),
  })), [data?.edges, source])
  const predicates = useMemo(() => [...new Set(allEdges.map((edge) => edge.label))].sort(), [allEdges])
  const matchingEdges = useMemo(() => predicate === 'all' ? allEdges : allEdges.filter((edge) => edge.label === predicate), [allEdges, predicate])
  const edgeNodeIds = useMemo(() => new Set(matchingEdges.flatMap((edge) => [edge.sourceId, edge.targetId])), [matchingEdges])
  const filteredNodes = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return allNodes.filter((node) => (kind === 'all' || node.kind === kind) && (status === 'all' || node.status === status) &&
      (!needle || node.label.toLocaleLowerCase().includes(needle)) && (predicate === 'all' || edgeNodeIds.has(node.id)))
  }, [allNodes, edgeNodeIds, kind, predicate, query, status])
  const baseNodes = useMemo(() => filteredNodes.slice(0, MAX_NODES), [filteredNodes])
  // Ego overlay: a selected node's real connections (from its loaded detail) may
  // fall outside the bounded importance sample, so they would not render as
  // edges. Inject the selected entity, its neighbors, and their edges so
  // selecting a node always reveals its true connections regardless of filters.
  const egoNodes = useMemo<Node[]>(() => (detail && selectedId && detail.identity.id === selectedId)
    ? [{ id: detail.identity.id, label: detail.identity.name, kind: detail.identity.kind, status: detail.identity.status ?? 'pending' },
       ...detail.connections.map((c) => ({ id: c.neighborId, label: c.neighborName, kind: c.neighborKind, status: c.status ?? 'pending' }))]
    : [], [detail, selectedId])
  const egoEdges = useMemo<Edge[]>(() => (detail && selectedId && detail.identity.id === selectedId)
    ? detail.connections.map((c) => ({ id: c.id, sourceId: c.direction === 'outgoing' ? selectedId : c.neighborId, targetId: c.direction === 'outgoing' ? c.neighborId : selectedId, label: c.predicate, status: c.status ?? 'pending' }))
    : [], [detail, selectedId])
  const nodes = useMemo(() => {
    const map = new Map(baseNodes.map((node) => [node.id, node]))
    for (const node of egoNodes) if (!map.has(node.id)) map.set(node.id, node)
    return [...map.values()]
  }, [baseNodes, egoNodes])
  const nodeIds = useMemo(() => new Set(nodes.map((node) => node.id)), [nodes])
  const edges = useMemo(() => {
    const map = new Map(matchingEdges.filter((edge) => nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId)).map((edge) => [edge.id, edge]))
    for (const edge of egoEdges) if (nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId) && !map.has(edge.id)) map.set(edge.id, edge)
    return [...map.values()]
  }, [matchingEdges, nodeIds, egoEdges])
  const degrees = useMemo(() => {
    const result = new Map(nodes.map((node) => [node.id, 0]))
    for (const edge of edges) { result.set(edge.sourceId, (result.get(edge.sourceId) ?? 0) + 1); result.set(edge.targetId, (result.get(edge.targetId) ?? 0) + 1) }
    return result
  }, [edges, nodes])
  // Lay out ONLY the base sample. Selecting a node must not change this layout
  // (feeding ego nodes into buildLayout re-partitions components and teleports
  // the clicked node to a corner).
  const baseCoordinates = useMemo(() => {
    const baseIds = new Set(baseNodes.map((node) => node.id))
    return buildLayout(baseNodes, matchingEdges.filter((edge) => baseIds.has(edge.sourceId) && baseIds.has(edge.targetId)))
  }, [baseNodes, matchingEdges])
  // Ego neighbors not already in the base layout orbit the selected node's own
  // (stable) position, so clicking reveals connections in place without reflow.
  const coordinates = useMemo(() => {
    const map = new Map(baseCoordinates)
    const center = (selectedId ? map.get(selectedId) : undefined) ?? { x: WIDTH / 2, y: HEIGHT / 2 }
    if (selectedId && !map.has(selectedId)) map.set(selectedId, center)
    const orbiting = egoNodes.filter((node) => node.id !== selectedId && !baseCoordinates.has(node.id))
    orbiting.forEach((node, index) => {
      const angle = (index / Math.max(1, orbiting.length)) * Math.PI * 2
      map.set(node.id, { x: center.x + Math.cos(angle) * 78, y: center.y + Math.sin(angle) * 78 })
    })
    return map
  }, [baseCoordinates, egoNodes, selectedId])
  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes])
  const selectedNode = selectedId ? byId.get(selectedId) ?? allNodes.find((node) => node.id === selectedId) ?? null : null
  const connections = useMemo(() => !selectedId ? [] : edges.filter((edge) => edge.sourceId === selectedId || edge.targetId === selectedId).map((edge) => {
    const outgoing = edge.sourceId === selectedId
    return { ...edge, outgoing, other: byId.get(outgoing ? edge.targetId : edge.sourceId) }
  }).filter((item) => item.other), [byId, edges, selectedId])
  const neighborIds = useMemo(() => new Set(connections.map((item) => item.other!.id)), [connections])
  const predicateCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const edge of allEdges) counts.set(edge.label, (counts.get(edge.label) ?? 0) + 1)
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [allEdges])
  const maxPredicate = predicateCounts[0]?.[1] ?? 1

  useEffect(() => {
    if (!selectedNode) { setDetail(null); setDetailState('idle'); return }
    const controller = new AbortController()
    setDetailState('loading'); setDetail(null)
    fetch(`/api/admin/entity?id=${encodeURIComponent(selectedNode.id)}&source=${source}&kind=${encodeURIComponent(selectedNode.kind)}`, { signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error('unavailable'); return response.json() as Promise<AdminEntityDetail> })
      .then((value) => { setDetail(value); setDetailState('ready') })
      .catch((reason) => { if (reason instanceof DOMException && reason.name === 'AbortError') return; setDetailState('unavailable') })
    return () => controller.abort()
  }, [selectedNode?.id, selectedNode?.kind, source])

  const sortedNodes = useMemo(() => [...nodes].sort((a, b) => {
    const av = sort === 'degree' ? degrees.get(a.id) ?? 0 : sort === 'name' ? a.label : a[sort]
    const bv = sort === 'degree' ? degrees.get(b.id) ?? 0 : sort === 'name' ? b.label : b[sort]
    const comparison = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
    return ascending ? comparison : -comparison
  }), [ascending, degrees, nodes, sort])
  const changeSort = (key: SortKey) => { if (sort === key) setAscending((value) => !value); else { setSort(key); setAscending(key !== 'degree') } }
  const selectNode = (id: string) => setSelectedId((current) => current === id ? null : id)

  const svgRef = useRef<SVGSVGElement | null>(null)
  const wheelDetach = useRef<(() => void) | null>(null)
  const transformRef = useRef(transform); transformRef.current = transform
  const drag = useRef<{ x: number; y: number; transform: typeof transform } | null>(null)
  const moved = useRef(false)
  const [isDragging, setIsDragging] = useState(false)
  const resetView = () => setTransform({ scale: 1, tx: 0, ty: 0 })
  const screen = (id: string) => { const point = coordinates.get(id); return point ? { x: point.x * transform.scale + transform.tx, y: point.y * transform.scale + transform.ty } : null }
  const setSvgRef = useCallback((svg: SVGSVGElement | null) => {
    wheelDetach.current?.(); wheelDetach.current = null; svgRef.current = svg
    if (!svg) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault(); const rect = svg.getBoundingClientRect(); const cx = (event.clientX - rect.left) / rect.width * WIDTH; const cy = (event.clientY - rect.top) / rect.height * HEIGHT
      setTransform((previous) => { const scale = Math.min(7, Math.max(.45, previous.scale * (event.deltaY < 0 ? 1.14 : 1 / 1.14))); const ratio = scale / previous.scale; return { scale, tx: cx - (cx - previous.tx) * ratio, ty: cy - (cy - previous.ty) * ratio } })
    }
    svg.addEventListener('wheel', onWheel, { passive: false }); wheelDetach.current = () => svg.removeEventListener('wheel', onWheel)
  }, [])
  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => { drag.current = { x: event.clientX, y: event.clientY, transform: transformRef.current }; moved.current = false; setIsDragging(true) }
  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => { if (!drag.current || !svgRef.current) return; const rect = svgRef.current.getBoundingClientRect(); const start = drag.current; if (Math.abs(event.clientX - start.x) + Math.abs(event.clientY - start.y) > 3) moved.current = true; setTransform({ ...start.transform, tx: start.transform.tx + (event.clientX - start.x) / rect.width * WIDTH, ty: start.transform.ty + (event.clientY - start.y) / rect.height * HEIGHT }) }
  const endDrag = () => { drag.current = null; setIsDragging(false) }

  if (isLoading) return <AsyncState mode="loading" />
  if (error) return <AsyncState mode="error" message={error} onRetry={reload} />
  if (!data) return <AsyncState mode="empty" message="The graph has no entities." />

  return <>
    <header className={styles.header}>
      <div><p className={styles.kicker}>{source === 'staging' ? 'Private staging · extracted records' : 'Canonical knowledge graph · promoted records'}</p><h1>Explore the city as connected evidence.</h1><p>Switch between a spatial network, relation patterns, and a curator ledger. This workspace is read-only: inspection never publishes or changes a record.</p></div>
      <div className={styles.summary}><span><strong>{filteredNodes.length}</strong> matching entities</span><span><strong>{edges.length}</strong> visible relations</span><span><strong>{predicateCounts.length}</strong> predicates</span></div>
    </header>

    <nav className={styles.tabs} aria-label="Graph display">
      {(['network', 'relations', 'ledger'] as View[]).map((mode) => <button key={mode} type="button" aria-current={view === mode ? 'page' : undefined} onClick={() => setView(mode)}>{mode}<small>{mode === 'network' ? 'topology' : mode === 'relations' ? 'patterns' : 'records'}</small></button>)}
    </nav>

    <section className={styles.controls} aria-label="Graph filters">
      <label><span>Graph source</span><select value={source} onChange={(event) => changeSource(event.target.value as Source)}><option value="canonical">Canonical (promoted)</option><option value="staging">Private staging (extracted)</option></select></label>
      <label><span>Find entity</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or place…" /></label>
      <label><span>Entity type</span><select value={kind} onChange={(event) => setKind(event.target.value)}><option value="all">All types</option>{[...new Set(allNodes.map((node) => node.kind))].sort().map((value) => <option key={value}>{value}</option>)}</select></label>
      <label><span>Review status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{statusOptions[source].map((value) => <option key={value}>{value}</option>)}</select></label>
      <label><span>Predicate</span><select value={predicate} onChange={(event) => setPredicate(event.target.value)}><option value="all">All relations</option>{predicates.map((value) => <option key={value}>{value}</option>)}</select></label>
    </section>

    {filteredNodes.length > MAX_NODES && <p className={styles.notice}>Showing the first {MAX_NODES} of {filteredNodes.length} matches. Narrow the filters to inspect another slice.</p>}
    {!nodes.length ? <AsyncState mode="empty" message="No entities match these filters." /> : view === 'network' ? <section className={styles.workspace}>
      <div className={styles.canvasWrap}>
        <div className={styles.canvasToolbar}><span>{nodes.length} nodes · {edges.length} relations</span><div><button type="button" onClick={() => setTransform((value) => ({ ...value, scale: Math.min(7, value.scale * 1.25) }))} aria-label="Zoom in">+</button><button type="button" onClick={() => setTransform((value) => ({ ...value, scale: Math.max(.45, value.scale / 1.25) }))} aria-label="Zoom out">−</button><button type="button" onClick={resetView}>Reset</button></div></div>
        <svg ref={setSvgRef} className={styles.canvas} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-labelledby="network-title network-desc" style={{ cursor: isDragging ? 'grabbing' : 'grab' }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag} onClick={() => { if (!moved.current) setSelectedId(null) }}>
          <title id="network-title">Filtered knowledge graph</title><desc id="network-desc">People, places and events connected by directed relationships. Select a node to highlight its immediate neighborhood.</desc>
          <defs><marker id="arrow" viewBox="0 0 10 10" refX="17" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker></defs>
          <g aria-hidden="true">{edges.map((edge) => { const a = screen(edge.sourceId); const b = screen(edge.targetId); if (!a || !b) return null; const active = selectedId != null && (edge.sourceId === selectedId || edge.targetId === selectedId); return <g key={edge.id} className={selectedId && !active ? styles.faded : undefined}><line className={active ? styles.activeEdge : styles.edge} x1={a.x} y1={a.y} x2={b.x} y2={b.y} markerEnd={active ? 'url(#arrow)' : undefined} />{active && <text className={styles.edgeLabel} x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 5} textAnchor="middle">{edge.label}</text>}</g> })}</g>
          {nodes.map((node) => { const point = screen(node.id)!; const selected = selectedId === node.id; const neighbor = neighborIds.has(node.id); const faded = selectedId && !selected && !neighbor; const showLabel = selected || neighbor || !selectedId && (degrees.get(node.id) ?? 0) >= Math.max(2, edges.length / Math.max(nodes.length, 1)); const circleClass = [selected ? styles.selectedCircle : styles.circle, node.needsResearch ? styles.placeholderCircle : ''].filter(Boolean).join(' '); return <g key={node.id} role="button" tabIndex={0} aria-label={`${node.kind}: ${node.label}, ${degrees.get(node.id) ?? 0} connections${node.needsResearch ? ', needs research' : ''}`} className={faded ? styles.faded : styles.graphNode} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); selectNode(node.id) }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectNode(node.id) } }}><circle cx={point.x} cy={point.y} r={selected ? 12 : node.kind === 'location' ? 9 : 7} fill={kindColour(node.kind)} className={circleClass} />{showLabel && <text x={point.x + 13} y={point.y + 4} className={styles.nodeLabel}>{node.label.slice(0, 32)}{node.needsResearch ? ' ◌' : ''}</text>}</g> })}
        </svg>
        <div className={styles.legend}>{[...new Set(nodes.map((node) => node.kind))].map((value) => <span key={value}><i style={{ background: kindColour(value) }} />{value}</span>)}{nodes.some((node) => node.needsResearch) && <span className={styles.placeholderLegend}><i className={styles.placeholderSwatch} />◌ needs research</span>}<em>Arrow shows relation direction</em></div>
      </div>
      <DetailPanel node={selectedNode} connections={connections} detail={detail} detailState={detailState} onSelect={setSelectedId} onClear={() => setSelectedId(null)} />
    </section> : view === 'relations' ? <>
      <RelationsView counts={predicateCounts} max={maxPredicate} edges={edges} byId={byId} onSelect={setSelectedId} selectedId={selectedId} />
      {selectedNode && <div className={styles.detailDock}><DetailPanel node={selectedNode} connections={connections} detail={detail} detailState={detailState} onSelect={setSelectedId} onClear={() => setSelectedId(null)} /></div>}
    </> : <>
      <Ledger nodes={sortedNodes} degrees={degrees} selectedId={selectedId} sort={sort} ascending={ascending} onSort={changeSort} onSelect={setSelectedId} />
      {selectedNode && <div className={styles.detailDock}><DetailPanel node={selectedNode} connections={connections} detail={detail} detailState={detailState} onSelect={setSelectedId} onClear={() => setSelectedId(null)} /></div>}
    </>}
  </>
}

const DetailPanel = ({ node, connections, detail, detailState, onSelect, onClear }: { node: Node | null; connections: Array<Edge & { outgoing: boolean; other: Node | undefined }>; detail: AdminEntityDetail | null; detailState: string; onSelect: (id: string) => void; onClear: () => void }) => <aside className={styles.inspector} aria-live="polite">
  {!node ? <div className={styles.inspectorEmpty}><span>Entity inspector</span><strong>Select a node</strong><p>Its direct relationships, direction, review state, and safe database details will appear here.</p></div> : <><div className={styles.inspectorHead}><div><span>{node.kind}</span><h2>{node.label}</h2></div><button type="button" onClick={onClear} aria-label="Close entity inspector">×</button></div><div className={styles.badges}><span>{node.status}</span><span>{connections.length} direct relations</span></div>{node.description && <p className={styles.description}>{node.description}</p>}
    <h3>Connections in this slice</h3>{connections.length ? <ul className={styles.connectionList}>{connections.map((item) => <li key={item.id}><span>{item.outgoing ? `${item.label} →` : `← ${item.label}`}</span><button type="button" onClick={() => onSelect(item.other!.id)}>{item.other!.label}</button></li>)}</ul> : <p className={styles.muted}>No visible connections. Widen the filters to check the full slice.</p>}
    <h3>Record details</h3>{detailState === 'loading' ? <p className={styles.muted}>Loading safe details…</p> : detailState === 'unavailable' ? <p className={styles.muted}>Detailed inspection is not available; the graph summary remains usable.</p> : detail ? <div className={styles.safeDetail}>
      <dl className={styles.detailList}>
        {detail.identity.sourceName && <div><dt>Source name</dt><dd>{detail.identity.sourceName}</dd></div>}
        {detail.identity.dateLabel && <div><dt>Date</dt><dd>{detail.identity.dateLabel}</dd></div>}
        {(detail.identity.startYear != null || detail.identity.endYear != null) && <div><dt>Years</dt><dd>{detail.identity.startYear ?? '?'}–{detail.identity.endYear ?? '?'}</dd></div>}
        {detail.identity.publicationStatus && <div><dt>Visibility</dt><dd>{detail.identity.publicationStatus}</dd></div>}
        {detail.identity.sourceId && <div><dt>Source</dt><dd>{detail.identity.sourceId}</dd></div>}
      </dl>
      {!!detail.aliases.length && <section><h4>Known names · {detail.aliases.length}</h4><ul className={styles.compactList}>{detail.aliases.slice(0, 6).map((alias) => <li key={alias.id}><strong>{alias.alias}</strong>{alias.languageCode && <span>{alias.languageCode}</span>}</li>)}</ul></section>}
      {!!detail.claims.length && <section><h4>Claims · {detail.claims.length}</h4><ul className={styles.claimList}>{detail.claims.slice(0, 5).map((claim) => <li key={claim.id}>{claim.statement}<span>{claim.status}{claim.dateLabel ? ` · ${claim.dateLabel}` : ''}</span></li>)}</ul></section>}
      {!!detail.connections.length && <section><h4>Database connections · {detail.connections.length}</h4><ul className={styles.compactList}>{detail.connections.slice(0, 6).map((connection) => <li key={connection.id}><button type="button" onClick={() => onSelect(connection.neighborId)}>{connection.neighborName}</button><span>{connection.direction === 'outgoing' ? `${connection.predicate} →` : `← ${connection.predicate}`}</span></li>)}</ul></section>}
      {!!detail.citations.length && <section><h4>Citations · {detail.citations.length}</h4><ul className={styles.citationList}>{detail.citations.slice(0, 4).map((citation) => <li key={`${citation.sourceId}-${citation.pageRefs.join('-')}`}><strong>{citation.sourceTitle}</strong><span>{citation.publicCitation}{citation.pageRefs.length ? ` · ${citation.pageRefs.join(', ')}` : ''}</span></li>)}</ul></section>}
      {detail.truncated && <p className={styles.muted}>This safe preview is bounded; more linked records exist.</p>}
    </div> : null}</>}
</aside>

const RelationsView = ({ counts, max, edges, byId, onSelect, selectedId }: { counts: Array<[string, number]>; max: number; edges: Edge[]; byId: Map<string, Node>; onSelect: (id: string) => void; selectedId: string | null }) => <section className={styles.relationsGrid}>
  <article className={styles.distribution}><div className={styles.sectionHead}><div><span>Relation vocabulary</span><h2>What connects the graph</h2></div><strong>{counts.length} predicates</strong></div><ol>{counts.slice(0, 14).map(([label, count]) => <li key={label}><div><span>{label}</span><strong>{count}</strong></div><i><b style={{ width: `${count / max * 100}%` }} /></i></li>)}</ol></article>
  <article className={styles.relationLedger}><div className={styles.sectionHead}><div><span>Directed relation ledger</span><h2>Subject → object</h2></div><strong>{edges.length} shown</strong></div>{edges.length ? <div className={styles.tableScroll}><table><thead><tr><th>Subject</th><th>Predicate</th><th>Object</th><th>Status</th></tr></thead><tbody>{edges.map((edge) => { const subject = byId.get(edge.sourceId); const object = byId.get(edge.targetId); return <tr key={edge.id} data-selected={selectedId === edge.sourceId || selectedId === edge.targetId}><td>{subject ? <button type="button" onClick={() => onSelect(subject.id)}>{subject.label}</button> : '—'}</td><td><span className={styles.predicate}>{edge.label} →</span></td><td>{object ? <button type="button" onClick={() => onSelect(object.id)}>{object.label}</button> : '—'}</td><td>{edge.status}</td></tr> })}</tbody></table></div> : <p className={styles.muted}>No relations connect the current filtered entities.</p>}</article>
</section>

const Ledger = ({ nodes, degrees, selectedId, sort, ascending, onSort, onSelect }: { nodes: Node[]; degrees: Map<string, number>; selectedId: string | null; sort: SortKey; ascending: boolean; onSort: (key: SortKey) => void; onSelect: (id: string) => void }) => <section className={styles.ledger}><div className={styles.sectionHead}><div><span>Curator ledger</span><h2>Filtered entities</h2></div><strong>{nodes.length} shown</strong></div><div className={styles.tableScroll}><table><caption>Activate an entity name to inspect it in the network.</caption><thead><tr>{([['name', 'Name'], ['kind', 'Type'], ['status', 'Review state'], ['degree', 'Relations']] as Array<[SortKey, string]>).map(([key, label]) => <th key={key} aria-sort={sort === key ? ascending ? 'ascending' : 'descending' : 'none'}><button type="button" onClick={() => onSort(key)}>{label}{sort === key && <span>{ascending ? ' ↑' : ' ↓'}</span>}</button></th>)}</tr></thead><tbody>{nodes.map((node) => <tr key={node.id} data-selected={node.id === selectedId}><td><button type="button" className={styles.entityLink} onClick={() => onSelect(node.id)}>{node.label}</button></td><td><span className={styles.kind}><i style={{ background: kindColour(node.kind) }} />{node.kind}</span></td><td>{node.status}</td><td>{degrees.get(node.id) ?? 0}</td></tr>)}</tbody></table></div></section>
