// Central edge-type registry — the edge analogue of node-types.ts.
//
// Before this, the edge taxonomy lived in two places that had to be kept in
// sync by hand: the declarative `PULL_EDGES` table (control panel) and the
// imperative `edgeCategory` if/else chain (forces), plus a third copy of the
// per-edge default strengths/distances inlined in the engine's starting
// parameters. This module is the one source of truth: each entry carries the
// endpoint values, relation, the parameter keys it tunes, and its default
// physics. The control panel's pull tokens and the spring defaults both resolve
// from these entries (`resolvePhysics`), and nothing copies them.

import { isContainment } from '@temporal-architect/graph-view'
import type {
  DimensionValue,
  GraphEdge,
  EdgeType,
  EdgeStroke,
  DimensionId,
  SpringPhysics,
} from '@temporal-architect/graph-view'
import type { NodeType } from './node-types'

/**
 * This host's second edge axis: the parser's call kind, written by `buildGraph`
 * and read by the edge rules below — and by nothing in the library (D64). A
 * containment edge carries none; it dispatches nothing.
 */
export const DISPATCH_DIMENSION: DimensionId = 'dispatch'
export function dispatchOf(edge: Pick<GraphEdge, 'dimensions'>): DimensionValue | undefined {
  return edge.dimensions[DISPATCH_DIMENSION]
}
// This domain's edge categories. The *shape* is library-owned (`./taxonomy`);
// what is declared here is the closed set of ids this deployment model has, and
// the endpoint values each one connects.

// Stable id for each edge category — the spring tuning's override key, so it
// doubles as the hover-link key across the spring map, curves, and canvas.
// A narrowing of the library's open `EdgeTypeId`: the engine accepts any string
// so a host can bring its own categories; this host's set is closed, and saying
// so here is what makes the matcher below exhaustively checkable.
export type EdgeTypeId =
  | 'linkNsToNs' | 'linkNsToWorker' | 'linkWorkerToWorker' | 'linkWorkerToWorkflow'
  | 'linkWorkerToActivity' | 'linkWorkerToNexus' | 'linkNexusToOperation'
  | 'linkEndpointToNamespace' | 'linkWorkflowToWorkflow' | 'linkWorkflowToActivity'
  | 'linkWorkflowToOperation' | 'linkOperationToWorkflow' | 'linkOperationToActivity'
  | 'linkEndpointToOperation' | 'linkSignalSend'

/**
 * One of this domain's edge entries — the library shape with its open string
 * fields narrowed to this domain's vocabulary, and its optional spring and
 * tooltip required.
 *
 * Extending rather than re-declaring is deliberate. The shape existed twice for
 * a while, once here and once in the library, structurally identical and
 * therefore silently interchangeable; the moment they drifted by one optional
 * field, the mismatch would have surfaced as a value quietly missing at one end
 * rather than as a type error (T19).
 */
export interface TemporalEdgeType extends EdgeType {
  id: EdgeTypeId
  sourceType: NodeType
  targetType: NodeType
  // Declared by every entry here, where the library lets a type leave them out.
  physics: SpringPhysics
  tooltip: string
}

