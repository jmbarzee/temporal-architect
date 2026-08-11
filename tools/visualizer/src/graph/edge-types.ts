// Central edge-type registry — the edge analogue of node-types.ts.
//
// Before this, the edge taxonomy lived in two places that had to be kept in
// sync by hand: the declarative `PULL_EDGES` table (control panel) and the
// imperative `edgeCategory` if/else chain (forces), plus a third copy of the
// per-edge default strengths/distances inlined in DEFAULT_PARAMS. This module
// is the one source of truth: each entry carries the endpoint types, category,
// the ForceParams keys it tunes, and its default physics. The control panel
// derives `PULL_EDGES` from it, `forces.edgeCategory` resolves through
// `edgeTypeFor`, and `DEFAULT_PARAMS` reads its link/dist defaults from it.
//
// Imports only *types* from ./simulation, so there is no runtime import cycle
// (simulation -> edge-types is the value dependency, mirroring simulation -> forces).

import type { NodeType, GraphEdge } from './model'

export type EdgeCategoryKind = 'containment' | 'dependency'

// Stable id for each edge category — equal to the ForceParams stiffness key, so
// it doubles as the hover-link key across the spring map, curves, and canvas.
export type EdgeTypeId =
  | 'linkNsToNs' | 'linkNsToWorker' | 'linkWorkerToWorker' | 'linkWorkerToWorkflow'
  | 'linkWorkerToActivity' | 'linkWorkerToNexus' | 'linkNexusToOperation'
  | 'linkEndpointToNamespace' | 'linkWorkflowToWorkflow' | 'linkWorkflowToActivity'
  | 'linkWorkflowToOperation' | 'linkOperationToWorkflow' | 'linkOperationToActivity'
  | 'linkEndpointToOperation' | 'linkSignalSend'

export interface EdgeTypeDefinition {
  /** Stable id — also the key into the `link` / `dist` param maps and the
   *  hover-link id across the spring map, curves, and canvas. */
  id: EdgeTypeId
  /** Short control-panel label, e.g. "Wk↔Wf" / "Wf→Op". */
  label: string
  /** Canonical endpoints — drive the split-colour token (source | target). */
  sourceType: NodeType
  targetType: NodeType
  category: EdgeCategoryKind
  /** True = the two directions are distinct categories (Wf→Op vs Op→Wf). */
  directional: boolean
  /** Default stiffness / rest length (the DEFAULT_PARAMS values live here). */
  physics: { strength: number; distance: number }
  tooltip: string
}

// One entry per edge category. Order is the control-panel token order (emergent
// positioning makes it cosmetic); the matcher below does not depend on it.
export const ALL_EDGE_TYPES: EdgeTypeDefinition[] = [
  { id: 'linkNsToNs', label: 'NS↔NS', sourceType: 'namespace', targetType: 'namespace',
    category: 'dependency', directional: false,
    physics: { strength: 0.25, distance: 870 }, tooltip: 'Namespace ↔ Namespace dependency' },
  { id: 'linkNsToWorker', label: 'NS↔Wk', sourceType: 'namespace', targetType: 'worker',
    category: 'containment', directional: false,
    physics: { strength: 0.30, distance: 800 }, tooltip: 'Namespace ↔ Worker containment' },
  { id: 'linkWorkerToWorker', label: 'Wk↔Wk', sourceType: 'worker', targetType: 'worker',
    category: 'dependency', directional: false,
    physics: { strength: 0.30, distance: 720 }, tooltip: 'Worker ↔ Worker dependency' },
  { id: 'linkWorkerToWorkflow', label: 'Wk↔Wf', sourceType: 'worker', targetType: 'workflow',
    category: 'containment', directional: false,
    physics: { strength: 0.55, distance: 190 }, tooltip: 'Worker ↔ Workflow containment' },
  { id: 'linkWorkerToActivity', label: 'Wk↔Act', sourceType: 'worker', targetType: 'activity',
    category: 'containment', directional: false,
    physics: { strength: 0.35, distance: 210 }, tooltip: 'Worker ↔ Activity containment' },
  { id: 'linkWorkerToNexus', label: 'Wk↔Nx', sourceType: 'worker', targetType: 'nexusService',
    category: 'containment', directional: false,
    physics: { strength: 1.25, distance: 430 }, tooltip: 'Worker ↔ Nexus service containment' },
  { id: 'linkNexusToOperation', label: 'Nx↔Op', sourceType: 'nexusService', targetType: 'nexusOperation',
    category: 'containment', directional: false,
    physics: { strength: 1.40, distance: 600 }, tooltip: 'Nexus service ↔ Nexus operation containment' },
  { id: 'linkEndpointToNamespace', label: 'Ep↔NS', sourceType: 'nexusEndpoint', targetType: 'namespace',
    category: 'containment', directional: false,
    physics: { strength: 1.00, distance: 690 }, tooltip: 'Nexus endpoint ↔ Namespace containment' },
  { id: 'linkWorkflowToWorkflow', label: 'Wf↔Wf', sourceType: 'workflow', targetType: 'workflow',
    category: 'dependency', directional: false,
    physics: { strength: 0.50, distance: 420 }, tooltip: 'Workflow ↔ Workflow dependency' },
  // Weaker and longer than the Wf↔Wf call spring on purpose: a signal send is a
  // *soft* edge. It couples two workflows without binding them — the sender
  // never waits on the receiver's handler — so the layout should let them drift
  // apart rather than clamp them together the way a child-workflow call does.
  { id: 'linkSignalSend', label: 'Wf→Sig', sourceType: 'workflow', targetType: 'workflow',
    category: 'dependency', directional: true,
    physics: { strength: 0.30, distance: 520 }, tooltip: 'Workflow → Workflow signal send (fire-and-forget)' },
  { id: 'linkWorkflowToActivity', label: 'Wf↔Act', sourceType: 'workflow', targetType: 'activity',
    category: 'dependency', directional: false,
    physics: { strength: 1.90, distance: 40 }, tooltip: 'Workflow ↔ Activity dependency' },
  { id: 'linkWorkflowToOperation', label: 'Wf→Op', sourceType: 'workflow', targetType: 'nexusOperation',
    category: 'dependency', directional: true,
    physics: { strength: 1.50, distance: 330 }, tooltip: 'Workflow → Nexus operation (the nexus call)' },
  { id: 'linkOperationToWorkflow', label: 'Op→Wf', sourceType: 'nexusOperation', targetType: 'workflow',
    category: 'dependency', directional: true,
    physics: { strength: 1.55, distance: 360 }, tooltip: 'Nexus operation → Workflow (backing workflow / sync-op call)' },
  { id: 'linkOperationToActivity', label: 'Op↔Act', sourceType: 'nexusOperation', targetType: 'activity',
    category: 'dependency', directional: false,
    physics: { strength: 1.40, distance: 300 }, tooltip: 'Nexus operation ↔ Activity dependency (sync-op body call)' },
  { id: 'linkEndpointToOperation', label: 'Ep↔Op', sourceType: 'nexusEndpoint', targetType: 'nexusOperation',
    category: 'containment', directional: false,
    physics: { strength: 1.50, distance: 470 }, tooltip: 'Nexus endpoint ↔ Nexus operation (the endpoint fronts the operation)' },
]

