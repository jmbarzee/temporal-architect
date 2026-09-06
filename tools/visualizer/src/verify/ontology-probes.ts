// Probes for the taxonomy seam itself.
//
// Two things here, and neither had a check before:
//
//   1. **Fallback resolution.** The whole justification for making a taxonomy's
//      fallback style *required* is that a lookup miss must not throw inside the
//      draw loop. Nothing verified what a miss actually returns, so the fallback
//      could have been corrupted — or quietly stopped being reached — with every
//      gate green.
//   2. **That the seam is a seam.** A container that everything resolves through
//      is only worth having if supplying a different one actually changes the
//      answer. So this drives `computeVisibleGraph` with a deliberately
//      different taxonomy and goldens the result. If a consumer starts reaching
//      past the container again, the two rows below stop disagreeing and this
//      probe goes red.

import { computeVisibleGraph } from '../components/graph-view/visibleGraph'
import type { GraphEdge, NodeType } from '../graph/model'
import { DEFAULT_ONTOLOGY, NODE_TYPE_REGISTRY } from '../graph/node-types'
import { createOntology } from '../graph/ontology'
import type { SimNode } from '../graph/simulation'
import type { Json } from './snapshot'
import { sorted } from './snapshot'

const UNDECLARED = 'notADeclaredKey' as NodeType

function node(id: string, nodeType: NodeType, parentId?: string): SimNode {
  return {
    id, nodeType, name: id, orphan: parentId === undefined,
    definitionKey: `${nodeType}:${id}`,
    ...(parentId !== undefined ? { parentId } : {}),
    x: 0, y: 0, vx: 0, vy: 0, pinned: false,
  }
}

const NODES: SimNode[] = [
  node('wk', 'worker'),
  node('wf', 'workflow', 'wk'),
  node('act', 'activity', 'wk'),
]
const EDGES: GraphEdge[] = [
  { id: 'c0', edgeType: 'containment', sourceId: 'wf', targetId: 'wk', sourceNodeType: 'workflow', targetNodeType: 'worker' },
  { id: 'd0', edgeType: 'dependency', sourceId: 'wf', targetId: 'act', sourceNodeType: 'workflow', targetNodeType: 'activity' },
]
const BY_ID = new Map(NODES.map(n => [n.id, n]))
const SOURCE = { nodes: NODES, edges: EDGES, getNode: (id: string) => BY_ID.get(id) }

/**
 * A taxonomy that answers differently from the shipped one: it declares the same
 * keys but maps them to different filter keys entirely. Nothing about it is
 * domain-specific — that is the point. If the graph engine is genuinely driven
 * by its container, filtering on `tier-2` selects the worker.
 */
const ALTERNATE = createOntology({
  nodeTypeKeys: ['worker', 'workflow', 'activity'] as NodeType[],
  nodeStyles: {
    worker: { ...NODE_TYPE_REGISTRY.worker, defType: 'tier-2', summaryKind: 'degree' },
    workflow: { ...NODE_TYPE_REGISTRY.workflow, defType: 'tier-3' },
    activity: { ...NODE_TYPE_REGISTRY.activity, defType: 'tier-4' },
  } as Record<NodeType, (typeof NODE_TYPE_REGISTRY)['worker']>,
  edgeTypes: DEFAULT_ONTOLOGY.edgeTypes,
  resolveEdgeType: DEFAULT_ONTOLOGY.resolveEdgeType,
  fallbackStyle: NODE_TYPE_REGISTRY.activity,
})

function visible(ontology: typeof DEFAULT_ONTOLOGY, types: string[]): Json {
  const vg = computeVisibleGraph(SOURCE, new Set(types), new Set<string>(), ontology)
  return {
    visibleNodeIds: sorted(vg.visibleIds),
    summaries: sorted([...vg.nodeSummaries].map(([id, s]) => `${id}=${s}`)),
  }
}

export function ontologyProbes(): Json {
  const fallback = DEFAULT_ONTOLOGY.resolveNodeStyle({ nodeType: UNDECLARED })
  return {
    // What a miss resolves to, field by field. The `defType` matters most: it is
    // what the visibility predicate tests, so it decides whether an unrecognized
    // node is permanently visible, permanently hidden, or accidentally lumped in
    // with a real type.
    fallbackStyle: {
      label: fallback.label,
      icon: fallback.icon,
      defType: fallback.defType,
      summaryKind: fallback.summaryKind,
      size: { r: fallback.size.r, iconSize: fallback.size.iconSize },
      physics: {
        charge: fallback.physics.charge,
        coreRadius: fallback.physics.coreRadius,
        yBand: { ...fallback.physics.yBand },
      },
    },
    // A miss must be stable, not a fresh object each time: the draw loop resolves
    // per node per frame and callers compare styles by reference.
    fallbackIsStable:
      DEFAULT_ONTOLOGY.resolveNodeStyle({ nodeType: UNDECLARED }) ===
      DEFAULT_ONTOLOGY.resolveNodeStyle({ nodeType: UNDECLARED }),
    // A declared key must NOT reach the fallback.
    declaredKeyUnaffected:
      DEFAULT_ONTOLOGY.resolveNodeStyle({ nodeType: 'worker' }) === NODE_TYPE_REGISTRY.worker,

    // The seam, exercised. Same graph, same filter vocabulary, two taxonomies —
    // the answers must differ, or nothing is actually being injected.
    injection: {
      shippedTaxonomyOnItsOwnKeys: visible(DEFAULT_ONTOLOGY, ['workerDef', 'workflowDef']),
      shippedTaxonomyOnAlternateKeys: visible(DEFAULT_ONTOLOGY, ['tier-2', 'tier-3']),
      alternateTaxonomyOnItsOwnKeys: visible(ALTERNATE, ['tier-2', 'tier-3']),
      alternateTaxonomyOnShippedKeys: visible(ALTERNATE, ['workerDef', 'workflowDef']),
    },
  }
}
