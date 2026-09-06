// The shared filter model across Tree and Graph views.
//
// A filter is a selection per axis: `Record<DimensionId, Set<string>>`. It was
// two named fields (`selectedFiles`, `visibleTypes`), which is why every
// consumer had a files branch and a types branch and a third axis meant a third
// branch everywhere.
//
// **Set identity is load-bearing here, not an optimisation (T5).**
// `useVisibleGraph` memoises on the Set reference and `useSimulationLoop`
// compares `prev === next` to decide whether an axis changed. So every operation
// in this module is copy-on-write: the axis being edited gets a new Set, and
// every other axis keeps its *exact* instance. A helper that rebuilt the whole
// record would re-run edge graduation and reheat the layout on every unrelated
// edit — silently, since the output is identical.
//
// The search query lives outside a FilterState because it is globally shared
// (spec § Search Scope).

import type { DimensionId } from '../graph/dimension'

/** The chosen values on one axis. Empty means what the axis's descriptor says. */
export type Selection = ReadonlySet<string>

export type FilterState = Readonly<Record<DimensionId, Selection>>

/**
 * Per-axis freeze state. A pinned axis is not adopted from the source view by
 * the `manual` reconciler.
 */
export type PinState = Readonly<Record<DimensionId, boolean>>

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
  return state[dim] ?? EMPTY
}

/** Every axis the state carries a selection for. */
export function dimensionsOf(state: FilterState): DimensionId[] {
  return Object.keys(state).sort()
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
  return { ...state, [dim]: next }
}

/** Structural equality across every axis either state mentions. */
export function filterStatesEqual(a: FilterState, b: FilterState): boolean {
  if (a === b) return true
  const dims = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const d of dims) {
    if (!selectionsEqual(selectionFor(a, d), selectionFor(b, d))) return false
  }
  return true
}

export function pinnedFor(pins: PinState, dim: DimensionId): boolean {
  return pins[dim] ?? false
}

/**
 * Where a focus transition wants to land.
 *
 * `values` is per-axis rather than the old named `defType` / `sourceFile` pair,
 * so a new axis needs no change here. An axis the target says nothing about is
 * simply absent, which the reconciler reads as "no expansion needed".
 */
export type FocusTarget = {
  name: string
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
