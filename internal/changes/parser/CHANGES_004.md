# Parser Changes: Forward-graph nexus normalization

**Source review(s):** `internal/changes/parser/REVISIONS_004.md` (promoted from the reverse-history workstream — [reverse-history/BACKLOG.md](../temp-change-set/reverse-history/BACKLOG.md) § "Forward-graph nexus normalization")
**REVISIONS file(s):** `REVISIONS_004.md` (consumed)

## Summary

The nexus endpoint↔operation composition is now materialized **upstream** as a dedicated `nexusRoute` graph edge instead of being re-derived downstream from node `(namespace, queue)` fields. `namespace` is dropped from `nexusEndpoint` / `nexusOperation` nodes (it is the containment parent); `queue` (and, on operations, `worker`) remain as display-only metadata. This finishes the graph-model normalization the Pre stage deferred, so the parser is the single source of truth for nexus routing topology. Prework only — no nexus added to the history importer.

## Changes by Type

### Schema

- **`tools/lsp/cmd/twf/twf.schema.json`**: added `"nexusRoute"` to the `GraphEdge.kind` enum. `GraphNode.namespace` retained (still emitted on `nexusService`). **Breaking** twf graph JSON contract — landed in lockstep with the visualizer.
- Wire shape: `nexusEndpoint` / `nexusOperation` nodes no longer carry `namespace`. New `nexusRoute` edges (`from` = operation deployment, `to` = endpoint deployment) carry no `routing` block and never appear in `coarsenedEdges`.

### API

- **`tools/lsp/parser/graph/graph.go`**: added `EdgeNexusRoute = "nexusRoute"` constant; `Extract` now calls `emitNexusRoutes` (after `emitDispatchEdges`, before `emitCoarsenedEdges`). Updated the `Node` and `Edge` doc comments to describe the normalized nexus tier (namespace off endpoint/operation; queue display-only).

### Internal

- **`tools/lsp/parser/graph/nexus_routes.go`** (new): `emitNexusRoutes` matches each nexus operation deployment to every endpoint sharing its `(namespace, queue)` and emits a `nexusRoute` edge (direction operation → endpoint). Topology, not dispatch — no routing metadata.
- **`tools/lsp/parser/graph/nodes.go`**: dropped `Namespace` from the `nexusEndpoint` node and the `nexusOperation` node (endpoint keeps `Queue`; operation keeps `Worker` + `Queue`). `nexusService` node unchanged. Updated the `enumerateHosted` comment.
- **`tools/lsp/parser/graph/coarsen.go`**: `emitCoarsenedEdges` now skips `EdgeNexusRoute` alongside `EdgeContainment` so structural routes are never projected to worker/namespace tiers.

## Tests

- **`tools/lsp/parser/graph/graph_test.go`**: extended `TestTaskQueuesFixture` — asserts the `nexusRoute` edge `CheckPaymentStatus@paymentWorker → PaymentEndpoint` exists and that the non-matching secondary deployment (queue `payments-secondary`) has none; asserts `nexusEndpoint` / `nexusOperation` nodes carry empty `Namespace` (operation keeps `Worker`/`Queue`); asserts no `nexusRoute` edge leaks into `CoarsenedEdges`.
- Full suite green: `GOMODCACHE=$HOME/go/pkg/mod go build ./... && go test ./...` from `tools/lsp/`.

## Downstream propagation

- **`internal/changes/visualizer/CHANGES_003.md`** — consumed in lockstep (this is a breaking Schema change). The visualizer now reads the `nexusRoute` edge and no longer derives nexus topology from `(namespace, queue)`; the visualizer spec (`GRAPH_VIEW.md`) was aligned in the same effort. No pending downstream REVISIONS remain.
- **`vscode`** (`packages/vscode/`) — parser Schema change; flagged for manual review per the harness manifest (no automated review command).
