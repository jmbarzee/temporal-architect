// The chip-flash set: the `<dimension>:<value>` keys that just turned on in the
// filter, cleared ~450ms later. Derived from the filter alone, so it is the
// view's and not the host's. Keyed by looping the filter's own axes rather than
// naming two: emitting `file:`/`type:` while the bar read `sourceFile:`/
// `defType:` once left the flash silently dead in both views — no error, no
// gate, just an effect that stopped happening.

import React from 'react'
import type { FilterState } from '../../filter/types'
import { filterStatesEqual, selectionFor } from '../../filter/types'

export function useRecentlyChanged(filter: FilterState): Set<string> {
  const prevFilterRef = React.useRef<FilterState>(filter)
  const [recentlyChanged, setRecentlyChanged] = React.useState<Set<string>>(new Set())
  React.useEffect(() => {
    const prev = prevFilterRef.current
    if (filterStatesEqual(prev, filter)) return
    const changed = new Set<string>()
    for (const [dimension, values] of filter) {
      const before = selectionFor(prev, dimension)
      for (const v of values) if (!before.has(v)) changed.add(`${dimension}:${v}`)
    }
    prevFilterRef.current = filter
    // Set on every change, empty included: a removal-only change that arrived
    // while an earlier flash was pending used to cancel its timer and leave the
    // old set lit.
    setRecentlyChanged(changed)
    if (changed.size === 0) return
    const timer = setTimeout(() => setRecentlyChanged(new Set()), 450)
    return () => clearTimeout(timer)
  }, [filter])
  return recentlyChanged
}
