// Build view-side Graph from `twf graph`'s deployment graph + the AST.
//
// The visualizer used to walk the AST itself (statement walking, copy
// expansion, fan-out, manual coarsening). That semantic work now lives in
// `tools/lsp/parser/graph/` and is consumed here through the `ParserGraph`
// JSON payload. This module is a thin renderer-translator: parser nodes
// become view nodes, parser edges become view edges, parser coarsened
// edges become L2/L1 view edges. No dispatch / routing logic remains.
//
// `ast` is consulted for per-definition metadata the deployment graph
// doesn't carry — most importantly `sourceFile` (which the per-file
// filter chip reads), but also things like `params` and return types
// that hover/details panels may want to surface in the future.

import type { Definition, TWFFile } from '../types/ast'
import type {
  CoarsenedEdge,
  NodeKind,
  ParserEdge,
  ParserGraph,
} from '../types/parser-graph'
// The axes this domain projects a node onto. Names, not concepts, belong to the
// host: the library never mentions any of these ids.
import { DEF_TYPE_DIMENSION, SOURCE_FILE_DIMENSION } from './dimensions'
import type {
  Graph,
  GraphEdge,
  GraphNode,
  Relation,
  DimensionMap,
} from '@temporal-architect/graph-view'
import type { NodeType } from './node-types'
import { NODE_TYPE_REGISTRY, TEMPORAL_TYPE_DIMENSION } from './node-types'
import { DISPATCH_DIMENSION } from './edge-types'
/**
 * Project a parser node onto its axes. Absent values are OMITTED rather than
 * set to a placeholder — "this node has no source file" and "this node's source
 * file is the empty string" are different facts, and the visibility rules key on
 * the difference.
 *
 * The kind axis is a function of the type axis, and it is written here, once,
 * rather than derived by the engine on every read: a node carries its position
 * on every axis the host filters or lays out on, and which of those are
 * projections of which is the host's business.
 */
export function dimensionsFor(nodeType: NodeType, sourceFile: string | undefined): DimensionMap {
  const dims: Record<string, string> = {
    [TEMPORAL_TYPE_DIMENSION]: nodeType,
    [DEF_TYPE_DIMENSION]: NODE_TYPE_REGISTRY[nodeType].defType,
  }
  if (sourceFile !== undefined) dims[SOURCE_FILE_DIMENSION] = sourceFile
  return dims
}

// ---------------------------------------------------------------------------
// definitionKey → AST definition map
// ---------------------------------------------------------------------------
//
// Parser node `definition` is `${nodeType}:${name}`, e.g.
// `workflow:OrderWorkflow`. The view needs to join each graph node to its
// AST counterpart for sourceFile (and, in the future, params / hover
// content). Nexus operations and endpoints live nested inside their
// service / namespace AST nodes — for those we map the qualified name to
// the parent's source file, which is the file authors associate the
// child with.

type AstLookup = Map<string, { sourceFile?: string; def?: Definition }>

function buildAstLookup(ast: TWFFile): AstLookup {
  const m: AstLookup = new Map()
  for (const def of ast.definitions ?? []) {
    switch (def.type) {
      case 'workflowDef':
        m.set(`workflow:${def.name}`, { sourceFile: def.sourceFile, def })
        break
      case 'activityDef':
        m.set(`activity:${def.name}`, { sourceFile: def.sourceFile, def })
        break
      case 'workerDef':
        m.set(`worker:${def.name}`, { sourceFile: def.sourceFile, def })
        break
      case 'namespaceDef': {
        m.set(`namespace:${def.name}`, { sourceFile: def.sourceFile, def })
        for (const ep of def.endpoints ?? []) {
          m.set(`nexusEndpoint:${ep.endpointName}`, { sourceFile: def.sourceFile, def })
        }
        break
      }
      case 'nexusServiceDef': {
        m.set(`nexusService:${def.name}`, { sourceFile: def.sourceFile, def })
        for (const op of def.operations ?? []) {
          m.set(`nexusOperation:${def.name}.${op.name}`, { sourceFile: def.sourceFile, def })
        }
        break
      }
    }
  }
  return m
}

// ---------------------------------------------------------------------------
// Parser definition-key parsing
// ---------------------------------------------------------------------------
//
// The parser hands us `${kind}:${name}` and we project the kind to our
// `NodeType` union. Names with embedded colons are preserved by splitting
// on the FIRST colon — same convention the previous build.ts used.

function splitDefinitionKey(definitionKey: string): { kind: string; name: string } {
  const i = definitionKey.indexOf(':')
  if (i < 0) return { kind: definitionKey, name: '' }
  return { kind: definitionKey.slice(0, i), name: definitionKey.slice(i + 1) }
}

// Exhaustive parser-kind → view-NodeType mapping. Keyed by the closed wire
// union `NodeKind`, so a newly-added parser kind is a missing-key *compile*
// error here rather than a silent mislabel. `nodeTypeFromKind` throws loudly
// on any genuinely unknown runtime string instead of coercing to a default.
const KIND_TO_NODE_TYPE: Record<NodeKind, NodeType> = {
  namespace: 'namespace',
  nexusEndpoint: 'nexusEndpoint',
  worker: 'worker',
  nexusService: 'nexusService',
  workflow: 'workflow',
  nexusOperation: 'nexusOperation',
  activity: 'activity',
}

function nodeTypeFromKind(kind: string): NodeType {
  const nodeType = KIND_TO_NODE_TYPE[kind as NodeKind]
  if (nodeType === undefined) {
    throw new Error(`unknown parser node kind: ${kind}`)
  }
  return nodeType
}

