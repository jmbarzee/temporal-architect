// useVisibleGraph — derives the visible subgraph from the live simulation.
//
// A memo wrapper over `computeVisibleGraph` (./visibleGraph), which owns the
// derivation itself. Recomputes only on filter or sim-rebuild changes (keyed on
// simVersion, the explicit data link to useSimulation), never per frame.

import type { FilterState } from '../../filter/types'
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
): VisibleGraph {
  const ontology = useOntology()
  return React.useMemo<VisibleGraph>(() => {
    const sim = simRef.current
    if (!sim) return EMPTY_VISIBLE_GRAPH
    return computeVisibleGraph(sim, filter, ontology)
    // `filter` replaces the two Sets it used to list, and is a strictly better
    // signal: every operation on a FilterState is copy-on-write and returns the
    // SAME object when content is unchanged, so its identity means "some axis
    // actually changed" — for any number of axes, without listing them.
    //
    // simVersion is the data link to useSimulation — it bumps on (re)creation so
    // this memo recomputes when the sim instance changes. `ontology` is listed
    // because the derivation reads it; it is a stable module constant today, so
    // adding it changes no memoization behaviour.
  }, [filter, simVersion, ontology]) // eslint-disable-line react-hooks/exhaustive-deps
}
