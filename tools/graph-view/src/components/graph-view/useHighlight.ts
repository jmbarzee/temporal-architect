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
import type { GraphEdge } from '../../graph/model'
import { highlightOf } from '../../graph/highlight'
import type { Taxonomy } from '../../graph/taxonomy'

import type { ForceSection } from '../GraphControlPanel'
import type { GravityHover } from '../GravityControls'

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
  activePushBucket: string | null
  setActivePushBucket: React.Dispatch<React.SetStateAction<string | null>>
  activeGravityBucket: GravityHover | null
  setActiveGravityBucket: React.Dispatch<React.SetStateAction<GravityHover | null>>
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
  taxonomy: Taxonomy,
): HighlightController {
  const [hoveredNodeId, setHoveredNodeId] = React.useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null)
  const [focusedIndex, setFocusedIndex] = React.useState(-1)
  const [shiftHeld, setShiftHeld] = React.useState(false)

  // Force-field preview (hover-driven; no persistent toggle).
  const [activeSection, setActiveSection] = React.useState<ForceSection>(null)
  const [activePushBucket, setActivePushBucket] = React.useState<string | null>(null)
  const [activeGravityBucket, setActiveGravityBucket] = React.useState<GravityHover | null>(null)
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

  // Transitive dependency highlighting: a directional walk from the active
  // node, which the host may widen or replace through its taxonomy —
  // a value that relates to others by its own metadata says so there, not
  // here. Sister copies are intentionally NOT added (the canvas draws their
  // duplicate halo separately).
  const { highlightedNodes, highlightedEdges } = React.useMemo(() => {
    const activeId = hoveredNodeId ?? selectedNodeId
    if (!activeId || !visibleIds.has(activeId)) {
      return { highlightedNodes: null as Set<string> | null, highlightedEdges: null as Set<string> | null }
    }
    const direction = shiftHeld ? 'upstream' as const : 'downstream' as const
    const activeNode = getNode(activeId)
    if (!activeNode) return { highlightedNodes: null as Set<string> | null, highlightedEdges: null as Set<string> | null }
    const { nodes, edges } = highlightOf(taxonomy, activeNode, direction, { visibleNodes, visibleEdges, visibleIds, getNode })
    return { highlightedNodes: nodes, highlightedEdges: edges }
  }, [hoveredNodeId, selectedNodeId, shiftHeld, visibleEdges, visibleIds, visibleNodes, getNode, taxonomy])

  return {
    hoveredNodeId, setHoveredNodeId,
    selectedNodeId, setSelectedNodeId,
    focusedIndex, setFocusedIndex,
    shiftHeld,
    focusedNodeId,
    highlightedNodes, highlightedEdges,
    activeSection, setActiveSection,
    activePushBucket, setActivePushBucket,
    activeGravityBucket, setActiveGravityBucket,
    activePullEdge, setActivePullEdge,
  }
}