export const EDGE_TYPE_REGISTRY = Object.fromEntries(
  ALL_EDGE_TYPES.map(e => [e.id, e]),
) as Record<EdgeTypeId, EdgeTypeDefinition>

// Resolve an edge to its category. Preserves the original prioritized rule order
// from forces.edgeCategory exactly: containment edges stratify by their nexus /
// L3 / L4 endpoints; dependency edges stratify by tier and, for the workflow ↔
// operation pair, by direction. Unmatched cases fall through to the broadest
// category in each branch (Worker↔Namespace containment; Workflow↔Activity dep).
export function edgeTypeFor(
  edge: Pick<GraphEdge, 'edgeType' | 'sourceNodeType' | 'targetNodeType' | 'dispatchKind'>,
): EdgeTypeDefinition {
  const src = edge.sourceNodeType
  const tgt = edge.targetNodeType
  const has = (a: NodeType, b: NodeType) =>
    (src === a && tgt === b) || (src === b && tgt === a)

  let id: EdgeTypeId
  if (edge.edgeType === 'containment') {
    if (has('nexusOperation', 'nexusEndpoint')) id = 'linkEndpointToOperation'
    else if (has('nexusOperation', 'nexusService')) id = 'linkNexusToOperation'
    else if (has('worker', 'nexusService')) id = 'linkWorkerToNexus'
    else if (has('nexusEndpoint', 'namespace')) id = 'linkEndpointToNamespace'
    else if (src === 'workflow' || tgt === 'workflow') id = 'linkWorkerToWorkflow'
    else if (src === 'activity' || tgt === 'activity') id = 'linkWorkerToActivity'
    else id = 'linkNsToWorker'
  } else {
    // Checked before the node-type rules: a signal send is workflow → workflow
    // like a child-workflow call, so the endpoint types alone cannot tell them
    // apart. Only the parser's dispatch kind can.
    if (edge.dispatchKind === 'signalSend') id = 'linkSignalSend'
    else if (src === 'namespace' || tgt === 'namespace') id = 'linkNsToNs'
    else if (src === 'worker' || tgt === 'worker') id = 'linkWorkerToWorker'
    else if (src === 'workflow' && tgt === 'nexusOperation') id = 'linkWorkflowToOperation'
    else if (src === 'nexusOperation' && tgt === 'workflow') id = 'linkOperationToWorkflow'
    else if (has('nexusOperation', 'nexusOperation')) id = 'linkWorkflowToOperation'
    else if (has('nexusOperation', 'activity')) id = 'linkOperationToActivity'
    else if (has('workflow', 'workflow')) id = 'linkWorkflowToWorkflow'
    else id = 'linkWorkflowToActivity'
  }
  return EDGE_TYPE_REGISTRY[id]
}
