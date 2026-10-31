// The chip-flash set: per axis, the values that just turned on in the filter,
// cleared ~450ms later. Derived from the filter alone, so it is the view's and
// not the host's, and keyed by axis and value rather than a joined string, so
// a value containing the separator cannot be mistaken for another's.

import React from 'react'
import type { FilterState } from '../../filter/types'
import { filterStatesEqual, selectionFor } from '../../filter/types'
import { useStable } from './useControllable'

/** The values that just turned on, per axis. */
export type RecentlyChanged = ReadonlyMap<string, ReadonlySet<string>>
const NONE: RecentlyChanged = new Map()

/** The values that just turned on in a filter, per axis, for about 450 ms — the bar's chip flash — derived from the filter alone. */
export function useRecentlyChanged(rawFilter: FilterState): RecentlyChanged {
  // One object per content change, so the effect below re-runs — and its
  // cleanup cancels the timer — only for a real change: a host rebuilding an
  // equal filter each render once cancelled the flash's timer and left the
  // chips lit until the next real change.
  const filter = useStable(rawFilter, filterStatesEqual)
  const prevFilterRef = React.useRef<FilterState>(filter)
  const [recentlyChanged, setRecentlyChanged] = React.useState<RecentlyChanged>(NONE)
  React.useEffect(() => {
    const prev = prevFilterRef.current
    if (filterStatesEqual(prev, filter)) return
    const changed = new Map<string, Set<string>>()
    for (const [axis, values] of filter) {
      const before = selectionFor(prev, axis)
      for (const v of values) {
        if (before.has(v)) continue
        const set = changed.get(axis) ?? new Set<string>()
        set.add(v)
        changed.set(axis, set)
      }
    }
    prevFilterRef.current = filter
    // Set on every change, empty included, so a removal-only change that
    // arrives while an earlier flash is pending does not leave the old set lit.
    setRecentlyChanged(changed)
    if (changed.size === 0) return
    const timer = setTimeout(() => setRecentlyChanged(NONE), 450)
    return () => clearTimeout(timer)
  }, [filter])
  return recentlyChanged
}
