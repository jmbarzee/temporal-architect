// A synthetic graph for the visible-subgraph derivation — Tier C's analogue for
// `computeVisibleGraph`.
//
// The committed fixtures cannot reach three of its branches:
//
//   - **A node with no source file is always visible**, even when a file filter
//     is active. Every node in every fixture carries a source file, so the
//     `node.sourceFile &&` clause in the visibility predicate is dead under test
//     — and that clause is the absent-value half of the two dimensions' opposite
//     empty-set semantics.
//   - **Splicing through a hidden operation.** Reachable from the fixtures, but
//     only in one shape; here it is isolated so the rule is legible.
//   - **Graduating containment across two hidden tiers at once**, which needs a
//     deeper containment chain than the parser produces.
//
// Positions are irrelevant to the derivation and are all zero.

import type { GraphEdge, NodeType } from '../graph/model'
import type { SimNode } from '../graph/simulation'
import { computeVisibleGraph } from '../components/graph-view/visibleGraph'
import { edgeStyleKeyFor } from '../graph/edge-styles'
import { edgeTypeFor } from '../graph/edge-types'
import { ALL_NODE_TYPES, NODE_TYPE_REGISTRY } from '../graph/node-types'
import type { Json } from './snapshot'
import { sorted, sortedRecord } from './snapshot'

const FILE_A = 'a.twf'
const FILE_B = 'b.twf'

function n(
  id: string, nodeType: NodeType, parentId?: string, sourceFile?: string,
): SimNode {
  return {
    id,
    nodeType,
    name: id,
    orphan: parentId === undefined,
    definitionKey: `${nodeType}:${id}`,
    ...(parentId !== undefined ? { parentId } : {}),
    ...(sourceFile !== undefined ? { sourceFile } : {}),
    x: 0, y: 0, vx: 0, vy: 0, pinned: false,
  }
}

const NODES: SimNode[] = [
  n('ns', 'namespace', undefined, FILE_A),
  // No source file at all — always visible, whatever the file filter says.
  n('nsOrphan', 'namespace', undefined, undefined),
  n('wk', 'worker', 'ns', FILE_A),
  n('wkB', 'worker', 'ns', FILE_B),
  n('svc', 'nexusService', 'wk', FILE_A),
  n('ep', 'nexusEndpoint', 'ns', FILE_A),
  n('caller', 'workflow', 'wk', FILE_A),
  n('op', 'nexusOperation', 'svc', FILE_A),
  n('backing', 'workflow', 'wkB', FILE_B),
  n('act', 'activity', 'wk', FILE_A),
  // Same definitionKey as `act` — a second deployment of one definition.
  { ...n('actCopy', 'activity', 'wkB', FILE_B), definitionKey: 'activity:act' },
]