// Pretty name for the canvas label. Nexus operations come in as
// `Service.Op`; we strip the service prefix so the label is the op
// alone — the service identity is already visible via the parent node.
function displayNameFor(nodeType: NodeType, definitionName: string): string {
  if (nodeType === 'nexusOperation') {
    const dot = definitionName.lastIndexOf('.')
    return dot >= 0 ? definitionName.slice(dot + 1) : definitionName
  }
  return definitionName
}

// ---------------------------------------------------------------------------
// buildGraph
// ---------------------------------------------------------------------------

export function buildGraph(parserGraph: ParserGraph, ast: TWFFile): Graph {
  const astLookup = buildAstLookup(ast)

  const nodes = new Map<string, GraphNode>()
  const edges: GraphEdge[] = []
  let edgeSeq = 0

  // Containment edges are emitted upstream as `kind: "containment"`. We
  // build a child → parent index from them so each view node can carry
  // its `parentId` directly.
  const parentByChild = new Map<string, string>()
  for (const pe of parserGraph.edges) {
    if (pe.kind === 'containment') parentByChild.set(pe.from, pe.to)
  }

  // --- Nodes ---
  for (const pn of parserGraph.nodes) {
    const { kind, name } = splitDefinitionKey(pn.definition)
    const nodeType = nodeTypeFromKind(kind)
    const ast = astLookup.get(pn.definition)
    nodes.set(pn.id, {
      id: pn.id,
      dimensions: dimensionsFor(nodeType, ast?.sourceFile),
      name: displayNameFor(nodeType, name),
      // Per-domain display metadata the library must not interpret (R3). The
      // tooltip reads these back out by name; nothing in the engine does.
      payload: {
        worker: pn.worker,
        namespace: pn.namespace,
        queue: pn.queue,
      },
      parentId: parentByChild.get(pn.id),
      // The parser's orphan flag becomes the library's ring; its definition
      // key, the key every deployment copy of one definition shares; its
      // template holes, one `× {param}` badge each (D67).
      ring: pn.orphan ? 'dashed' : undefined,
      copyKey: pn.definition,
      badges: pn.templateParams?.map(p => `× ${p}`),
    })
  }

  // --- Edges (containment + dispatch), one per (caller, callee, kind) ---
  //
  // The parser emits one edge per call site; this graph answers "does X reach
  // Y, and how" (GRAPH_VIEW.md § Edges), so repeated call sites fold into one
  // edge here and the first keeps its routing payload as the representative.
  // This fold is the host's: the library draws every edge it is given, two
  // edges between one pair being two facts (D66). What is NOT folded is two
  // kinds between one pair — a call and a signal both show.
  const seenEdges = new Set<string>()
  for (const pe of parserGraph.edges) {
    const key = `${pe.from}\u0000${pe.to}\u0000${pe.kind}`
    if (seenEdges.has(key)) continue
    seenEdges.add(key)
    const view = parserEdgeToViewEdge(pe, nodes, edgeSeq++)
    if (view) edges.push(view)
  }

  // --- Coarsened edges (worker-tier + namespace-tier dispatch projection) ---
  for (const ce of parserGraph.coarsenedEdges) {
    const key = `${ce.from}\u0000${ce.to}\u0000coarsened`
    if (seenEdges.has(key)) continue
    seenEdges.add(key)
    const view = coarsenedEdgeToViewEdge(ce, nodes, edgeSeq++)
    if (view) edges.push(view)
  }

  // The nexus operation ↔ endpoint composition edge is emitted upstream
  // by the parser as `kind: "nexusRoute"` and translated above alongside
  // every other parser edge. The visualizer no longer derives it from
  // node (namespace, queue) metadata — the parser owns that matching.

  return { nodes, edges }
}

// ---------------------------------------------------------------------------
// Per-edge translation helpers
// ---------------------------------------------------------------------------

function parserEdgeToViewEdge(
  pe: ParserEdge, nodes: Map<string, GraphNode>, seq: number,
): GraphEdge | null {
  const src = nodes.get(pe.from)
  const tgt = nodes.get(pe.to)
  if (!src || !tgt) return null

  // nexusRoute (operation → endpoint composition) renders as a
  // containment-style edge, matching the prior locally-derived edge. It
  // does NOT feed the parentByChild map, so the operation's parentId
  // stays its owning service.
  const relation: Relation =
    pe.kind === 'containment' || pe.kind === 'nexusRoute' ? 'containment' : 'dependency'
  const out: GraphEdge = {
    id: `e${seq}`,
    sourceId: pe.from,
    targetId: pe.to,
    relation,
  }
  // The producer's kind, verbatim, on every dependency edge. It used to be
  // carried only when it was `signalSend` — the one value the spring classifier
  // needed — which made the field a flag in disguise. As an open axis it is
  // what lets 4c resolve springs from dispatch rather than from endpoint types
  // alone (T14's sixteenth case). A containment edge dispatches nothing, so it
  // carries no axes at all.
  if (relation === 'dependency') out.dimensions = { [DISPATCH_DIMENSION]: pe.kind }
  // Which endpoint routed the call is per call site, not identity and not an
  // axis — the same operation is reachable through two endpoints in different
  // namespaces — so it rides as host-owned payload.
  if (pe.routing?.nexusEndpoint) {
    out.payload = { nexusEndpoint: pe.routing.nexusEndpoint }
  }
  return out
}

function coarsenedEdgeToViewEdge(
  ce: CoarsenedEdge, nodes: Map<string, GraphNode>, seq: number,
): GraphEdge | null {
  const src = nodes.get(ce.from)
  const tgt = nodes.get(ce.to)
  if (!src || !tgt) return null

  // A projection of several dispatches, so it has a relation and no single
  // dispatch kind.
  return {
    id: `e${seq}`,
    sourceId: ce.from,
    targetId: ce.to,
    relation: 'dependency',
  }
}
