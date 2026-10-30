// The filter model a host's views share.
//
// A filter is a selection per axis. It was two named fields once, which is why
// every consumer had one branch per axis and a third axis meant a third branch
// everywhere; now it is a map over whatever axes the host declares.
//
// **Set identity is load-bearing here, not an optimisation.**
// `useVisibleGraph` memoises on the Set reference and `useSimulationLoop`
// compares `prev === next` to decide whether an axis changed. So every operation
// in this module is copy-on-write: the axis being edited gets a new Set, and
// every other axis keeps its *exact* instance. A helper that rebuilt the whole
// record would re-run edge graduation and reheat the layout on every unrelated
// edit — silently, since the output is identical.
//
// The search query lives outside a FilterState because it is globally shared.

import type { DimensionId, ResolvedDimensionDescriptor } from '../graph/dimension'
import { valuesOn } from '../graph/dimension'
import type { Graph } from '../graph/model'
import type { Ontology } from '../graph/ontology'

/** The chosen values on one axis. Empty means what the axis's descriptor says. */
export type Selection = ReadonlySet<string>

/**
 * A selection per axis.
 *
 * A `Map`, not a `Record`, and that is a correctness decision rather than taste.
 * A string-keyed record permits `filter.selectedFiles` — it typechecks, returns
 * `undefined`, and every downstream `.has` throws or silently reports nothing.
 * That exact mistake survived the migration in **six** separate places (three
 * production, three in the harness), passing typecheck and every automated
 * check, and was caught only by loading the app. The domain has no axis called
 * `selectedFiles`; a Map makes saying so unrepresentable instead of merely
 * wrong.
 */
export type FilterState = ReadonlyMap<DimensionId, Selection>

/**
 * Per-axis freeze state. A pinned axis is not adopted from the source view by
 * the `manual` reconciler.
 */
export type PinState = ReadonlyMap<DimensionId, boolean>

/** Retained as a name for readability; an axis is identified by its dimension. */
export type FilterDimension = DimensionId

const EMPTY: Selection = new Set<string>()

/**
 * The selection on one axis, or an empty one.
 *
 * Always returns the *same* empty Set, so an absent axis does not change
 * identity between reads — a fresh `new Set()` per call would defeat exactly the
 * memoisation this module exists to protect.
 */
export function selectionFor(state: FilterState, dim: DimensionId): Selection {
  return state.get(dim) ?? EMPTY
}

/** Every axis the state carries a selection for. */
export function dimensionsOf(state: FilterState): DimensionId[] {
  return [...state.keys()].sort()
}

export function selectionsEqual(a: Selection, b: Selection): boolean {
  if (a === b) return true
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}

/**
 * Replace one axis's selection, copy-on-write.
 *
 * Returns `state` **itself** when the new selection is content-equal to the old
 * one, so a no-op edit changes no identity anywhere. Otherwise only the edited
 * axis gets a new Set; every other axis is carried over by reference.
 */
export function withSelection(
  state: FilterState,
  dim: DimensionId,
  next: Selection,
): FilterState {
  if (selectionsEqual(selectionFor(state, dim), next)) return state
  const out = new Map(state)
  out.set(dim, next)
  return out
}

/** Structural equality across every axis either state mentions. */
export function filterStatesEqual(a: FilterState, b: FilterState): boolean {
  if (a === b) return true
  const dims = new Set([...a.keys(), ...b.keys()])
  for (const d of dims) {
    if (!selectionsEqual(selectionFor(a, d), selectionFor(b, d))) return false
  }
  return true
}

/** Flip one axis's pin, copy-on-write. */
export function withPin(pins: PinState, dim: DimensionId, value: boolean): PinState {
  const out = new Map(pins)
  out.set(dim, value)
  return out
}

export function pinnedFor(pins: PinState, dim: DimensionId): boolean {
  return pins.get(dim) ?? false
}

/**
 * Where a focus transition wants to land: the target's value per axis. An
 * axis the target says nothing about is absent, which the reconciler reads
 * as "no expansion needed". A host that also needs the target's name for a
 * view of its own carries it in a type of its own.
 */
export type FocusTarget = {
  values: Readonly<Record<DimensionId, string | undefined>>
}