const EDGES: GraphEdge[] = [
  { id: 'c0', edgeType: 'containment', sourceId: 'wk', targetId: 'ns', sourceNodeType: 'worker', targetNodeType: 'namespace' },
  { id: 'c1', edgeType: 'containment', sourceId: 'wkB', targetId: 'ns', sourceNodeType: 'worker', targetNodeType: 'namespace' },
  { id: 'c2', edgeType: 'containment', sourceId: 'svc', targetId: 'wk', sourceNodeType: 'nexusService', targetNodeType: 'worker' },
  { id: 'c3', edgeType: 'containment', sourceId: 'ep', targetId: 'ns', sourceNodeType: 'nexusEndpoint', targetNodeType: 'namespace' },
  { id: 'c4', edgeType: 'containment', sourceId: 'caller', targetId: 'wk', sourceNodeType: 'workflow', targetNodeType: 'worker' },
  // Two tiers deep: operation -> service -> worker -> namespace.
  { id: 'c5', edgeType: 'containment', sourceId: 'op', targetId: 'svc', sourceNodeType: 'nexusOperation', targetNodeType: 'nexusService' },
  { id: 'c6', edgeType: 'containment', sourceId: 'backing', targetId: 'wkB', sourceNodeType: 'workflow', targetNodeType: 'worker' },
  { id: 'c7', edgeType: 'containment', sourceId: 'act', targetId: 'wk', sourceNodeType: 'workflow', targetNodeType: 'worker' },
  { id: 'c8', edgeType: 'containment', sourceId: 'actCopy', targetId: 'wkB', sourceNodeType: 'activity', targetNodeType: 'worker' },
  { id: 'c9', edgeType: 'containment', sourceId: 'op', targetId: 'ep', sourceNodeType: 'nexusOperation', targetNodeType: 'nexusEndpoint' },
  // The call path the splice rule rewrites: caller -> op -> backing.
  { id: 'd0', edgeType: 'dependency', sourceId: 'caller', targetId: 'op', sourceNodeType: 'workflow', targetNodeType: 'nexusOperation', nexusEndpoint: 'ep' },
  { id: 'd1', edgeType: 'dependency', sourceId: 'op', targetId: 'backing', sourceNodeType: 'nexusOperation', targetNodeType: 'workflow' },
  { id: 'd2', edgeType: 'dependency', sourceId: 'caller', targetId: 'act', sourceNodeType: 'workflow', targetNodeType: 'activity' },
  { id: 'd3', edgeType: 'dependency', sourceId: 'caller', targetId: 'backing', sourceNodeType: 'workflow', targetNodeType: 'workflow', dispatchKind: 'signalSend' },
]

const BY_ID = new Map(NODES.map(node => [node.id, node]))
const SOURCE = {
  nodes: NODES,
  edges: EDGES,
  getNode: (id: string) => BY_ID.get(id),
}

const defTypeOf = (t: NodeType) => NODE_TYPE_REGISTRY[t].defType
const ALL_DEF_TYPES = ALL_NODE_TYPES.map(defTypeOf)

function edgeLine(e: GraphEdge): string {
  const src = BY_ID.get(e.sourceId)
  const tgt = BY_ID.get(e.targetId)
  const style = src && tgt ? edgeStyleKeyFor(e, src, tgt) : 'UNRESOLVED-ENDPOINT'
  return `${edgeTypeFor(e).id}|${style}|${e.edgeType}|${e.sourceId} -> ${e.targetId}`
}

function state(types: string[], files: string[]): Json {
  const vg = computeVisibleGraph(SOURCE, new Set(types), new Set(files))
  return {
    visibleNodeIds: sorted(vg.visibleIds),
    graduatedEdges: sorted(vg.visibleEdges.map(edgeLine)),
    nodeSummaries: sortedRecord([...vg.nodeSummaries]),
    downstreamScores: sortedRecord([...vg.downstreamScores]),
  }
}

export function syntheticVisible(): Json {
  const cases: [string, Json][] = [
    ['all types, no file filter', state(ALL_DEF_TYPES, [])],
    // The absent-value rule: `nsOrphan` carries no source file and must survive
    // a filter that excludes every file it could have belonged to.
    ['all types, file A only', state(ALL_DEF_TYPES, [FILE_A])],
    ['all types, file B only', state(ALL_DEF_TYPES, [FILE_B])],
    ['all types, both files', state(ALL_DEF_TYPES, [FILE_A, FILE_B])],
    ['all types, a file no node has', state(ALL_DEF_TYPES, ['nonexistent.twf'])],
    // Operation hidden: caller -> op -> backing must splice to caller -> backing.
    ['operation hidden', state(ALL_DEF_TYPES.filter(t => t !== 'nexusOperationDef'), [])],
    // Two containment tiers hidden at once.
    ['service and worker hidden', state(['namespaceDef', 'nexusEndpointDef', 'nexusOperationDef', 'workflowDef', 'activityDef'], [])],
    ['namespaces only', state(['namespaceDef'], [])],
    ['empty type set', state([], [])],
  ]
  return {
    nodes: NODES.map(node => ({
      id: node.id,
      nodeType: node.nodeType,
      parentId: node.parentId ?? null,
      sourceFile: node.sourceFile ?? null,
      definitionKey: node.definitionKey,
    })),
    cases: sortedRecord(cases),
  }
}
