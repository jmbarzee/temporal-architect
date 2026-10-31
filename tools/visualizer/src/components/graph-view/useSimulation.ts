// useSimulation — the simulation spine for the Graph View.
//
// Owns the long-lived Simulation instance (simRef), its rebuild lifecycle and
// version signal, the tunable forceParams, the running flag, and every handler
// that mutates the sim (param/gravity edits, node drag, reheat, play/pause). It
// exposes a narrow surface: the ref, a `getNode` accessor, the version (the data
// link other hooks list in their deps), and the handlers. The RAF loop that
// *drives* the sim is a separate hook (useSimulationLoop); this owns the instance.

import React from 'react'
import { Simulation, defaultParamsFor } from '../../graph/simulation'
import { defaultRng } from '../../graph/rng'
import { useOntology } from './useOntology'
import type { ForceParams, SimNode } from '../../graph/simulation'
import type { Graph } from '../../graph/model'

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
  onGravityChange: (partial: Partial<ForceParams>) => void
  onNodeDragStart: (id: string, wx: number, wy: number) => void
  onNodeDragMove: (wx: number, wy: number) => void
  onNodeDragEnd: () => void
  onToggleRunning: () => void
}

export function useSimulation(
  graph: Graph,
  // Called after each (re)creation so the camera/loop can reset their own
  // coordination refs (initial-fit guard, fps tracker). Held in a ref so its
  // changing identity never re-triggers the rebuild — only `graph` does.
  onRebuild?: () => void,
): SimulationController {
  const simRef = React.useRef<Simulation | null>(null)
  const dragNodeRef = React.useRef<string | null>(null)
  const [running, setRunning] = React.useState(true)
  const ontology = useOntology()
  // Lazy initializer, and `ontology` has to be read before it: the starting
  // parameters are derived from the taxonomy now, so a module-load constant is
  // no longer available to seed this with.
  const [forceParams, setForceParams] = React.useState<ForceParams>(() => defaultParamsFor(ontology))
  const [simVersion, setSimVersion] = React.useState(0)

  // Which taxonomy the current `forceParams` were derived from. Needed because
  // the parameters are not taxonomy-neutral — see the rebuild effect.
  const paramsFrom = React.useRef(ontology)

  const onRebuildRef = React.useRef(onRebuild)
  onRebuildRef.current = onRebuild

  // Create or update the simulation when the graph or the taxonomy changes.
  React.useEffect(() => {
    // A taxonomy swap invalidates the parameters, and this is the subtle part.
    // `Simulation`'s constructor is `{ ...defaultParamsFor(ontology), ...params }`
    // — the supplied params spread LAST, so passing the previous ones does not
    // merely preserve the user's tuning, it overrides the fresh taxonomy's
    // `chargeDimension` and `bandDimension` too. The engine would then key the
    // NEW taxonomy's nodes on the OLD axis, miss every lookup, and fall through
    // to ABSENT_VALUE_PHYSICS: every node loses its charge and collapses into a
    // zero-height band, with no error anywhere.
    //
    // So the parameters are re-derived on a swap rather than carried over. That
    // does discard the user's tuning, which is the right trade: the tuned values
    // are a map keyed by the old taxonomy's values, and there is no meaningful
    // way to reinterpret them against a different key space.
    const swapped = paramsFrom.current !== ontology
    const params = swapped ? defaultParamsFor(ontology) : forceParams
    if (swapped) {
      paramsFrom.current = ontology
      setForceParams(params)
    }
    simRef.current = new Simulation(graph, params, defaultRng, ontology)
    onRebuildRef.current?.()
    setRunning(true)
    setSimVersion(v => v + 1)
  }, [graph, ontology]) // eslint-disable-line react-hooks/exhaustive-deps

  const getNode = React.useCallback((id: string) => simRef.current?.getNode(id), [])

  // Param edits update both React state and the live sim. Re-energising is the
  // separate concern of onForceAdjust (so non-committing interactions can warm
  // the sim without writing a param).
  const onParamChange = React.useCallback((patch: Partial<ForceParams>) => {
    setForceParams(prev => {
      const next = { ...prev, ...patch }
      simRef.current?.setParams(next)
      return next
    })
  }, [])

  const onForceAdjust = React.useCallback(() => {
    simRef.current?.nudge(0.3)
    setRunning(true)
  }, [])

  // Non-numeric gravity edits (mode, toggles) relocate nodes, so reheat harder.
  const onGravityChange = React.useCallback((partial: Partial<ForceParams>) => {
    setForceParams(prev => {
      const next = { ...prev, ...partial }
      simRef.current?.setParams(next)
      return next
    })
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
    onParamChange, onForceAdjust, onGravityChange,
    onNodeDragStart, onNodeDragMove, onNodeDragEnd,
    onToggleRunning,
  }
}
