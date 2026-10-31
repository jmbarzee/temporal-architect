// reconcileFilter — the one decision point for what a destination view's
// filter is after a switch: what it adopts from the source on a manual
// switch, and how far it widens to reveal a focus target. Pure: the
// destination's filter, locks and axes, the source's filter, the transition
// and the taxonomy in; the new filter and the locks it had to override out.
// What differs per axis — what an empty selection means, how far a focus
// widens — is each descriptor's declared policy, read here, never assumed
// uniform: a shared rule would hide the whole graph on a focus into a
// narrowing axis.

import type {
  FilterState,
  AxisLocks,
  ViewTransition,
  ReconcileResult,
  FocusTarget,
} from './types'
import {
  filterStatesEqual,
  lockedFor,
  selectionFor,
  withSelection,
} from './types'
import type { AxisId, AxisValue, ResolvedAxisDescriptor } from '../graph/axis'
import { valuesOn } from '../graph/axis'
import type { Graph } from '../graph/model'
import type { Taxonomy } from '../graph/taxonomy'

/** What a reconciliation reads: the destination view's filter, locks and the axes it shows, the source view's filter, the transition, and the graph when a focus should widen by whole chips. */
export interface ReconcileInput {
  /** The view being switched to: its filter as it stands. */
  destination: FilterState
  /** The view being switched from. Read on a manual switch; a focus reads only the destination. */
  source: FilterState
  /** The destination's locks. */
  locks: AxisLocks
  transition: ViewTransition
  /** Resolves the axes' policies. */
  taxonomy: Pick<Taxonomy, 'axisFor'>
  /**
   * The axes the destination view SHOWS, by id — not every declared axis:
   * an axis the user removed from the bar is not filtering there, and
   * adopting a selection on it would revive what they reset. One the
   * taxonomy does not declare is skipped.
   */
  axes: readonly AxisId[]
  /**
   * The graph the destination shows. Given, a focus widens to the WHOLE
   * chip holding the target's value — the bar toggles a chip as a unit, so
   * a selection that split one would read as on with half its nodes hidden,
   * and the first click would turn the chip off. Absent, the value alone.
   */
  graph?: Pick<Graph, 'nodes'>
}

/**
 * The destination view's filter after a switch: on a manual switch it adopts
 * the source's selections on the axes it shows, except where locked; on a
 * focus it widens just enough to show the target, overriding locks, which
 * come back in `overriddenLocks` for the bar to flash. The same filter object
 * comes back when nothing changed.
 */
export function reconcileFilter({ destination, source, locks, transition, taxonomy, axes, graph }: ReconcileInput): ReconcileResult {
  const descriptors = axes.flatMap(id => { const d = taxonomy.axisFor(id); return d ? [d] : [] })
  switch (transition.kind) {
    case 'manual':
      return reconcileManual(destination, source, locks, descriptors)
    case 'focus':
      return reconcileFocus(destination, locks, transition.target, descriptors, graph)
  }
}

/**
 * manual: per axis, keep the destination's selection where locked, otherwise
 * adopt the source's. Locks are never overridden here, so nothing flashes.
 * Built with `withSelection`, so an axis whose content did not change keeps
 * its Set: the view reads a kept identity as "unchanged" and neither reheats
 * nor refits for it.
 */
function reconcileManual(
  destFilter: FilterState,
  sourceFilter: FilterState,
  destLocks: AxisLocks,
  axes: readonly ResolvedAxisDescriptor[],
): ReconcileResult {
  let next = destFilter
  for (const axis of axes) {
    if (lockedFor(destLocks, axis.id)) continue
    next = withSelection(next, axis.id, selectionFor(sourceFilter, axis.id))
  }
  return { filter: next, overriddenLocks: new Set<AxisId>() }
}

/**
 * focus: widen the destination just enough to show the target. Per axis, by
 * the descriptor's `widens`: `always` adds the target's value; `whenActive`
 * adds it only while a selection is active — on a narrowing axis an empty
 * selection already shows everything, and adding the first value would
 * narrow to it. With the graph given, the whole chip holding the value is
 * added, as far as the graph presents it. Locks are not changed; each locked
 * axis that had to widen is reported, so the destination's bar can flash it.
 */
function reconcileFocus(
  destFilter: FilterState,
  destLocks: AxisLocks,
  target: FocusTarget,
  axes: readonly ResolvedAxisDescriptor[],
  graph: Pick<Graph, 'nodes'> | undefined,
): ReconcileResult {
  let next = destFilter
  const overridden = new Set<AxisId>()

  for (const axis of axes) {
    const value = target.values[axis.id]
    if (value === undefined) continue

    const current = selectionFor(destFilter, axis.id)
    if (current.has(value)) continue
    if (axis.widens === 'whenActive' && current.size === 0) continue

    next = withSelection(next, axis.id, new Set([...current, ...chipValues(axis, value, graph)]))
    if (lockedFor(destLocks, axis.id)) overridden.add(axis.id)
  }

  return {
    filter: filterStatesEqual(next, destFilter) ? destFilter : next,
    overriddenLocks: overridden,
  }
}

/** The values a focus on `value` turns on: the whole chip holding it, as far as the graph presents its values; the value alone without a graph or a chip. */
function chipValues(axis: ResolvedAxisDescriptor, value: AxisValue, graph: Pick<Graph, 'nodes'> | undefined): readonly AxisValue[] {
  if (!graph) return [value]
  const present = valuesOn(graph.nodes, axis.id)
  const chip = axis.chipsFor(present).find(c => c.values.includes(value))
  if (!chip) return [value]
  const presentSet = new Set(present)
  const mine = chip.values.filter(v => presentSet.has(v))
  return mine.includes(value) ? mine : [value, ...mine]
}
