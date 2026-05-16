// reconcileFilter is the single decision point for what the destination
// view's filter looks like after a view switch. All switch sites in
// WorkflowCanvas route through this function — see spec § View
// Transitions for the rules.
//
// The function is pure: it takes only the destination's current filter,
// the source view's current filter, the destination's pin state, and a
// transition intent, and returns a new filter (plus metadata about which
// pinned dimensions were overridden, used to drive the pin-flash
// animation on focus transitions).

import type {
  FilterState,
  PinState,
  ViewTransition,
  ReconcileResult,
  FilterDimension,
} from './types'
import { cloneFilter, filterStatesEqual } from './types'

export function reconcileFilter(
  destFilter: FilterState,
  sourceFilter: FilterState,
  destPins: PinState,
  intent: ViewTransition,
): ReconcileResult {
  switch (intent.kind) {
    case 'manual':
      return reconcileManual(destFilter, sourceFilter, destPins)
    case 'focus':
      return reconcileFocus(destFilter, destPins, intent.target)
  }
}

// manual: per dimension, if pinned keep dest, otherwise adopt source.
// Pins are never overridden by a manual transition — no flash metadata.
function reconcileManual(
  destFilter: FilterState,
  sourceFilter: FilterState,
  destPins: PinState,
): ReconcileResult {
  const next: FilterState = cloneFilter(destFilter)

  if (!destPins.files) {
    next.selectedFiles = new Set(sourceFilter.selectedFiles)
  }
  if (!destPins.types) {
    next.visibleTypes = new Set(sourceFilter.visibleTypes)
  }

  return {
    filter: filterStatesEqual(next, destFilter) ? destFilter : next,
    overriddenPins: new Set<FilterDimension>(),
  }
}

// focus: expand dest minimally to make the target visible.
// - Always: ensure target.defType is in visibleTypes.
// - Conditional: add target.sourceFile to selectedFiles only if the file
//   filter is currently active (size > 0). If file filtering is off, all
//   files are already implicitly visible — adding the chip would
//   inadvertently activate the filter and HIDE everything else.
//
// Pins may need to be overridden to expose the target. The pin state
// itself is not modified, but each overridden dimension is recorded so
// the destination view can flash its pin icon.
function reconcileFocus(
  destFilter: FilterState,
  destPins: PinState,
  target: { name: string; defType: string; sourceFile?: string },
): ReconcileResult {
  const next: FilterState = cloneFilter(destFilter)
  const overridden = new Set<FilterDimension>()

  if (!next.visibleTypes.has(target.defType)) {
    next.visibleTypes.add(target.defType)
    if (destPins.types) overridden.add('types')
  }

  if (
    target.sourceFile &&
    destFilter.selectedFiles.size > 0 &&
    !destFilter.selectedFiles.has(target.sourceFile)
  ) {
    next.selectedFiles.add(target.sourceFile)
    if (destPins.files) overridden.add('files')
  }

  return {
    filter: filterStatesEqual(next, destFilter) ? destFilter : next,
    overriddenPins: overridden,
  }
}