// How each category is stroked. The nexus family carries the pink palette
// through every leg of a call; the two coarsened dependency cases get named
// greys; containment is slate and dotted. Dark variants lift the greys and
// deepen the pinks a step, as the node palette does.
const CONTAINMENT: EdgeStroke          = { color: { light: '#94A3B8', dark: '#64748B' }, alpha: 0.35, dash: [3, 4], width: 1 }
const OP_CONTAINMENT: EdgeStroke       = { color: { light: '#DB2777', dark: '#F472B6' }, alpha: 0.55, dash: [3, 4], width: 1.2 } // op → service
const EP_COMPOSITION: EdgeStroke       = { color: { light: '#9F1239', dark: '#BE123C' }, alpha: 0.55, dash: [3, 4], width: 1.2 } // op → endpoint
const NS_DEPENDENCY: EdgeStroke        = { color: { light: '#475569', dark: '#94A3B8' }, alpha: 0.85, dash: [], width: 1.8 }
const WORKER_DEPENDENCY: EdgeStroke    = { color: { light: '#64748B', dark: '#CBD5E1' }, alpha: 0.75, dash: [], width: 1.6 }
const WORKFLOW_DEPENDENCY: EdgeStroke  = { color: { light: '#8B7EC8', dark: '#A89BD8' }, alpha: 0.70, dash: [], width: 1.4 }
const WORKFLOW_TO_ACTIVITY: EdgeStroke = { color: { light: '#4A8BC2', dark: '#7CB9E8' }, alpha: 0.70, dash: [], width: 1.4 }
const NEXUS_CALL: EdgeStroke           = { color: { light: '#F472B6', dark: '#F9A8D4' }, alpha: 0.85, dash: [], width: 1.5 }

// One entry per edge category. Order is the control-panel token order (emergent
// positioning makes it cosmetic); the matcher below does not depend on it.
export const ALL_EDGE_TYPES: TemporalEdgeType[] = [
  { id: 'linkNsToNs', label: 'NS↔NS', sourceType: 'namespace', targetType: 'namespace',
    relation: 'dependency',
    physics: { strength: 0.25, distance: 870 }, style: NS_DEPENDENCY, tooltip: 'Namespace ↔ Namespace dependency' },
  { id: 'linkNsToWorker', label: 'NS↔Wk', sourceType: 'namespace', targetType: 'worker',
    relation: 'containment',
    physics: { strength: 0.30, distance: 800 }, style: CONTAINMENT, tooltip: 'Namespace ↔ Worker containment' },
  { id: 'linkWorkerToWorker', label: 'Wk↔Wk', sourceType: 'worker', targetType: 'worker',
    relation: 'dependency',
    physics: { strength: 0.30, distance: 720 }, style: WORKER_DEPENDENCY, tooltip: 'Worker ↔ Worker dependency' },
  { id: 'linkWorkerToWorkflow', label: 'Wk↔Wf', sourceType: 'worker', targetType: 'workflow',
    relation: 'containment',
    physics: { strength: 0.55, distance: 190 }, style: CONTAINMENT, tooltip: 'Worker ↔ Workflow containment' },
  { id: 'linkWorkerToActivity', label: 'Wk↔Act', sourceType: 'worker', targetType: 'activity',
    relation: 'containment',
    physics: { strength: 0.35, distance: 210 }, style: CONTAINMENT, tooltip: 'Worker ↔ Activity containment' },
  { id: 'linkWorkerToNexus', label: 'Wk↔Nx', sourceType: 'worker', targetType: 'nexusService',
    relation: 'containment',
    physics: { strength: 1.25, distance: 430 }, style: CONTAINMENT, tooltip: 'Worker ↔ Nexus service containment' },
  { id: 'linkNexusToOperation', label: 'Nx↔Op', sourceType: 'nexusService', targetType: 'nexusOperation',
    relation: 'containment',
    physics: { strength: 1.40, distance: 600 }, style: OP_CONTAINMENT, tooltip: 'Nexus service ↔ Nexus operation containment' },
  { id: 'linkEndpointToNamespace', label: 'Ep↔NS', sourceType: 'nexusEndpoint', targetType: 'namespace',
    relation: 'containment',
    physics: { strength: 1.00, distance: 690 }, style: CONTAINMENT, tooltip: 'Nexus endpoint ↔ Namespace containment' },
  { id: 'linkWorkflowToWorkflow', label: 'Wf↔Wf', sourceType: 'workflow', targetType: 'workflow',
    relation: 'dependency',
    physics: { strength: 0.50, distance: 420 }, style: WORKFLOW_DEPENDENCY, tooltip: 'Workflow ↔ Workflow dependency' },
  // Weaker and longer than the Wf↔Wf call spring on purpose: a signal send is a
  // *soft* edge. It couples two workflows without binding them — the sender
  // never waits on the receiver's handler — so the layout should let them drift
  // apart rather than clamp them together the way a child-workflow call does.
  { id: 'linkSignalSend', label: 'Wf→Sig', sourceType: 'workflow', targetType: 'workflow',
    relation: 'dependency',
    physics: { strength: 0.30, distance: 520 }, style: WORKFLOW_DEPENDENCY, tooltip: 'Workflow → Workflow signal send (fire-and-forget)' },
  { id: 'linkWorkflowToActivity', label: 'Wf↔Act', sourceType: 'workflow', targetType: 'activity',
    relation: 'dependency',
    physics: { strength: 1.90, distance: 40 }, style: WORKFLOW_TO_ACTIVITY, tooltip: 'Workflow ↔ Activity dependency' },
  { id: 'linkWorkflowToOperation', label: 'Wf→Op', sourceType: 'workflow', targetType: 'nexusOperation',
    relation: 'dependency',
    physics: { strength: 1.50, distance: 330 }, style: NEXUS_CALL, tooltip: 'Workflow → Nexus operation (the nexus call)' },
  { id: 'linkOperationToWorkflow', label: 'Op→Wf', sourceType: 'nexusOperation', targetType: 'workflow',
    relation: 'dependency',
    physics: { strength: 1.55, distance: 360 }, style: NEXUS_CALL, tooltip: 'Nexus operation → Workflow (backing workflow / sync-op call)' },
  { id: 'linkOperationToActivity', label: 'Op↔Act', sourceType: 'nexusOperation', targetType: 'activity',
    relation: 'dependency',
    physics: { strength: 1.40, distance: 300 }, style: NEXUS_CALL, tooltip: 'Nexus operation ↔ Activity dependency (sync-op body call)' },
  { id: 'linkEndpointToOperation', label: 'Ep↔Op', sourceType: 'nexusEndpoint', targetType: 'nexusOperation',
    relation: 'containment',
    physics: { strength: 1.50, distance: 470 }, style: EP_COMPOSITION, tooltip: 'Nexus endpoint ↔ Nexus operation (the endpoint fronts the operation)' },
]

