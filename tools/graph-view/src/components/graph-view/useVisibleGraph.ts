// useVisibleGraph — derives the visible subgraph from the live simulation.
//
// A memo wrapper over `computeVisibleGraph` (./visibleGraph), which owns the
// derivation itself. Recomputes only on filter, axis or sim-rebuild changes
// (keyed on simVersion, the explicit data link to useSimulation), never per
// frame.

import type { FilterState } from '../../filter/types'
import type { DimensionDescriptor } from '../../graph/dimension'
import React from 'react'
import type { Simulation } from '../../graph/simulation'
import { computeVisibleGraph, EMPTY_VISIBLE_GRAPH } from './visibleGraph'
import { useOntology } from './useOntology'
import type { VisibleGraph } from './visibleGraph'

export type { VisibleGraph } from './visibleGraph'

export function useVisibleGraph(
  simRef: React.MutableRefObject<Simulation | null>,
  simVersion: number,
  filter: FilterState,
  /** The axes the view shows — the only ones that filter (D66). */
  axes: readonly DimensionDescriptor[],
): VisibleGraph {
  const ontology = useOntology()
  return React.useMemo<VisibleGraph>(() => {
    const sim = simRef.current
    if (!sim) return EMPTY_VISIBLE_GRAPH
    return computeVisibleGraph(sim, filter, ontology, axes)
    // `filter` is a strictly better signal than the Sets it replaced: every
    // operation on a FilterState is copy-on-write and returns the SAME object
    // when content is unchanged, so its identity means "some axis actually
    // changed" — for any number of axes, without listing them.
    //
    // simVersion is the data link to useSimulation — it bumps on (re)creation so
    // this memo recomputes when the sim instance changes.
  }, [filter, axes, simVersion, ontology]) // eslint-disable-line react-hooks/exhaustive-deps
}
