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
  ParserEdge,
  ParserGraph,
} from '../types/parser-graph'
import type { EdgeType, Graph, GraphEdge, GraphNode, NodeType } from './model'

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

function nodeTypeFromKind(kind: string): NodeType {
  switch (kind) {
    case 'namespace': return 'namespace'
    case 'nexusEndpoint': return 'nexusEndpoint'
    case 'worker': return 'worker'
    case 'nexusService': return 'nexusService'
    case 'workflow': return 'workflow'
    case 'nexusOperation': return 'nexusOperation'
    case 'activity': return 'activity'
    default: return 'workflow'  // defensive — parser kinds are closed
  }
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
      nodeType,
      name: displayNameFor(nodeType, name),
      sourceFile: ast?.sourceFile,
      parentId: parentByChild.get(pn.id),
      orphan: pn.orphan ?? false,
      definitionKey: pn.definition,
      worker: pn.worker,
      namespace: pn.namespace,
      queue: pn.queue,
    })
  }

  // --- Edges (containment + dispatch, both as-emitted) ---
  for (const pe of parserGraph.edges) {
    const view = parserEdgeToViewEdge(pe, nodes, edgeSeq++)
    if (view) edges.push(view)
  }

  // --- Coarsened edges (worker-tier + namespace-tier dispatch projection) ---
  for (const ce of parserGraph.coarsenedEdges) {
    const view = coarsenedEdgeToViewEdge(ce, nodes, edgeSeq++)
    if (view) edges.push(view)
  }

  // The nexus operation ↔ endpoint composition edge is emitted upstream
  // by the parser as `kind: "nexusRoute"` and translated above alongside
  // every other parser edge. The visualizer no longer derives it from
  // node (namespace, queue) metadata — the parser owns that matching.

  // --- Duplicate groups (definitionKey → every nodeId that represents it) ---
  // The parser's `definition` field is already the right grouping key —
  // every deployment of the same definition shares it.
  const duplicateGroups = new Map<string, Set<string>>()
  for (const node of nodes.values()) {
    const group = duplicateGroups.get(node.definitionKey) ?? new Set<string>()
    group.add(node.id)
    duplicateGroups.set(node.definitionKey, group)
  }

  return { nodes, edges, duplicateGroups }
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
  const edgeType: EdgeType =
    pe.kind === 'containment' || pe.kind === 'nexusRoute' ? 'containment' : 'dependency'
  const out: GraphEdge = {
    id: `e${seq}`,
    edgeType,
    sourceId: pe.from,
    targetId: pe.to,
    sourceNodeType: src.nodeType,
    targetNodeType: tgt.nodeType,
  }
  if (pe.routing?.nexusEndpoint) {
    out.nexusEndpoint = pe.routing.nexusEndpoint
  }
  return out
}

function coarsenedEdgeToViewEdge(
  ce: CoarsenedEdge, nodes: Map<string, GraphNode>, seq: number,
): GraphEdge | null {
  const src = nodes.get(ce.from)
  const tgt = nodes.get(ce.to)
  if (!src || !tgt) return null

  return {
    id: `e${seq}`,
    edgeType: 'dependency',
    sourceId: ce.from,
    targetId: ce.to,
    sourceNodeType: src.nodeType,
    targetNodeType: tgt.nodeType,
  }
}
