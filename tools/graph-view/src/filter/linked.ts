// The linked-views reducer: what a switch between two views does to their
// filters. Pure, so a host that keeps its own state can call it, and so the
// hook that keeps the state for a host (`useLinkedViews`) is a thin shell
// around something the harness can pin.

import type { AxisId } from '../graph/axis'
import type { Graph } from '../graph/model'
import type { Taxonomy } from '../graph/taxonomy'
import { reconcileFilter } from './reconcile'
import type { AxisLocks, FilterState, ReconcileResult, ViewTransition } from './types'

/** One view's share of the linked state: what it filters on, what it holds against adoption, and what the last focus into it overrode. */
export interface LinkedViewState {
  filter: FilterState
  locks: AxisLocks
  /** The axes this view shows, in order — the ones a switch reconciles. */
  axes: readonly AxisId[]
  /** The locks the last switch into this view overrode: a focus's, a new set per focus so a bar flashes them once; a manual switch overrides none and clears it. */
  overriddenLocks: ReadonlySet<AxisId>
}

/** The one empty set every view starts from, so an unchanged state keeps its identity. */
export const NO_LOCKS: ReadonlySet<AxisId> = new Set()

/**
 * Switch to `to` from `from`: on a manual switch `to` adopts `from`'s
 * selections on the axes it shows, except where locked; on a focus `to`
 * widens just enough to show the target — to the whole chip holding its
 * value when `graph` is given — overriding locks (recorded). The same state
 * object comes back when nothing changed.
 */
export function linkedSwitch<V extends string>(
  state: Readonly<Record<V, LinkedViewState>>,
  taxonomy: Pick<Taxonomy, 'axisFor'>,
  to: V,
  from: V,
  transition: ViewTransition,
  graph?: Pick<Graph, 'nodes'>,
): { state: Readonly<Record<V, LinkedViewState>>; result: ReconcileResult } {
  const dest = state[to]
  const result = reconcileFilter({
    destination: dest.filter,
    source: state[from].filter,
    locks: dest.locks,
    transition,
    taxonomy,
    axes: dest.axes,
    graph,
  })
  const overridden: ReadonlySet<AxisId> = result.overriddenLocks.size > 0 ? result.overriddenLocks : NO_LOCKS
  const sameLocks = overridden === dest.overriddenLocks || (overridden.size === 0 && dest.overriddenLocks.size === 0)
  if (result.filter === dest.filter && sameLocks) return { state, result }
  return { state: { ...state, [to]: { ...dest, filter: result.filter, overriddenLocks: overridden } }, result }
}