// Resolve an edge to its category. Preserves the prioritized rule order of the
// engine's former `edgeCategory` chain exactly: containment edges stratify by
// their nexus / L3 / L4 endpoints; dependency edges stratify by tier and, for
// the workflow ↔ operation pair, by direction. Unmatched cases fall through to
// the broadest category in each branch (Worker↔Namespace containment;
// Workflow↔Activity dep).
export function edgeTypeFor(
  edge: Pick<GraphEdge, 'dimensions'>,
  src: DimensionValue | undefined,
  tgt: DimensionValue | undefined,
): EdgeTypeId {
  const has = (a: DimensionValue, b: DimensionValue) =>
    (src === a && tgt === b) || (src === b && tgt === a)

  let id: EdgeTypeId
  if (isContainment(edge)) {
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
    if (dispatchOf(edge) === 'signalSend') id = 'linkSignalSend'
    else if (src === 'namespace' || tgt === 'namespace') id = 'linkNsToNs'
    else if (src === 'worker' || tgt === 'worker') id = 'linkWorkerToWorker'
    else if (src === 'workflow' && tgt === 'nexusOperation') id = 'linkWorkflowToOperation'
    else if (src === 'nexusOperation' && tgt === 'workflow') id = 'linkOperationToWorkflow'
    else if (has('nexusOperation', 'nexusOperation')) id = 'linkWorkflowToOperation'
    else if (has('nexusOperation', 'activity')) id = 'linkOperationToActivity'
    else if (has('workflow', 'workflow')) id = 'linkWorkflowToWorkflow'
    else id = 'linkWorkflowToActivity'
  }
  return id
}
