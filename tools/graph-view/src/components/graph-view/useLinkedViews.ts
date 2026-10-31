// useLinkedViews — the state two or more views share through one bar: each
// view's filter, locks and axes, the view shown, the search they share, and
// the focus a switch asks of a pane. One record per view, the props each
// view's `GraphView` or `FilterBar` takes, one `switchTo`, one `focus`.

import React from 'react'
import type { AxisId } from '../../graph/axis'
import type { Graph, GraphNode } from '../../graph/model'
import type { Taxonomy } from '../../graph/taxonomy'
import { NO_LOCKS, linkedSwitch } from '../../filter/linked'
import type { LinkedViewState } from '../../filter/linked'
import { changedAxes, initialFilter, reseedFilter } from '../../filter/types'
import type { AxisLocks, FilterState, ReconcileResult, ViewTransition } from '../../filter/types'
import type { SearchState } from '../FilterBar'
import type { FocusRequest } from './focus'
import { useLatest } from './useControllable'

export type { LinkedViewState } from '../../filter/linked'

/** The state props of one linked view — spread onto its `GraphView` or `FilterBar`. */
export interface LinkedViewProps {
  filter: FilterState
  /** A change to the filter; `touched` names the axes the user changed (the bar's and the pane's writes name them), which a later graph then leaves alone. */
  onFilterChange: (next: FilterState, touched?: readonly AxisId[]) => void
  locks: AxisLocks
  onLocksChange: (next: AxisLocks) => void
  axes: readonly AxisId[]
  onAxesChange: (next: readonly AxisId[]) => void
  /** The locks the last switch into this view overrode — a focus's, which the bar flashes once per set; a manual switch clears it. */
  overriddenLocks: ReadonlySet<AxisId>
  /** The search the views share: the same value and callback in every view's props. */
  search: SearchState
  onSearchChange: (next: SearchState) => void
  /** The focus `linked.focus` asked of this view, until the pane reports it; a `FilterBar` ignores it. */
  focus: FocusRequest | null
  onFocusResult: (request: FocusRequest, shown: boolean) => void
}

/** What `useLinkedViews` is given: the taxonomy, the views by name, where each starts, the graph the default filter is seeded from, and the view shown first. */
export interface LinkedViewsOptions<V extends string> {
  taxonomy: Taxonomy
  /** The views, by the names the host switches between. Read once. */
  views: readonly V[]
  /** Where each view starts; a part left out defaults — the taxonomy's default filter over `graph`, no locks, every declared axis. Read once. A filter given here counts as the user's on every axis where it differs from that default. */
  initial?: (view: V) => { filter?: FilterState; locks?: AxisLocks; axes?: readonly AxisId[] } | undefined
  /** The graph the views show: the default filter is seeded from it, a later one re-seeds every view on the axes the user has not touched, and a focus widens by its whole chips. */
  graph?: Pick<Graph, 'nodes'>
  /** The view shown first. Default: the first of `views`. Read once. */
  start?: V
  /** Where the shared search starts — a persisted query, say. Default: closed and empty. Read once. */
  initialSearch?: SearchState
}

/** The state two or more views share through one bar: each view's props, the view shown, the switch and the focus between views, and the whole for persistence. */
export interface LinkedViews<V extends string> {
  /** One view's state props. Throws for a view not in `views`. */
  of(view: V): LinkedViewProps
  /** The view shown: `start`, then the last `switchTo` or `focus`. */
  readonly active: V
  /**
   * Switch to `to` from the active view and make it active: a manual switch
   * (the default) adopts the active view's selections on the destination's
   * axes except where locked; a focus widens the destination to show the
   * target and flashes the locks it overrode. Returns the destination's new
   * filter and the overridden locks.
   */
  switchTo(to: V, transition?: ViewTransition): ReconcileResult
  /**
   * Show `node` in `view`: a focus switch to it, and — for a `GraphView` —
   * a request in `of(view).focus` that centres on and selects the node once
   * it is in the graph, cleared when the pane reports it.
   */
  focus(view: V, node: GraphNode): ReconcileResult
  /** Rewrite one view's filter from its current value — a host rule that follows one view's data. */
  updateFilter(view: V, fn: (filter: FilterState) => FilterState): void
  /** Rewrite every view's filter at once — a stale value pruned when the data changes. */
  updateFilters(fn: (filter: FilterState, view: V) => FilterState): void
  /** The search the views share. */
  readonly search: SearchState
  /** Every view's filter, locks and axes, for a host that persists them (with `active` and `search`). */
  readonly state: Readonly<Record<V, LinkedViewState>>
}

