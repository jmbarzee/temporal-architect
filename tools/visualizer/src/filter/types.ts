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
import { DEF_TYPE_DIMENSION, SOURCE_FILE_DIMENSION } from '../graph/dimension'

/** The chosen values on one axis. Empty means what the axis's descriptor says. */
export type Selection = ReadonlySet<string>

/**
 * A selection per axis.
 *
 * A `Map`, not a `Record`, and that is a correctness decision rather than taste.
 * A string-keyed record permits `filter.selectedFiles` — it typechecks, returns
 * `undefined`, and every downstream `.has` throws or silently reports nothing.
 * That exact mistake survived the migration in **six** separate places (three
 * production, three in the harness), passing typecheck, all six gates and 7/7
 * goldens, and was caught only by loading the app. The domain has no axis called
 * `selectedFiles`; a Map makes saying so unrepresentable instead of merely
 * wrong (PLAN §6.6's test).
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

/**
 * Build a filter from the two well-known axes' selections.
 *
 * A convenience for call sites that still hold two named Sets — chiefly the
 * harness, whose fixtures are written per axis. Deliberately the ONLY place the
 * two ids are paired positionally, so a third axis does not need a third
 * positional argument threaded through every caller.
 */
export function filterOfSets(types: Selection, files: Selection): FilterState {
  return new Map([[DEF_TYPE_DIMENSION, types], [SOURCE_FILE_DIMENSION, files]])
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
