// useLinkedViews — the state two or more views share through one bar.
//
// A host with a second view used to lift each view's filter, locks and axes
// into its own state, write the reconcile call at every switch, and keep the
// overridden-lock set for the bar's flash by hand — a dozen pieces of state
// that every second view repeats. This owns them: one record per view, the
// props each view's `GraphView` or `FilterBar` takes, one `switchTo`.

import React from 'react'
import type { AxisId } from '../../graph/axis'
import type { Graph } from '../../graph/model'
import type { Taxonomy } from '../../graph/taxonomy'
import { NO_LOCKS, linkedSwitch } from '../../filter/linked'
import type { LinkedViewState } from '../../filter/linked'
import { defaultFilter, selectionFor, selectionsEqual, withSelection } from '../../filter/types'
import type { AxisLocks, FilterState, ReconcileResult, ViewTransition } from '../../filter/types'
import { useLatest } from './useControllable'

export type { LinkedViewState } from '../../filter/linked'

/** The state props of one linked view — spread onto its `GraphView` or `FilterBar`. */
export interface LinkedViewProps {
  filter: FilterState
  onFilterChange: (next: FilterState) => void
  locks: AxisLocks
  onLocksChange: (next: AxisLocks) => void
  axes: readonly AxisId[]
  onAxesChange: (next: readonly AxisId[]) => void
  /** The locks the last focus into this view overrode — the bar flashes them once per set. */
  overriddenLocks: ReadonlySet<AxisId>
}

/** What `useLinkedViews` is given: the taxonomy, the views by name, where each starts, and the graph the default filter is seeded from. */
export interface LinkedViewsOptions<V extends string> {
  taxonomy: Taxonomy
  /** The views, by the names the host switches between. */
  views: readonly V[]
  /** Where each view starts; a part left out defaults — the taxonomy's default filter over `graph`, no locks, every declared axis. Read once. */
  initial?: (view: V) => { filter?: FilterState; locks?: AxisLocks; axes?: readonly AxisId[] } | undefined
  /** The graph the default filter is seeded from, when `initial` gives a view no filter. */
  graph?: Pick<Graph, 'nodes'>
}

/** The state two or more views share through one bar: each view's props, the switch between views, and the whole for persistence. */
export interface LinkedViews<V extends string> {
  /** One view's state props. */
  of(view: V): LinkedViewProps
  /**
   * Switch to `to` from `from`: a manual switch adopts the source's selections
   * on the destination's axes except where locked; a focus widens the
   * destination to show the target and flashes the locks it overrode. Returns
   * the destination's new filter and the overridden locks. A focus into a
   * `GraphView` goes through this too, so the hook's state widens, and
   * through the view's `focus` prop, which centres and selects.
   */
  switchTo(to: V, transition: ViewTransition, from: V): ReconcileResult
  /** Rewrite one view's filter from its current value — a host rule that follows one view's data. */
  updateFilter(view: V, fn: (filter: FilterState) => FilterState): void
  /** Rewrite every view's filter at once — a stale value pruned when the data changes. */
  updateFilters(fn: (filter: FilterState, view: V) => FilterState): void
  /** Every view's filter, locks and axes, for a host that persists them. */
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
 * overrode — with each view's props (`of`), one `switchTo`, a per-view or
 * all-views filter rewrite, and the whole as `state`. `initial` is read once;
 * a view it gave no filter starts from the taxonomy's default over `graph`
 * and is re-seeded, as a pane is, when a later `graph` arrives.
 */
export function useLinkedViews<V extends string>({ taxonomy, views, initial, graph }: LinkedViewsOptions<V>): LinkedViews<V> {
  // The views whose filter the hook seeded itself: the ones a later graph re-seeds.
  const seededViewsRef = React.useRef(new Set<V>())
  const [state, setState] = React.useState<Readonly<Record<V, LinkedViewState>>>(() => recordOver(views, view => {
    const given = initial?.(view)
    if (given?.filter === undefined) seededViewsRef.current.add(view)
    return {
      filter: given?.filter ?? defaultFilter(taxonomy, graph ?? { nodes: [] }),
      locks: given?.locks ?? new Map(),
      axes: given?.axes ?? taxonomy.filterAxes.map(d => d.id),
      overriddenLocks: NO_LOCKS,
    }
  }))
  const stateRef = useLatest(state)
  const taxonomyRef = useLatest(taxonomy)

  // One set of callbacks per view, made once: a view's props keep their
  // identity across renders, so a memoised view does not re-render for them.
  const viewKey = views.join('\u0000')
  const callbacks = React.useMemo(() => recordOver(views, (view): Pick<LinkedViewProps, 'onFilterChange' | 'onLocksChange' | 'onAxesChange'> => ({
    onFilterChange: filter => setState(prev => (prev[view].filter === filter ? prev : { ...prev, [view]: { ...prev[view], filter } })),
    onLocksChange: locks => setState(prev => (prev[view].locks === locks ? prev : { ...prev, [view]: { ...prev[view], locks } })),
    onAxesChange: axes => setState(prev => (prev[view].axes === axes ? prev : { ...prev, [view]: { ...prev[view], axes } })),
  })), [viewKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const props = React.useMemo(() => recordOver(views, (view): LinkedViewProps => ({ ...state[view], ...callbacks[view] })), [state, callbacks]) // eslint-disable-line react-hooks/exhaustive-deps

  // A graph that arrives after the mount re-seeds, in every view the hook
  // seeded itself, each axis that still holds the selection it opened with —
  // as a pane does for its own filter — so a host that mounts empty while its
  // data loads is not left with a list that shows nothing. An axis the user
  // changed keeps their selection.
  const seededFromRef = React.useRef(graph)
  React.useEffect(() => {
    const before = seededFromRef.current
    if (before === graph || graph === undefined) return
    seededFromRef.current = graph
    const opened = defaultFilter(taxonomyRef.current, before ?? { nodes: [] })
    const seed = defaultFilter(taxonomyRef.current, graph)
    setState(prev => {
      let changed = false
      const out: Record<V, LinkedViewState> = { ...prev }
      for (const view of seededViewsRef.current) {
        let filter = prev[view].filter
        for (const d of taxonomyRef.current.filterAxes) {
          if (!selectionsEqual(selectionFor(filter, d.id), selectionFor(opened, d.id))) continue
          filter = withSelection(filter, d.id, selectionFor(seed, d.id))
        }
        if (filter !== prev[view].filter) { changed = true; out[view] = { ...prev[view], filter } }
      }
      return changed ? out : prev
    })
  }, [graph]) // eslint-disable-line react-hooks/exhaustive-deps

  const switchTo = React.useCallback((to: V, transition: ViewTransition, from: V): ReconcileResult => {
    // The answer for the caller comes from the last state this closure saw;
    // the write is a functional update, so it composes with a write queued in
    // the same tick — a bar's own, or an `updateFilter` just before — rather
    // than overwriting it.
    const { state: next, result } = linkedSwitch(stateRef.current, taxonomyRef.current, to, from, transition)
    stateRef.current = next
    setState(prev => linkedSwitch(prev, taxonomyRef.current, to, from, transition).state)
    return result
  }, [stateRef, taxonomyRef])

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

  return React.useMemo(() => ({ of: (view: V) => props[view], switchTo, updateFilter, updateFilters, state }), [props, switchTo, updateFilter, updateFilters, state])
}
