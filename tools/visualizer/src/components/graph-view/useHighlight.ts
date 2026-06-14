// useHighlight — selection / hover / preview-highlight concern for the Graph View.
//
// Owns the interaction state (hovered, selected, keyboard-focused, shift-held)
// and the control-panel preview state (active section / charge / gravity / pull
// edge), tracks the Shift key, derives the transitive-dependency highlight sets,
// and resets selection when the underlying graph changes. It reads the visible
// subgraph + a `getNode` accessor as inputs (the explicit data link to the sim);
// it never touches simRef directly.

import React from 'react'
import type { SimNode } from '../../graph/simulation'
import type { GraphEdge, NodeType } from '../../graph/model'
import { getTransitiveDeps, getHighlightedEdgeIds } from '../../graph/highlight'
import type { ForceSection } from '../GraphControlPanel'

export interface HighlightController {
  hoveredNodeId: string | null
  setHoveredNodeId: React.Dispatch<React.SetStateAction<string | null>>
  selectedNodeId: string | null
  setSelectedNodeId: React.Dispatch<React.SetStateAction<string | null>>
  focusedIndex: number
  setFocusedIndex: React.Dispatch<React.SetStateAction<number>>
  shiftHeld: boolean
  focusedNodeId: string | null
  highlightedNodes: Set<string> | null
  highlightedEdges: Set<string> | null
  activeSection: ForceSection
  setActiveSection: React.Dispatch<React.SetStateAction<ForceSection>>
  activeChargeType: NodeType | null
  setActiveChargeType: React.Dispatch<React.SetStateAction<NodeType | null>>
  activeGravityType: NodeType | null
  setActiveGravityType: React.Dispatch<React.SetStateAction<NodeType | null>>
  activePullEdge: string | null
  setActivePullEdge: React.Dispatch<React.SetStateAction<string | null>>
}

export function useHighlight(
  visibleNodes: SimNode[],
  visibleEdges: GraphEdge[],
  visibleIds: Set<string>,
  getNode: (id: string) => SimNode | undefined,
  // Changes whenever the underlying graph is rebuilt; clears selection so a
  // stale id never lingers across graphs (was inline in the sim-rebuild effect).
  resetKey: unknown,
): HighlightController {
  const [hoveredNodeId, setHoveredNodeId] = React.useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null)
  const [focusedIndex, setFocusedIndex] = React.useState(-1)
  const [shiftHeld, setShiftHeld] = React.useState(false)

  // Force-field preview (hover-driven; no persistent toggle).
  const [activeSection, setActiveSection] = React.useState<ForceSection>(null)
  const [activeChargeType, setActiveChargeType] = React.useState<NodeType | null>(null)
  const [activeGravityType, setActiveGravityType] = React.useState<NodeType | null>(null)
  const [activePullEdge, setActivePullEdge] = React.useState<string | null>(null)

  // Reset selection/hover/focus when the graph is rebuilt.
  React.useEffect(() => {
    setSelectedNodeId(null)
    setHoveredNodeId(null)
    setFocusedIndex(-1)
  }, [resetKey])

  // Shift key tracking — drives upstream vs downstream highlight direction.
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftHeld(true) }
    const up = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftHeld(false) }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  const focusedNodeId = focusedIndex >= 0 && focusedIndex < visibleNodes.length
    ? visibleNodes[focusedIndex].id
    : null

  // Transitive dependency highlighting. nexusEndpoint follows routing metadata;
  // nexusService augments the dep chain with the endpoints fronting its
  // operations (via nexusRoute edges); everything else is a directional
  // transitive-dep BFS. Sister copies are intentionally NOT added (the canvas
  // draws their duplicate halo separately).
  const { highlightedNodes, highlightedEdges } = React.useMemo(() => {
    const activeId = hoveredNodeId ?? selectedNodeId
    if (!activeId || !visibleIds.has(activeId)) {
      return { highlightedNodes: null as Set<string> | null, highlightedEdges: null as Set<string> | null }
    }

    const activeNode = getNode(activeId)

    if (activeNode?.nodeType === 'nexusEndpoint') {
      const nodes = new Set<string>([activeId])
      const edges = new Set<string>()
      if (activeNode.parentId && visibleIds.has(activeNode.parentId)) {
        nodes.add(activeNode.parentId)
      }
      for (const edge of visibleEdges) {
        if (edge.nexusEndpoint === activeNode.name) {
          edges.add(edge.id)
          if (visibleIds.has(edge.sourceId)) nodes.add(edge.sourceId)
          if (visibleIds.has(edge.targetId)) nodes.add(edge.targetId)
        }
      }
      return { highlightedNodes: nodes, highlightedEdges: edges }
    }

    const direction = shiftHeld ? 'upstream' as const : 'downstream' as const
    const nodes = getTransitiveDeps(activeId, visibleEdges, visibleIds, direction)

    if (activeNode?.nodeType === 'nexusService') {
      // Co-highlight the endpoints that front this service's operations.
      // The endpoint↔operation relationship is the parser's nexusRoute
      // edge (operation → endpoint, rendered as a containment-style edge);
      // we reach it via the service's operation children rather than
      // re-deriving it from (namespace, queue).
      const operationIds = new Set<string>()
      for (const n of visibleNodes) {
        if (n.nodeType === 'nexusOperation' && n.parentId === activeId) {
          operationIds.add(n.id)
        }
      }
      for (const edge of visibleEdges) {
        if (edge.targetNodeType !== 'nexusEndpoint') continue
        if (!operationIds.has(edge.sourceId)) continue
        if (visibleIds.has(edge.targetId)) {
          nodes.add(edge.targetId)
          const ep = getNode(edge.targetId)
          if (ep?.parentId && visibleIds.has(ep.parentId)) nodes.add(ep.parentId)
        }
      }
    }

    const edges = getHighlightedEdgeIds(nodes, visibleEdges)
    return { highlightedNodes: nodes, highlightedEdges: edges }
  }, [hoveredNodeId, selectedNodeId, shiftHeld, visibleEdges, visibleIds, visibleNodes, getNode])

  return {
    hoveredNodeId, setHoveredNodeId,
    selectedNodeId, setSelectedNodeId,
    focusedIndex, setFocusedIndex,
    shiftHeld,
    focusedNodeId,
    highlightedNodes, highlightedEdges,
    activeSection, setActiveSection,
    activeChargeType, setActiveChargeType,
    activeGravityType, setActiveGravityType,
    activePullEdge, setActivePullEdge,
  }
}
