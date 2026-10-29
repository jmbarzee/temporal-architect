// The host shell: owns every piece of state the view reads (filter, pins,
// chain, search, theme, focus), and supplies what only the host can know —
// chip counts, findings, programme groups, and what "Open details" does.

import React from 'react'
import {
  GraphView, OntologyContext, copyGroups, copyKeyOf, defaultFilter, payloadString, pinnedFor, reconcileFilter, schemeVars, selectionFor, useHostTheme, withSelection,
} from '@temporal-architect/graph-view'
import type {
  ActiveGroup, FilterState, FocusTarget, Graph, GraphNode, NodeGroup, PinState, Selection, Theme, ThemeChoice,
} from '@temporal-architect/graph-view'
import { catalog } from './data'
import type { Campus, Catalog } from './data'
import { buildGraph } from './graph'
import { CAMPUS, CAMPUS_LABEL, ENTITY, ontology, payloadNumber } from './ontology'
import type { Entity } from './ontology'
import './app.css'

const graph = buildGraph(catalog)
const nodeByCode = new Map([...graph.nodes.values()].map(n => [payloadString(n, 'code') ?? n.id, n]))

/** Chip badges: distinct catalog entries per value — a cross-listed course counts once. */
function countsOf(data: Catalog, campuses: Selection): ReadonlyMap<string, ReadonlyMap<string, number>> {
  const entity = new Map<string, number>([
    ['faculty', data.faculties.length],
    ['department', data.departments.length],
  ])
  const campus = new Map<string, number>()
  const bump = (m: Map<string, number>, k: string, by = 1) => m.set(k, (m.get(k) ?? 0) + by)
  for (const c of data.courses) {
    bump(campus, c.campus)
    if (campuses.size > 0 && !campuses.has(c.campus)) continue
    bump(entity, 'course')
    bump(entity, 'lab', c.labs?.length ?? 0)
  }
  return new Map([
    [ENTITY, entity],
    [CAMPUS, campus],
  ])
}

/** Data-quality warnings the registrar should see. */
function findingsOf(data: Catalog): string[] {
  const codes = new Set(data.courses.flatMap(c => [...c.listings, ...(c.labs ?? []).map(l => l.code)]))
  const subjects = new Set(data.departments.map(d => d.subject))
  const out: string[] = []
  for (const c of data.courses) {
    for (const code of c.listings) if (!subjects.has(code.split(' ')[0])) out.push(`${code} is listed under a subject no department owns`)
    for (const r of c.requires ?? []) if (!codes.has(r.code)) out.push(`${c.listings[0]} requires ${r.code}, which is not in the catalog`)
  }
  for (const p of data.programmes) for (const code of p.courses) if (!codes.has(code)) out.push(`${p.name} lists ${code}, which is not in the catalog`)
  return out
}
const FINDINGS = findingsOf(catalog)

/** A programme glows over every copy of its courses and their labs. */
function programmeGroups(g: Graph, enabled: ReadonlySet<string>, hovered: string | null): NodeGroup[] {
  const copies = copyGroups(g)
  return catalog.programmes.filter(p => enabled.has(p.id)).map(p => {
    const ids = new Set<string>()
    for (const code of p.courses) {
      const node = nodeByCode.get(code)
      if (node) for (const copy of copies.get(copyKeyOf(node)) ?? []) ids.add(copy)
    }
    for (const n of g.nodes.values()) if (n.parentId && ids.has(n.parentId)) ids.add(n.id)
    return { id: p.id, nodeIds: ids, emphasized: hovered === p.id }
  })
}

const focusTargetOf = (n: GraphNode): FocusTarget => ({ name: n.name, values: n.dimensions })
const NO_PINS = new Set<string>()

export function App({ initialTheme = 'system' }: { initialTheme?: ThemeChoice }) {
  const [filter, setFilter] = React.useState<FilterState>(() => defaultFilter(ontology, graph))
  const [pins, setPins] = React.useState<PinState>(() => new Map())
  const [chain, setChain] = React.useState<readonly string[]>(() => ontology.filterDimensions.map(d => d.id))
  const [search, setSearch] = React.useState({ query: '', active: false })
  const [themeChoice, setThemeChoice] = React.useState<ThemeChoice>(initialTheme)
  const [pendingFocus, setPendingFocus] = React.useState<FocusTarget | null>(null)
  const [overriddenPins, setOverriddenPins] = React.useState<Set<string>>(NO_PINS)
  const [enabled, setEnabled] = React.useState<ReadonlySet<string>>(() => new Set(catalog.programmes.map(p => p.id)))
  const [hovered, setHovered] = React.useState<string | null>(null)
  const [details, setDetails] = React.useState<FocusTarget | null>(null)

  // The side panel and legend follow the pane's theme, so the shell resolves it the same way.
  const rootRef = React.useRef<HTMLDivElement>(null)
  const hostTheme = useHostTheme(rootRef)
  const theme: Theme = themeChoice === 'system' ? hostTheme : themeChoice
  const scheme = React.useMemo(() => schemeVars(ontology, theme) as React.CSSProperties, [theme])

  const counts = React.useMemo(() => countsOf(catalog, selectionFor(filter, CAMPUS)), [filter])
  const groups = React.useMemo(() => programmeGroups(graph, enabled, hovered), [enabled, hovered])

  /** Widen the filter just enough to show `node`, then ask the view to centre on it. */
  const reveal = (node: GraphNode) => {
    const target = focusTargetOf(node)
    const shown = chain.flatMap(id => ontology.descriptorFor(id) ?? [])
    const result = reconcileFilter(filter, filter, pins, { kind: 'focus', target }, shown)
    setFilter(result.filter)
    setOverriddenPins(result.overriddenPins)
    setPendingFocus(target)
  }
  const onlyCampus = (campus: string) => setFilter(f => withSelection(f, CAMPUS, new Set([campus])))
  // Stable: the view restarts its pin-flash timer whenever this identity changes.
  const clearOverriddenPins = React.useCallback(() => setOverriddenPins(NO_PINS), [])
  const clearPendingFocus = React.useCallback(() => setPendingFocus(null), [])

  return (
    <OntologyContext.Provider value={ontology}>
      <div ref={rootRef} className="catalog-app" data-theme={theme} style={scheme}>
        <div className="catalog-pane">
          <GraphView
            active
            graph={graph}
            counts={counts}
            findings={FINDINGS.length > 0 && <Findings messages={FINDINGS} />}
            groups={groups}
            groupsControl={active => <ProgrammeLegend active={active} enabled={enabled} onToggle={id => setEnabled(prev => toggled(prev, id))} onHover={setHovered} />}
            crossView={{ label: 'Open details', onFocus: setDetails }}
            theme={themeChoice}
            onThemeChange={setThemeChoice}
            filter={filter}
            onFilterChange={setFilter}
            pins={pins}
            onPinsChange={setPins}
            chain={chain}
            onChainChange={setChain}
            searchQuery={search.query}
            searchActive={search.active}
            onSearchChange={(query, active) => setSearch({ query, active })}
            pendingFocus={pendingFocus}
            onFocusConsumed={clearPendingFocus}
            overriddenPins={overriddenPins}
            onOverriddenPinsConsumed={clearOverriddenPins}
          />
        </div>
        {details && (
          <Details
            target={details}
            campusPinned={pinnedFor(pins, CAMPUS)}
            onReveal={reveal}
            onOnlyCampus={onlyCampus}
            onClose={() => setDetails(null)}
          />
        )}
      </div>
    </OntologyContext.Provider>
  )
}

