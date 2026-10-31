// useSimulation — the simulation spine for the Graph View.
//
// Owns the long-lived Simulation instance (simRef), its rebuild lifecycle and
// version signal, the running flag, and every handler that mutates the sim
// (param/gravity edits, node drag, reheat, play/pause). The force parameters
// are the view's layout state, read here and written through its writer. It
// exposes a narrow surface: the ref, a `getNode` accessor, the version (the data
// link other hooks list in their deps), and the handlers. The RAF loop that
// *drives* the sim is a separate hook (useSimulationLoop); this owns the instance.

import React from 'react'
import { Simulation, retunedFor } from '../../graph/simulation'
import { defaultRng } from '../../graph/rng'
import type { ForceParams, SimNode } from '../../graph/simulation'
import type { Graph } from '../../graph/model'
import { graphEquals } from '../../graph/model'
import type { Taxonomy } from '../../graph/taxonomy'

export interface SimulationController {
  simRef: React.MutableRefObject<Simulation | null>
  // Bumped on each (re)creation so memos reading simRef.current invalidate.
  simVersion: number
  running: boolean
  setRunning: React.Dispatch<React.SetStateAction<boolean>>
  forceParams: ForceParams
  getNode: (id: string) => SimNode | undefined
  onParamChange: (patch: Partial<ForceParams>) => void
  onForceAdjust: () => void
  onRelayout: (partial: Partial<ForceParams>) => void
  onNodeDragStart: (id: string, wx: number, wy: number) => void
  onNodeDragMove: (wx: number, wy: number) => void
  onNodeDragEnd: () => void
  onToggleRunning: () => void
}