export type ViewTransition =
  | { kind: 'manual' }
  | { kind: 'focus'; target: FocusTarget }

/**
 * Metadata returned alongside a reconciled filter: which pinned axes had to be
 * overridden to expose a focus target, so the destination view can flash them.
 */
export type ReconcileResult = {
  filter: FilterState
  overriddenPins: Set<FilterDimension>
}

/**
 * The filter a view starts from: on every filter axis, what its descriptor's
 * `initialSelection` chooses from the values the graph presents there —
 * every value on an allow-list, none on a narrowing axis, or the host's own
 * choice.
 */
export function defaultFilter(ontology: Pick<Ontology, 'filterDimensions'>, graph: Pick<Graph, 'nodes'>): FilterState {
  const out = new Map<DimensionId, Selection>()
  for (const d of ontology.filterDimensions) out.set(d.id, new Set(d.initialSelection(valuesOn(graph.nodes.values(), d.id))))
  return out
}

/** Whether a node answers to a focus target: every value the target names. */
export function matchesFocus(node: { dimensions: Readonly<Record<string, string>> }, target: FocusTarget): boolean {
  for (const [dim, value] of Object.entries(target.values)) {
    if (value !== undefined && node.dimensions[dim] !== value) return false
  }
  return true
}

/**
 * Does a subject pass the selection, given a way to read its value per axis?
 *
 * The policy — what an empty selection means, what an absent value means — is
 * here once, read from each axis's descriptor. The *projection* is the caller's,
 * and deliberately so: a graph node carries a dimension map, while a host's
 * other views may hold records with named fields. Those are different shapes,
 * so sharing the accessor would mean inventing a fake dimension map for one of
 * them. Sharing the policy is the part that matters: two views of one product
 * that each wrote their own copy disagreed about what the filter meant.
 */
export function passesSelection(
  filter: FilterState,
  dimensions: readonly ResolvedDimensionDescriptor[],
  valueOn: (dimension: string) => string | undefined,
): boolean {
  for (const dim of dimensions) {
    const selection = selectionFor(filter, dim.id)
    if (selection.size === 0) {
      if (dim.emptyMeans === 'none') return false
      continue
    }
    const value = valueOn(dim.id)
    if (value === undefined) {
      if (dim.absentMeans === 'hidden') return false
      continue
    }
    if (!selection.has(value)) return false
  }
  return true
}

/** Search matches split by the filter: the visible ones, and the hidden ones tallied on the chip hiding each. */
export interface HiddenMatches {
  /** The ids of the matching nodes the filter shows. */
  visible: Set<string>
  /** How many matching nodes the filter hides. */
  hiddenCount: number
  /** The hidden matches per axis and value — on the first axis in the chain each node fails, under its value there. */
  hiddenByAxis: ReadonlyMap<DimensionId, ReadonlyMap<string, number>>
}

/**
 * Split a search's matches by the filter, the way the pane does under its
 * own bar: a match the filter shows lights up, a match it hides is counted
 * on the chip hiding it — the first axis in `axes` the node fails, under the
 * node's value there — so a host's second bar can wear the same badges.
 */
export function hiddenMatchesOf<N extends { id: string }>(
  nodes: Iterable<N>,
  filter: FilterState,
  axes: readonly ResolvedDimensionDescriptor[],
  visibleIds: ReadonlySet<string>,
  matches: (node: N) => boolean,
  valueOn: (node: N, dimension: DimensionId) => string | undefined,
): HiddenMatches {
  const visible = new Set<string>()
  let hiddenCount = 0
  const hiddenByAxis = new Map<DimensionId, Map<string, number>>()
  for (const node of nodes) {
    if (!matches(node)) continue
    if (visibleIds.has(node.id)) { visible.add(node.id); continue }
    hiddenCount++
    const failing = axes.find(d => !passesSelection(filter, [d], dim => valueOn(node, dim)))
    const value = failing ? valueOn(node, failing.id) : undefined
    if (!failing || value === undefined) continue
    const tally = hiddenByAxis.get(failing.id) ?? new Map<string, number>()
    tally.set(value, (tally.get(value) ?? 0) + 1)
    hiddenByAxis.set(failing.id, tally)
  }
  return { visible, hiddenCount, hiddenByAxis }
}
