# Visualizer Changes: Consume the upstream nexusRoute edge

**Source:** Propagated in lockstep from `internal/changes/parser/CHANGES_004.md` (forward-graph nexus normalization — breaking twf graph Schema change). Promoted from the reverse-history workstream backlog.

## Summary

The visualizer no longer reconstructs the nexus endpoint↔operation relationship from node `(namespace, queue)` fields — it consumes the parser's new `nexusRoute` edge. Both prior queue-based derivation sites are removed. After this change, `queue` (and `namespace`) are read **only** for hover-tooltip display; nothing in the visualizer derives graph structure or highlight topology from them.

## Changes

- **`tools/visualizer/src/types/parser-graph.ts`**: added `'nexusRoute'` to `ParserEdgeKind`; updated the `ParserNode` doc to record that `namespace` is now `nexusService`-only and that `worker`/`namespace`/`queue` are display-only.
- **`tools/visualizer/src/graph/build.ts`**: deleted the local endpoint↔operation derivation block (the `endpointsByDeployment` `(namespace, queue)` match that manufactured view edges). `parserEdgeToViewEdge` now maps `kind: "nexusRoute"` to `edgeType: "containment"` (matching the prior visual). Because `nexusRoute` is not in the parser's `containment` set, it never feeds `parentByChild`, so an operation's `parentId` stays its owning service.
- **`tools/visualizer/src/components/graph-view/useHighlight.ts`**: replaced the nexusService↔endpoint `(namespace, queue)` match with edge traversal — for an active `nexusService`, collect its operation children (`parentId === activeId`) and follow their `nexusRoute` edges (`targetNodeType === 'nexusEndpoint'`) to the fronting endpoints.
- **`tools/visualizer/src/components/GraphView.tsx`**: the `nexusEndpoint` hover context line derives the namespace from the containment parent (`parentName`) instead of the now-absent `node.namespace`; queue still shown.
- **`tools/visualizer/src/graph/model.ts`**: updated the `GraphNode` deployment-metadata doc comments — `namespace` on `nexusService` only; `worker` on `nexusService`/`nexusOperation`; all display-only.

## Spec alignment (`visualizer-spec`)

- **`tools/visualizer/spec/GRAPH_VIEW.md`**: § Graph Construction step 2 now lists `nexusRoute` → `edgeType: "containment"` and notes it never reassigns `parentId`; added a paragraph describing the parser-emitted `NexusOperation → NexusEndpoint` composition edge; rewrote § Nexus Routing Association so the nexusService hover reads `nexusRoute` edges rather than matching `(namespace, queue)`.

## Validation

- `npm run build` from `tools/visualizer/` — clean (`tsc && vite build`). No lint errors.

## Downstream propagation

- Leaf component — propagation terminates here.
