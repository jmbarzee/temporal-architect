// The host shell, leaning on the view's defaults. It controls the state its own
// panel writes (the filter) or follows (the selection, which closing the panel
// clears), observes the one its panel reads (the pins), hands the theme choice
// in from the URL, asks the view to reveal a node by naming it (`focusId`), and
// leaves the chain of axes and the search to the view. It supplies what only
// the host can know — chip counts, findings, programme groups, and what "Open
// details" does.

import React from 'react'
import {
  GraphView, TaxonomyContext, copyGroups, defaultFilter, payloadNumber, payloadString, lockedFor, schemeVars, selectionFor, withSelection,
} from '@temporal-architect/graph-view'
import type {
  ActiveGroup, FilterState, Graph, GraphNode, NodeGroup, AxisLocks, Selection, Theme, ThemeChoice,
} from '@temporal-architect/graph-view'
import { catalog } from './data'
import type { Campus, Catalog } from './data'
import { buildGraph } from './graph'
import { CAMPUS, CAMPUS_LABEL, ENTITY, taxonomy } from './taxonomy'
import type { Entity } from './taxonomy'
import './app.css'

const graph = buildGraph(catalog)
const nodeByCode = new Map([...graph.nodes.values()].map(n => [payloadString(n, 'code') ?? n.id, n]))
const copies = copyGroups(graph)

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
      if (node) for (const copy of copies.get(node.copyKey ?? node.id) ?? []) ids.add(copy)
    }
    for (const n of g.nodes.values()) if (n.parentId && ids.has(n.parentId)) ids.add(n.id)
    return { id: p.id, nodeIds: ids, emphasized: hovered === p.id }
  })
}

export function App({ initialTheme = 'system' }: { initialTheme?: ThemeChoice }) {
  // Controlled: the details panel's "Show only <campus>" writes the filter.
  const [filter, setFilter] = React.useState<FilterState>(() => defaultFilter(taxonomy, graph))
  // Uncontrolled but observed: the view keeps the pins, the panel reads one.
  const [pins, setPins] = React.useState<AxisLocks>(() => new Map())
  const [themeChoice, setThemeChoice] = React.useState<ThemeChoice>(initialTheme)
  const [enabled, setEnabled] = React.useState<ReadonlySet<string>>(() => new Set(catalog.programmes.map(p => p.id)))
  const [hovered, setHovered] = React.useState<string | null>(null)
  const [details, setDetails] = React.useState<GraphNode | null>(null)
  // Controlled: the panel's close clears it, and the view selects what it says.
  const [selected, setSelected] = React.useState<GraphNode | null>(null)
  // A request, not a state: the view applies it when it changes to an id, and
  // the host takes it back, so asking again for the same node asks again.
  const [focusId, setFocusId] = React.useState<string | null>(null)
  React.useEffect(() => { if (focusId) setFocusId(null) }, [focusId])

  // The side panel follows the pane's theme: the view reports the one it drew in.
  const [theme, setTheme] = React.useState<Theme>('light')

  const counts = React.useMemo(() => countsOf(catalog, selectionFor(filter, CAMPUS)), [filter])
  const groups = React.useMemo(() => programmeGroups(graph, enabled, hovered), [enabled, hovered])

  /** Ask the view to reveal `node`: it widens the filter just enough, centres and selects. */
  const reveal = (node: GraphNode) => setFocusId(node.id)
  const onlyCampus = (campus: string) => setFilter(f => withSelection(f, CAMPUS, new Set([campus])))

  return (
    <TaxonomyContext.Provider value={taxonomy}>
      <div className="catalog-app">
        <div className="catalog-pane">
          <GraphView
            graph={graph}
            counts={counts}
            findings={FINDINGS.length > 0 && <Findings messages={FINDINGS} />}
            groups={groups}
            groupsControl={active => <ProgrammeLegend active={active} enabled={enabled} onToggle={id => setEnabled(prev => toggled(prev, id))} onHover={setHovered} />}
            nodeAction={{ label: 'Open details', onSelect: setDetails }}
            onNodeActivate={setDetails}
            theme={themeChoice}
            onThemeChange={setThemeChoice}
            onThemeResolved={setTheme}
            filter={filter}
            onFilterChange={setFilter}
            onLocksChange={setPins}
            selectedId={selected?.id ?? null}
            onSelectionChange={setSelected}
            focusId={focusId}
          />
        </div>
        {details && (
          <Details
            node={details}
            theme={theme}
            campusPinned={lockedFor(pins, CAMPUS)}
            onReveal={reveal}
            onOnlyCampus={onlyCampus}
            onClose={() => { setDetails(null); setSelected(null) }}
          />
        )}
      </div>
    </TaxonomyContext.Provider>
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
 * What "Open details" shows: the node the view hands over, and its listings —
 * the nodes that share its copy key — for the records the node does not carry.
 *
 * The panel sits beside the view, not above it, so it carries the theme the
 * view reported on its own element. On an ancestor of the view it would be the
 * "host theme" the view reads for `system`, and the choice would stop following
 * the OS.
 */
function Details({ node, theme, campusPinned, onReveal, onOnlyCampus, onClose }: {
  node: GraphNode
  theme: Theme
  campusPinned: boolean
  onReveal: (node: GraphNode) => void
  onOnlyCampus: (campus: string) => void
  onClose: () => void
}) {
  const entity = node.dimensions[ENTITY] as Entity | undefined
  const campus = node.dimensions[CAMPUS] as Campus | undefined
  const scheme = React.useMemo(() => schemeVars(taxonomy, theme) as React.CSSProperties, [theme])
  const listings = [...(copies.get(node.copyKey ?? node.id) ?? [node.id])].flatMap(id => graph.nodes.get(id) ?? [])
  const first = listings[0]
  const course = catalog.courses.find(c => c.id === (first && payloadString(first, 'courseId')))
  const credits = first && payloadNumber(first, 'credits')
  return (
    <aside className="catalog-details" data-theme={theme} style={scheme}>
      <button className="catalog-close" onClick={onClose} aria-label="Close details">×</button>
      <div className="catalog-muted">{entity ? taxonomy.styleOf(entity).label : 'Unknown'}</div>
      <h2>{node.name}</h2>
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
