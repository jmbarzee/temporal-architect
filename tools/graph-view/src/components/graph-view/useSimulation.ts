// useSimulation — the simulation spine for the Graph View.
//
// Owns the long-lived Simulation instance (simRef), its rebuild lifecycle and
// version signal, the tunable forceParams, the running flag, and every handler
// that mutates the sim (param/gravity edits, node drag, reheat, play/pause). It
// exposes a narrow surface: the ref, a `getNode` accessor, the version (the data
// link other hooks list in their deps), and the handlers. The RAF loop that
// *drives* the sim is a separate hook (useSimulationLoop); this owns the instance.

import React from 'react'
import { Simulation, defaultParamsFor, retunedFor } from '../../graph/simulation'
import { defaultRng } from '../../graph/rng'
import type { ForceParams, SimNode } from '../../graph/simulation'
import type { Graph } from '../../graph/model'
import { graphShapeEquals } from '../../graph/model'
import type { Ontology } from '../../graph/ontology'

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
  ontology: Ontology,
  // Where nodes start: the host's kept layout, by node id. Read when the
  // simulation is built; the previous simulation's positions take precedence
  // on a rebuild, so a graph update keeps the layout the user has.
  positions: ReadonlyMap<string, { x: number; y: number }> | undefined,
  // Called after each (re)creation with whether positions were carried over,
  // so the camera can keep its place when the layout kept its. Held in a ref
  // so its changing identity never re-triggers the rebuild.
  onRebuild?: (continued: boolean) => void,
): SimulationController {
  const simRef = React.useRef<Simulation | null>(null)
  const prevGraphRef = React.useRef<Graph | null>(null)
  const warnedRef = React.useRef(false)
  const dragNodeRef = React.useRef<string | null>(null)
  const [running, setRunning] = React.useState(true)
  // Lazy initializer, and `ontology` has to be read before it: the starting
  // parameters are derived from the taxonomy now, so a module-load constant is
  // no longer available to seed this with.
  const [rawParams, setRawParams] = React.useState<ForceParams>(() => defaultParamsFor(ontology))
  // What the view and the simulation read: the parameters as retuned for the
  // graph and the taxonomy — `retunedFor` rebuilds any tuning whose buckets no
  // longer match (an axis bucketed by observed values after a file is added,
  // the style axis or a scalar axis after a taxonomy swap), keeps overrides
  // whose values survive, and returns the same object when nothing moved. It
  // runs in render so nothing downstream ever resolves a stale tuning against
  // a new taxonomy; the state catches up in the effect below.
  const forceParams = React.useMemo(() => retunedFor(rawParams, ontology, graph), [rawParams, ontology, graph])
  React.useEffect(() => {
    if (forceParams !== rawParams) setRawParams(forceParams)
  }, [forceParams, rawParams])
  const [simVersion, setSimVersion] = React.useState(0)

  const onRebuildRef = React.useRef(onRebuild)
  onRebuildRef.current = onRebuild

  // Create the simulation when the graph or the taxonomy changes. A swap used
  // to need a provenance ref here to detect; a tuning that carries its own
  // mapping has nothing left to detect.
  React.useEffect(() => {
    const prev = simRef.current
    // A new graph object of the same shape rebuilds the simulation for
    // nothing; said once, because the fix is on the host's side (memoise).
    if (prev && prevGraphRef.current && prevGraphRef.current !== graph && !warnedRef.current && graphShapeEquals(prevGraphRef.current, graph)) {
      warnedRef.current = true
      console.warn('[graph] the graph\'s identity changed but its shape did not; the view rebuilt its simulation for nothing. Keep one graph object until its nodes or edges change.')
    }
    prevGraphRef.current = graph
    // Where nodes start: the host's kept layout under the previous
    // simulation's, so a graph update keeps the layout the user has.
    const start = new Map<string, { x: number; y: number }>(positions ?? [])
    if (prev) for (const n of prev.nodes) start.set(n.id, { x: n.x, y: n.y })
    simRef.current = new Simulation(graph, forceParams, defaultRng, ontology, start.size > 0 ? start : undefined)
    onRebuildRef.current?.(prev !== null)
    setRunning(true)
    setSimVersion(v => v + 1)
  }, [graph, ontology]) // eslint-disable-line react-hooks/exhaustive-deps

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
    setRawParams(prev => ({ ...prev, ...patch }))
  }, [])

  const onForceAdjust = React.useCallback(() => {
    simRef.current?.nudge(0.3)
    setRunning(true)
  }, [])

  // Edits that relocate nodes — gravity's mode and toggles, the push/pull axis
  // — reheat harder than a numeric nudge.
  const onRelayout = React.useCallback((partial: Partial<ForceParams>) => {
    setRawParams(prev => ({ ...prev, ...partial }))
    simRef.current?.reheat(0.6)
    setRunning(true)
  }, [])

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