export function useSimulation(
  graph: Graph,
  taxonomy: Taxonomy,
  // Where nodes start: the host's kept layout, by node id. Read when the
  // simulation is built; the previous simulation's positions take precedence
  // on a rebuild, so a graph update keeps the layout the user has.
  positions: ReadonlyMap<string, { x: number; y: number }> | undefined,
  // Called after each (re)creation with whether positions were carried over,
  // so the camera can keep its place when the layout kept its. Held in a ref
  // so its changing identity never re-triggers the rebuild.
  onRebuild: ((continued: boolean) => void) | undefined,
  // The force parameters as the view's layout state holds them, and the
  // writer every change goes through — the host's, when it controls the layout.
  forces: ForceParams,
  updateForces: (fn: (prev: ForceParams) => ForceParams) => void,
): SimulationController {
  const simRef = React.useRef<Simulation | null>(null)
  const prevGraphRef = React.useRef<Graph | null>(null)
  const warnedRef = React.useRef(false)
  // A taxonomy rebuilt on every render rebuilds the simulation on every
  // render; three identities inside two seconds is that, said once.
  const ontologyChanges = React.useRef<number[]>([])
  const warnedOntologyRef = React.useRef(false)
  const prevOntologyRef = React.useRef<Taxonomy | null>(null)
  const dragNodeRef = React.useRef<string | null>(null)
  const [running, setRunning] = React.useState(true)
  // What the view and the simulation read: the parameters as retuned for the
  // graph and the taxonomy — `retunedFor` rebuilds any tuning whose buckets no
  // longer match (an axis bucketed by observed values after a file is added,
  // the style axis or a scalar axis after a taxonomy swap), keeps overrides
  // whose values survive, and returns the same object when nothing moved. It
  // runs in render so nothing downstream ever resolves a stale tuning against
  // a new taxonomy; the layout state catches up in the effect below, through
  // the view's writer, so a host that controls the layout hears the retune.
  const forceParams = React.useMemo(() => retunedFor(forces, taxonomy, graph), [forces, taxonomy, graph])
  React.useEffect(() => {
    if (forceParams !== forces) updateForces(prev => (prev === forces ? forceParams : prev))
  }, [forceParams, forces]) // eslint-disable-line react-hooks/exhaustive-deps
  const [simVersion, setSimVersion] = React.useState(0)

  const onRebuildRef = React.useRef(onRebuild)
  onRebuildRef.current = onRebuild

  // Create the simulation when the graph or the taxonomy changes. A swap used
  // to need a provenance ref here to detect; a tuning that carries its own
  // mapping has nothing left to detect.
  React.useEffect(() => {
    const prev = simRef.current
    // A new graph object equal to the last rebuilds the simulation for
    // nothing; said once, because the fix is on the host's side (memoise).
    if (prev && prevGraphRef.current && prevGraphRef.current !== graph && !warnedRef.current && graphEquals(prevGraphRef.current, graph)) {
      warnedRef.current = true
      console.warn('[graph] the graph\'s identity changed but nothing in it did; the view rebuilt its simulation for nothing. Keep one graph object until its nodes or edges change.')
    }
    prevGraphRef.current = graph
    if (prevOntologyRef.current !== null && prevOntologyRef.current !== taxonomy && !warnedOntologyRef.current) {
      const now = typeof performance !== 'undefined' ? performance.now() : 0
      const recent = ontologyChanges.current.filter(t => now - t < 2000)
      recent.push(now)
      ontologyChanges.current = recent
      if (recent.length >= 3) {
        warnedOntologyRef.current = true
        console.warn('[graph] the taxonomy\'s identity changed three times in two seconds; the view rebuilds its simulation for each. Build the taxonomy once, outside render.')
      }
    }
    prevOntologyRef.current = taxonomy
    // Where nodes start: the host's kept layout under the previous
    // simulation's, so a graph update keeps the layout the user has.
    const start = new Map<string, { x: number; y: number }>(positions ?? [])
    if (prev) for (const n of prev.nodes) start.set(n.id, { x: n.x, y: n.y })
    simRef.current = new Simulation(graph, forceParams, defaultRng, taxonomy, start.size > 0 ? start : undefined)
    onRebuildRef.current?.(prev !== null)
    setRunning(true)
    setSimVersion(v => v + 1)
  }, [graph, taxonomy]) // eslint-disable-line react-hooks/exhaustive-deps

  // Every later change reaches the live simulation here, once, after the
  // retune above — never a raw patch the taxonomy could refuse.
  React.useEffect(() => {
    const sim = simRef.current
    if (sim && sim.params !== forceParams) sim.setParams(forceParams)
  }, [forceParams])

  const getNode = React.useCallback((id: string) => simRef.current?.getNode(id), [])

  // Param edits update both React state and the live sim. Re-energising is the
  // separate concern of onForceAdjust (so non-committing interactions can warm
  // the sim without writing a param).
  const onParamChange = React.useCallback((patch: Partial<ForceParams>) => {
    updateForces(prev => ({ ...prev, ...patch }))
  }, [updateForces])

  const onForceAdjust = React.useCallback(() => {
    simRef.current?.nudge(0.3)
    setRunning(true)
  }, [])

  // Edits that relocate nodes — gravity's mode and toggles, the push/pull axis
  // — reheat harder than a numeric nudge.
  const onRelayout = React.useCallback((partial: Partial<ForceParams>) => {
    updateForces(prev => ({ ...prev, ...partial }))
    simRef.current?.reheat(0.6)
    setRunning(true)
  }, [updateForces])

  const onNodeDragStart = React.useCallback((id: string, wx: number, wy: number) => {
    dragNodeRef.current = id
    simRef.current?.pinNode(id, wx, wy)
    simRef.current?.reheat(0.3)
    setRunning(true)
  }, [])

  const onNodeDragMove = React.useCallback((wx: number, wy: number) => {
    if (dragNodeRef.current) simRef.current?.pinNode(dragNodeRef.current, wx, wy)
  }, [])

  const onNodeDragEnd = React.useCallback(() => {
    if (dragNodeRef.current) {
      simRef.current?.unpinNode(dragNodeRef.current)
      dragNodeRef.current = null
    }
  }, [])

  const onToggleRunning = React.useCallback(() => {
    if (!running) {
      simRef.current?.reheat(0.5)
      setRunning(true)
    } else {
      setRunning(false)
    }
  }, [running])

  return {
    simRef, simVersion, running, setRunning, forceParams, getNode,
    onParamChange, onForceAdjust, onRelayout,
    onNodeDragStart, onNodeDragMove, onNodeDragEnd,
    onToggleRunning,
  }
}