/**
 * A record over the views, filled by a loop over every one of them so every
 * key is present. `Object.create` answers `any`, which is how the loop's
 * result takes the record's type without asserting a key space.
 */
function recordOver<V extends string, T>(views: readonly V[], make: (view: V) => T): Record<V, T> {
  const out: Record<V, T> = Object.create(null)
  for (const view of views) out[view] = make(view)
  return out
}

/**
 * One record per view — filter, locks, axes, the locks the last focus into it
 * overrode, the focus asked of it — with each view's props (`of`), the view
 * shown (`active`), `switchTo` and `focus`, a per-view or all-views filter
 * rewrite, the shared `search`, and the whole as `state`. `views`, `initial`,
 * `start` and `initialSearch` are read once. A later `graph` re-seeds every
 * view on the axes the user has not touched — the ones no write through
 * `onFilterChange` named, and on which a filter `initial` gave did not differ
 * from the default — so a host that mounts empty is not left blank and the
 * user's own selections stand.
 */
export function useLinkedViews<V extends string>({ taxonomy, views, initial, graph, start, initialSearch }: LinkedViewsOptions<V>): LinkedViews<V> {
  // The axes the user has touched, per view: state, not an inference — a
  // selection that happens to equal a graph's opening one is not thereby
  // untouched. A filter `initial` gave starts touched where it differs from
  // the default; every write that names its axes adds them.
  const touchedRef = React.useRef<Record<V, Set<AxisId>>>(recordOver(views, () => new Set<AxisId>()))
  const [state, setState] = React.useState<Readonly<Record<V, LinkedViewState>>>(() => recordOver(views, view => {
    const given = initial?.(view)
    const seed = initialFilter(taxonomy, graph ?? { nodes: [] })
    if (given?.filter !== undefined) for (const axis of changedAxes(seed, given.filter)) touchedRef.current[view].add(axis)
    return {
      filter: given?.filter ?? seed,
      locks: given?.locks ?? new Map(),
      axes: given?.axes ?? taxonomy.filterAxes.map(d => d.id),
      overriddenLocks: NO_LOCKS,
    }
  }))
  const [active, setActive] = React.useState<V>(() => start ?? views[0]!)
  const [search, setSearch] = React.useState<SearchState>(() => initialSearch ?? { query: '', active: false })
  const [focusRequests, setFocusRequests] = React.useState<Readonly<Record<V, FocusRequest | null>>>(() => recordOver(views, () => null))
  const focusSeq = React.useRef(0)
  const stateRef = useLatest(state)
  const activeRef = useLatest(active)
  const taxonomyRef = useLatest(taxonomy)
  const graphRef = useLatest(graph)

  // One set of callbacks per view, made once: a view's props keep their
  // identity across renders, so a memoised view does not re-render for them.
  const viewKey = views.join('\u0000')
  const callbacks = React.useMemo(() => recordOver(views, (view): Pick<LinkedViewProps, 'onFilterChange' | 'onLocksChange' | 'onAxesChange' | 'onSearchChange' | 'onFocusResult'> => ({
    onFilterChange: (filter, touched = []) => {
      for (const axis of touched) touchedRef.current[view].add(axis)
      setState(prev => (prev[view].filter === filter ? prev : { ...prev, [view]: { ...prev[view], filter } }))
    },
    onLocksChange: locks => setState(prev => (prev[view].locks === locks ? prev : { ...prev, [view]: { ...prev[view], locks } })),
    onAxesChange: axes => setState(prev => (prev[view].axes === axes ? prev : { ...prev, [view]: { ...prev[view], axes } })),
    onSearchChange: setSearch,
    // The request is spent once the pane reports it, so a pane that mounts
    // again later does not act on it twice.
    onFocusResult: request => setFocusRequests(prev => (prev[view] === request ? { ...prev, [view]: null } : prev)),
  })), [viewKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const props = React.useMemo(() => recordOver(views, (view): LinkedViewProps => ({ ...state[view], ...callbacks[view], search, focus: focusRequests[view] })), [state, callbacks, search, focusRequests]) // eslint-disable-line react-hooks/exhaustive-deps

  // A graph that arrives after the mount re-seeds every view on the axes the
  // user has not touched — so a host that mounts empty while its data loads
  // is not left with a list that shows nothing, and a value first seen later
  // is not born hidden. The user's selections stand.
  const seededFromRef = React.useRef(graph)
  React.useEffect(() => {
    if (seededFromRef.current === graph || graph === undefined) return
    seededFromRef.current = graph
    setState(prev => {
      let changed = false
      const out: Record<V, LinkedViewState> = { ...prev }
      for (const view of Object.keys(prev) as V[]) {
        const filter = reseedFilter(prev[view].filter, taxonomyRef.current, graph, touchedRef.current[view])
        if (filter !== prev[view].filter) { changed = true; out[view] = { ...prev[view], filter } }
      }
      return changed ? out : prev
    })
  }, [graph]) // eslint-disable-line react-hooks/exhaustive-deps

  const switchTo = React.useCallback((to: V, transition: ViewTransition = { kind: 'manual' }): ReconcileResult => {
    const from = activeRef.current
    // The answer for the caller comes from the last state this closure saw;
    // the write is a functional update, so it composes with a write queued in
    // the same tick — a bar's own, or an `updateFilter` just before — rather
    // than overwriting it.
    const { state: next, result } = linkedSwitch(stateRef.current, taxonomyRef.current, to, from, transition, graphRef.current)
    stateRef.current = next
    setState(prev => linkedSwitch(prev, taxonomyRef.current, to, from, transition, graphRef.current).state)
    activeRef.current = to
    setActive(to)
    return result
  }, [stateRef, activeRef, taxonomyRef, graphRef])

  const focus = React.useCallback((view: V, node: GraphNode): ReconcileResult => {
    const result = switchTo(view, { kind: 'focus', target: { values: node.values } })
    setFocusRequests(prev => ({ ...prev, [view]: { id: node.id, key: ++focusSeq.current } }))
    return result
  }, [switchTo])

  const updateFilter = React.useCallback((view: V, fn: (filter: FilterState) => FilterState) => {
    setState(prev => {
      const filter = fn(prev[view].filter)
      return filter === prev[view].filter ? prev : { ...prev, [view]: { ...prev[view], filter } }
    })
  }, [])

  const updateFilters = React.useCallback((fn: (filter: FilterState, view: V) => FilterState) => {
    setState(prev => {
      let changed = false
      const out: Record<V, LinkedViewState> = { ...prev }
      for (const view of Object.keys(prev) as V[]) {
        const filter = fn(prev[view].filter, view)
        if (filter !== prev[view].filter) { changed = true; out[view] = { ...prev[view], filter } }
      }
      return changed ? out : prev
    })
  }, [])

  return React.useMemo(() => ({
    of: (view: V) => {
      // Judged on the state the hook holds, not the props record: a view
      // added to `views` after the mount has props but no state, and a pane
      // spread from them would be silently uncontrolled.
      const found = state[view] === undefined ? undefined : props[view]
      if (found === undefined) throw new Error(`useLinkedViews: no view ${JSON.stringify(view)}; the views (read once, at mount) are ${Object.keys(state).map(v => JSON.stringify(v)).join(', ')}`)
      return found
    },
    active, switchTo, focus, updateFilter, updateFilters, search, state,
  }), [props, active, switchTo, focus, updateFilter, updateFilters, search, state]) // eslint-disable-line react-hooks/exhaustive-deps
}
