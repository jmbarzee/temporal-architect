// The chip-flash set: per axis, the values that just turned on in the filter,
// cleared ~450ms later. Derived from the filter alone, so it is the view's and
// not the host's, and keyed by axis and value rather than a joined string, so
// a value containing the separator cannot be mistaken for another's.

import React from 'react'
import type { FilterState } from '../../filter/types'
import { filterStatesEqual, selectionFor } from '../../filter/types'

/** The values that just turned on, per axis. */
export type RecentlyChanged = ReadonlyMap<string, ReadonlySet<string>>
const NONE: RecentlyChanged = new Map()

export function useRecentlyChanged(filter: FilterState): RecentlyChanged {
  const prevFilterRef = React.useRef<FilterState>(filter)
  const [recentlyChanged, setRecentlyChanged] = React.useState<RecentlyChanged>(NONE)
  React.useEffect(() => {
    const prev = prevFilterRef.current
    if (filterStatesEqual(prev, filter)) return
    const changed = new Map<string, Set<string>>()
    for (const [dimension, values] of filter) {
      const before = selectionFor(prev, dimension)
      for (const v of values) {
        if (before.has(v)) continue
        const set = changed.get(dimension) ?? new Set<string>()
        set.add(v)
        changed.set(dimension, set)
      }
    }
    prevFilterRef.current = filter
    // Set on every change, empty included: a removal-only change that arrived
    // while an earlier flash was pending used to cancel its timer and leave the
    // old set lit.
    setRecentlyChanged(changed)
    if (changed.size === 0) return
    const timer = setTimeout(() => setRecentlyChanged(NONE), 450)
    return () => clearTimeout(timer)
  }, [filter])
  return recentlyChanged
}
