# Visualizer: Consume `twf graph` Deployment Graph

This REVISIONS replaces a dropped earlier draft (visualizer/REVISIONS_002 — "Task-Queue-Aware
Dependency Edges") that proposed a TypeScript-side routing fix. Investigation revealed the work
belongs upstream as a resolved deployment graph. See
[parser/REVISIONS_003](../parser/REVISIONS_003.md) for the architectural argument and the JSON
contract this revision consumes.

## Problem Statement

`tools/visualizer/src/graph/build.ts` (~480 lines) reimplements substantial program-semantics
work that the parser should own:

- Statement walking via `walkStmts` / `walkTarget` (mirrors `tools/lsp/parser/ast/walk.go`).
- Dependency edge extraction via `emitCall` (mirrors `deps/graph.go`'s `extractFromBody`).
- Per-worker copy expansion (introduced by the in-flight per-worker duplication feature).
- Worker → namespace inference (`workerToNamespace` map at lines 64-72).
- Task-queue routing resolution (originally proposed by the dropped REVISIONS_002).

`twf graph` (parser/REVISIONS_003) emits a real graph: deployment nodes + dispatch edges, both
fully resolved. The visualizer becomes a renderer over that graph.

## Data Flow

| View | Primary input | Secondary input |
|---|---|---|
| **Tree view** | `twf parse` (AST) | — |
| **Graph view** | `twf graph` (deployment graph) | AST for hover/expand details (params, body source, endpoint metadata) |

The views remain **functionally connected** — cross-view hover, selection sync, source
navigation all still work — but their *inputs* are decoupled. Each view has one primary data
source. Cross-view identity threads through `node.definition` (the AST anchor on each graph
node), which is the same key form the tree view uses; selecting `OrderWorkflow` in tree view
highlights every deployment node whose `definition === "workflow:OrderWorkflow"` in graph view.

## Scope

### Group 1: Replace `buildGraph`'s semantic work with parserGraph translation

**Before:** `buildGraph` walks the AST, materializes copy nodes, walks workflow bodies, fans out
edges across all copies of each callee.

**After:** `buildGraph` reads `parserGraph.nodes` and `parserGraph.edges`. For each parser node,
emit a view node with tier/duplicate-group metadata. For each parser edge (containment +
dispatch), emit a view edge with the right `edgeType`.

```ts
function buildGraph(parserGraph: ParserGraph, ast: TWFFile): Graph {
  const nodes = new Map<string, GraphNode>()
  const edges: GraphEdge[] = []
  const parentByChild = new Map<string, string>()

  // Containment edges feed parentId lookup.
  for (const pe of parserGraph.edges) {
    if (pe.kind === 'containment') parentByChild.set(pe.from, pe.to)
  }

  for (const pn of parserGraph.nodes) {
    nodes.set(pn.id, {
      id: pn.id,
      level: tierOf(pn),
      nodeType: kindOf(pn.definition),
      name: nameOf(pn.definition),
      sourceFile: sourceFileOf(pn.definition, ast),
      parentId: parentByChild.get(pn.id),
      orphan: pn.orphan ?? false,
      definitionKey: pn.definition,
      // view-only deployment metadata for hover/tooltip:
      worker: pn.worker, namespace: pn.namespace, queue: pn.queue,
    })
  }

  for (const pe of parserGraph.edges) {
    edges.push({
      id: `e${edges.length}`,
      edgeType: pe.kind === 'containment' ? 'containment' : 'dependency',
      sourceId: pe.from,
      targetId: pe.to,
      sourceLevel: nodes.get(pe.from)!.level,
      targetLevel: nodes.get(pe.to)!.level,
      nexusEndpoint: pe.routing?.nexusEndpoint,
      line: pe.line,
      kind: pe.kind,
    })
  }

  for (const ce of parserGraph.coarsenedEdges) {
    edges.push({
      id: `e${edges.length}`,
      edgeType: 'dependency',
      sourceId: ce.from,
      targetId: ce.to,
      sourceLevel: ce.tier === 'namespace' ? 1 : 2,
      targetLevel: ce.tier === 'namespace' ? 1 : 2,
      weight: ce.weight,
    })
  }

  const duplicateGroups = groupByDefinition(nodes)
  return { nodes, edges, duplicateGroups }
}
```

Deleted: `walkStmts`, `walkTarget`, `emitCall`, `copiesByDefKey` (now `parserGraph.nodes`),
`nodeToWorker` (now `node.worker`), `registeredDefs`, `workerToNamespace` (now `node.namespace`),
orphan detection, both coarsening loops, async-backing loop, parent inference, namespace
projection.

Helpers that remain: `tierOf`, `kindOf`, `nameOf` — pure mappings over the parser key form.

### Group 2: Containment edges come from parserGraph

Per parser/REVISIONS_003, containment edges are emitted upstream as a distinct `kind: "containment"`. The visualizer consumes them like any other edge — no derivation, no parent
lookup logic in `buildGraph`. `parentId` on view nodes is set by indexing the containment edges
(`edge.from` → `edge.to` for containment kind).

Deleted: `workerToNamespace` (lines 64-72), orphan detection pass, all parent-lookup logic.

### Group 3: Coarsened edges come from upstream

Parser/REVISIONS_003 emits `coarsenedEdges[]` at the top level — worker-tier and namespace-tier
aggregations of dispatch edges, with `tier` and `weight` fields. The visualizer reads them
directly and emits L2 / L1 view edges. No projection logic in TS.

Deleted: Step 5 (worker→worker projection loop) and Step 6 (ns→ns projection loop) at the bottom
of `buildGraph`.

### Group 4: View-only state retains its current shape

Unchanged:
- Tier / level assignment.
- `definitionKey` (now equal to `pn.definition`).
- `duplicateGroups: Map<definitionKey, Set<nodeId>>` for hover highlighting; grouped by
  `node.definition`.
- Cross-view identity (`node.definition` is the AST anchor; tree view uses the same key).
- Layout, simulation, hover, rendering — no changes.

### Group 5: New node kind `nexusEndpoint`

Parser/REVISIONS_003 introduces `nexusEndpoint` deployment nodes (one per
`NamespaceDef.endpoints[i]`, parented to namespace). `buildGraph` translates them with no
special-casing — they're more nodes. The `NodeType` union grows by one (`'nexusEndpoint'`).

Endpoints have no outgoing edges (they're routing aliases, not callers). Their role in nexus
dispatch is captured by `routing.nexusEndpoint` on `nexusCall` edges. The visualizer surfaces
the routing association at hover time — see visualizer/REVISIONS_004.

**This revision does not specify the visual treatment of the nexus surface** (color, icon,
force category, filter membership, hover behaviour). That work — making sure services,
operations, and endpoints read as a cohesive nexus group — is the scope of
[visualizer/REVISIONS_004](./REVISIONS_004.md).

### Group 6: Loader / data flow

The loader (VS Code extension and standalone entry points) makes two parser calls per file:

1. `twf parse <file>` — AST + diagnostics (already loaded).
2. `twf graph <file>` — deployment graph (new).

`buildGraph` signature:

```ts
// Before
function buildGraph(ast: TWFFile): Graph

// After  
function buildGraph(parserGraph: ParserGraph, ast: TWFFile): Graph
```

`parserGraph` is primary; `ast` is consulted for definition content the deployment graph
doesn't carry (params, return types, body for source navigation).

## Files Touched

| File | Change |
|------|--------|
| `tools/visualizer/src/graph/build.ts` | Collapse from ~480 → ~120 lines; delete statement walking, copy expansion, fan-out, coarsening, namespace inference, orphan detection; replace with parserGraph translation |
| `tools/visualizer/src/types/parser-graph.ts` (new) | TS types mirroring parser/REVISIONS_003 |
| `tools/visualizer/src/lib.ts` (and VS Code webview entry) | Make `twf graph` call alongside `twf parse`; thread both into `buildGraph` |
| `packages/vscode/src/extension.ts` | Add `twf graph` execFile alongside existing `twf parse` |
| `tools/visualizer/spec/GRAPH_VIEW.md` | Rewrite "Graph Construction Order"; add "two views, two commands" mapping |

## Open Questions

1. **Hover content sourcing.** Today the visualizer shows the source file path and line numbers
   in hover. With the new shape, `parserGraph.edges[].line` covers edge line info, but node-level
   info (where was this *definition* defined?) still comes from the AST. The visualizer joins
   `node.definition` → AST definition by name+kind. Confirm this stays performant for large
   files.

2. **Tests for `buildGraph`.** No existing harness. Two options:
   - Generate AST + parserGraph at test time by shelling to `twf parse` / `twf graph` against
     `.twf` fixtures.
   - Commit golden JSON files alongside `.twf` fixtures.

   Lean toward generating — keeps fixtures in sync with parser output.

3. **What happens between landing the per-worker duplication feature and `twf graph`?** During
   the gap, the visualizer has Cartesian fan-out (incorrect routing). If the gap will be long,
   reconsider a TS-side queue filter as a labelled stopgap. If short, accept the temporary
   regression.

## What Stays In-Flight

The per-worker duplication feature in the working tree (`build.ts`, `model.ts`, `GraphCanvas.tsx`,
`GraphView.tsx`) does not need to be reverted. Its view-layer pieces — `definitionKey`,
`duplicateGroups`, `workerScopedNodeId`, copy hover behaviour — are exactly the abstractions this
revision keeps. The semantic pieces (statement walking, naive fan-out, manual coarsening) get
replaced by parserGraph consumption.

Note on `workerScopedNodeId`: with the parser emitting composite IDs, this helper becomes a
no-op pass-through (`(definition, deploymentContext) => id`). Keep it as a documentation marker
or inline it — your call.

Recommended sequencing:

1. Land per-worker duplication feature (currently staged).
2. Land parser/REVISIONS_002 Group 1 (TS type fix).
3. Land parser/REVISIONS_003 (`twf graph` in Go).
4. Land this revision (visualizer consumes `twf graph`).

## Dependencies

- **Blocked by [parser/REVISIONS_003](../parser/REVISIONS_003.md).**
- **Replaces visualizer/REVISIONS_002** (deleted).
- **parser/REVISIONS_002 Group 1** is unrelated; land independently.

## Outcome

- `build.ts` becomes a thin renderer that hooks ID links between nodes the parser emits.
  Roughly ~120 lines. No semantic logic remains.
- Routing is correct because the parser resolves it as part of node/edge identity.
- Cartesian fan-out is structurally impossible — there's no fan-out step.
- Multi-namespace workers are handled correctly without view-layer ambiguity.
- Tree view and graph view have decoupled inputs; cross-view function (hover, selection,
  navigation) threads through `node.definition`.
- Adding the author-go skill costs nothing in the visualizer — same upstream contract.
