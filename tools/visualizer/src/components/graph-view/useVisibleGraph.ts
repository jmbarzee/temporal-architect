// useVisibleGraph — derives the visible subgraph from the live simulation.
//
// A memo wrapper over `computeVisibleGraph` (./visibleGraph), which owns the
// derivation itself. Recomputes only on filter or sim-rebuild changes (keyed on
// simVersion, the explicit data link to useSimulation), never per frame.

import React from 'react'
import type { Simulation } from '../../graph/simulation'
import { computeVisibleGraph, EMPTY_VISIBLE_GRAPH } from './visibleGraph'
import { useOntology } from './useOntology'
import type { VisibleGraph } from './visibleGraph'

export type { VisibleGraph } from './visibleGraph'

export function useVisibleGraph(
  simRef: React.MutableRefObject<Simulation | null>,
  simVersion: number,
  visibleTypes: ReadonlySet<string>,
  selectedFiles: ReadonlySet<string>,
): VisibleGraph {
  const ontology = useOntology()
  return React.useMemo<VisibleGraph>(() => {
    const sim = simRef.current
    if (!sim) return EMPTY_VISIBLE_GRAPH
    return computeVisibleGraph(sim, visibleTypes, selectedFiles, ontology)
    // simVersion is the data link to useSimulation — it bumps on (re)creation so
    // this memo recomputes when the sim instance changes. `ontology` is listed
    // because the derivation reads it; it is a stable module constant today, so
    // adding it changes no memoization behaviour.
  }, [visibleTypes, selectedFiles, simVersion, ontology]) // eslint-disable-line react-hooks/exhaustive-deps
}