function toggled(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(set)
  if (!next.delete(id)) next.add(id)
  return next
}

function Findings({ messages }: { messages: readonly string[] }) {
  return (
    <details className="catalog-findings">
      <summary>{messages.length} catalog warning{messages.length === 1 ? '' : 's'}</summary>
      <ul>{messages.map(m => <li key={m}>{m}</li>)}</ul>
    </details>
  )
}

function ProgrammeLegend({ active, enabled, onToggle, onHover }: {
  active: readonly ActiveGroup[]
  enabled: ReadonlySet<string>
  onToggle: (id: string) => void
  onHover: (id: string | null) => void
}) {
  return (
    <div className="catalog-legend" onMouseLeave={() => onHover(null)}>
      <div className="catalog-legend-title">Degree programmes</div>
      {catalog.programmes.map(p => {
        const drawn = active.find(a => a.id === p.id)
        return (
          <label key={p.id} className="catalog-legend-row" onMouseEnter={() => onHover(p.id)}>
            <input type="checkbox" checked={enabled.has(p.id)} onChange={() => onToggle(p.id)} />
            <span className="catalog-swatch" style={{ background: drawn?.color ?? 'transparent' }} />
            {p.name}
            {enabled.has(p.id) && !drawn && <span className="catalog-muted"> (filtered out)</span>}
          </label>
        )
      })}
    </div>
  )
}

/**
 * What "Open details" shows. The view hands over a name and the node's
 * dimension map, not the node, so the host looks its own records up again.
 */
function Details({ target, campusPinned, onReveal, onOnlyCampus, onClose }: {
  target: FocusTarget
  campusPinned: boolean
  onReveal: (node: GraphNode) => void
  onOnlyCampus: (campus: string) => void
  onClose: () => void
}) {
  const entity = target.values[ENTITY] as Entity | undefined
  const campus = target.values[CAMPUS] as Campus | undefined
  const listings = [...graph.nodes.values()].filter(n => n.name === target.name && n.dimensions[ENTITY] === entity)
  const first = listings[0]
  const course = catalog.courses.find(c => c.id === (first && payloadString(first, 'courseId')))
  const credits = first && payloadNumber(first, 'credits')
  return (
    <aside className="catalog-details">
      <button className="catalog-close" onClick={onClose} aria-label="Close details">×</button>
      <div className="catalog-muted">{entity ? ontology.styleOf(entity).label : 'Unknown'}</div>
      <h2>{target.name}</h2>
      <dl>
        {listings.length > 0 && <><dt>Listed as</dt><dd>{listings.map(n => payloadString(n, 'code')).filter(Boolean).join(', ') || '—'}</dd></>}
        {credits !== undefined && <><dt>Credits</dt><dd>{credits}</dd></>}
        {first && payloadString(first, 'term') && <><dt>Term</dt><dd>{payloadString(first, 'term')}</dd></>}
        {first && payloadString(first, 'dean') && <><dt>Dean</dt><dd>{payloadString(first, 'dean')}</dd></>}
        {campus && <><dt>Campus</dt><dd>{CAMPUS_LABEL[campus]}</dd></>}
      </dl>
      {campus && (
        <button disabled={campusPinned} title={campusPinned ? 'The campus filter is pinned' : undefined} onClick={() => onOnlyCampus(campus)}>
          Show only {CAMPUS_LABEL[campus]}
        </button>
      )}
      {course?.requires && (
        <>
          <h3>Requires</h3>
          <ul className="catalog-requires">
            {course.requires.map(r => {
              const node = nodeByCode.get(r.code)
              return (
                <li key={r.code}>
                  <span className={`catalog-req catalog-req-${r.kind}`}>{r.kind}</span> {r.code}
                  {node ? <button onClick={() => onReveal(node)}>Reveal</button> : <span className="catalog-missing">missing</span>}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </aside>
  )
}
