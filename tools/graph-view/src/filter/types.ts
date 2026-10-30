// The filter model a host's views share.
//
// A filter is a selection per axis. It was two named fields once, which is why
// every consumer had one branch per axis and a third axis meant a third branch
// everywhere; now it is a map over whatever axes the host declares.
//
// Every operation here is copy-on-write: the axis being edited gets a new
// Set, every other axis keeps its exact instance, and a no-op edit returns the
// same state. The view compares selections by content, so a host that rebuilds
// a filter from a URL or a store is not read as a change — identity is the
// cheap path, not the contract.
//
// The search query lives outside a FilterState because it is globally shared.

import type { AxisId, ResolvedAxisDescriptor } from '../graph/axis'
import { valuesOn } from '../graph/axis'
import type { Graph } from '../graph/model'
import type { Taxonomy } from '../graph/taxonomy'

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
export type FilterState = ReadonlyMap<AxisId, Selection>

/**
 * Per-axis freeze state. A pinned axis is not adopted from the source view by
 * the `manual` reconciler.
 */
export type AxisLocks = ReadonlyMap<AxisId, boolean>

/** Retained as a name for readability; an axis is identified by its dimension. */
export type FilterDimension = AxisId

const EMPTY: Selection = new Set<string>()

/**
 * The selection on one axis, or an empty one.
 *
 * Always returns the *same* empty Set, so an absent axis does not change
 * identity between reads — a fresh `new Set()` per call would defeat exactly the
 * memoisation this module exists to protect.
 */
export function selectionFor(state: FilterState, dim: AxisId): Selection {
  return state.get(dim) ?? EMPTY
}

/** Every axis the state carries a selection for. */
export function dimensionsOf(state: FilterState): AxisId[] {
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
  dim: AxisId,
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

/** Structural equality of two lock maps. */
export function locksEqual(a: AxisLocks, b: AxisLocks): boolean {
  if (a === b) return true
  if (a.size !== b.size) return false
  for (const [k, v] of a) if (b.get(k) !== v) return false
  return true
}

/** Element-wise equality of two lists of ids. */
export function listEqual(a: readonly string[], b: readonly string[]): boolean {
  return a === b || (a.length === b.length && a.every((v, i) => v === b[i]))
}

/** Flip one axis's pin, copy-on-write. */
export function withLock(pins: AxisLocks, dim: AxisId, value: boolean): AxisLocks {
  const out = new Map(pins)
  out.set(dim, value)
  return out
}

export function lockedFor(pins: AxisLocks, dim: AxisId): boolean {
  return pins.get(dim) ?? false
}

/**
 * Where a focus transition wants to land: the target's value per axis. An
 * axis the target says nothing about is absent, which the reconciler reads
 * as "no expansion needed". A host that also needs the target's name for a
 * view of its own carries it in a type of its own.
 */
export type FocusTarget = {
  values: Readonly<Record<AxisId, string | undefined>>
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
  overriddenLocks: Set<FilterDimension>
}

/**
 * The filter a view starts from: on every filter axis, what its descriptor's
 * `initialSelection` chooses from the values the graph presents there —
 * every value on an allow-list, none on a narrowing axis, or the host's own
 * choice.
 */
export function defaultFilter(taxonomy: Pick<Taxonomy, 'filterAxes'>, graph: Pick<Graph, 'nodes'>): FilterState {
  const out = new Map<AxisId, Selection>()
  for (const d of taxonomy.filterAxes) out.set(d.id, new Set(d.initialSelection(valuesOn(graph.nodes, d.id))))
  return out
}

// The records below are built from entries, not by assignment: an axis id is
// a host string, and `out['__proto__'] = …` on a literal sets the prototype
// instead of a key, so that axis would vanish from the stored text.

/** A filter as plain data — each axis's selected values in an array — for a URL, a store or a saved layout. */
export function filterToJSON(filter: FilterState): Record<AxisId, string[]> {
  return Object.fromEntries([...filter].map(([dim, selection]) => [dim, [...selection]]))
}

/** What JSON.parse produces: a plain object, not a Map, a Set, a Date or an instance — whose entries are its own keys. */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * The filter `filterToJSON` wrote, or undefined when `value` is not that
 * shape — stored data is not trusted to be, and a host falls back to its
 * default rather than to a filter that means something else.
 */
export function filterFromJSON(value: unknown): FilterState | undefined {
  if (!isPlainRecord(value)) return undefined
  const out = new Map<AxisId, Selection>()
  for (const [dim, values] of Object.entries(value)) {
    if (!Array.isArray(values) || !values.every((v): v is string => typeof v === 'string')) return undefined
    out.set(dim, new Set(values))
  }
  return out
}

/** Locks as plain data — a boolean per axis — beside `filterToJSON`. */
export function locksToJSON(locks: AxisLocks): Record<AxisId, boolean> {
  return Object.fromEntries([...locks])
}

/** The locks `locksToJSON` wrote, or undefined when `value` is not that shape. */
export function locksFromJSON(value: unknown): AxisLocks | undefined {
  if (!isPlainRecord(value)) return undefined
  const out = new Map<AxisId, boolean>()
  for (const [dim, locked] of Object.entries(value)) {
    if (typeof locked !== 'boolean') return undefined
    out.set(dim, locked)
  }
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
  dimensions: readonly ResolvedAxisDescriptor[],
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
  hiddenByAxis: ReadonlyMap<AxisId, ReadonlyMap<string, number>>
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
  axes: readonly ResolvedAxisDescriptor[],
  visibleIds: ReadonlySet<string>,
  matches: (node: N) => boolean,
  valueOn: (node: N, dimension: AxisId) => string | undefined,
): HiddenMatches {
  const visible = new Set<string>()
  let hiddenCount = 0
  const hiddenByAxis = new Map<AxisId, Map<string, number>>()
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
