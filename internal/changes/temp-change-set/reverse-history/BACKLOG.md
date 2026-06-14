# reverse-history Workstream Backlog

Dedicated backlog for the **reverse-history** effort: reverse-engineering a deployment graph from Temporal workflow-history JSON. Kept separate from the per-component backlogs (`parser`, `visualizer`, `dsl`, …) so this project's deferred work isn't lost behind slower component workstreams.

Design/architecture hub: [GRAPH_FROM_HISTORY.md](../../../GRAPH_FROM_HISTORY.md). That document owns the staged plan (Pre + Stages 1–4); this file owns the deferred ideas and open questions. When a stage runs, its active cycle work (`REVISIONS`/`CHANGES`) still lives with the component it edits (e.g. `internal/changes/parser/`), but is initiated from and linked back to this workstream.

---

## Deferred: Nexus reverse-engineering

The entire nexus side is parked so v1 can ship on workflows / activities / task-queues.

### Forward-graph nexus normalization

The Pre stage (graph-model normalization) deliberately leaves `nexusEndpoint` / `nexusOperation` nodes carrying their `namespace` + `queue` fields, so the visualizer's existing local endpoint↔operation derivation ([tools/visualizer/src/graph/build.ts](../../../tools/visualizer/src/graph/build.ts) lines ~171-197) keeps working untouched. Finishing the normalization means:

- Drop `namespace`/`queue` from `nexusEndpoint` / `nexusOperation` nodes.
- **Move the endpoint↔operation composition edge upstream** into the graph package (`tools/lsp/parser/graph/`), matching endpoint and operation deployments on `(namespace, queue)` and emitting the edge there.
- Update the visualizer to consume the upstream edge instead of deriving it; update `twf.schema.json`.

**Open question (deferred from the design discussion):** edge kind — reuse `containment`, or introduce a dedicated kind (e.g. `nexusRoute`) for distinct styling?

### History nexus decoding

- Decode `NEXUS_OPERATION_SCHEDULED` (and its started/completed siblings) in `tools/lsp/parser/history`.
- Emit `nexusCall` edges; synthesize endpoint / service / operation nodes from the observed `endpoint` / `service` / `operation` names.

**Open question:** endpoint→namespace mapping. Nexus endpoints are namespace-scoped routing aliases; history gives `endpoint`/`endpointId` but not the backing namespace/queue, so reconstructing endpoint placement from history alone needs design.

---

## Deferred: history fidelity

### Signal-target resolution

Resolve `signalSend` edges to real workflow-type nodes using the cross-file `workflowId → workflowType` index built during the import fold. Only works when the target's history was also sampled; until then, signal targets to un-sampled workflows surface as `unresolved` and show in the diagnostics panel.

### Local activities

Local activities appear as `MARKER_RECORDED` ("LocalActivity") events, not `ACTIVITY_TASK_SCHEDULED`. Add a marker decoder to `tools/lsp/parser/history` to recover them as activity nodes/edges.

---

## Deferred: sampler ergonomics

`tools/sampler/` v1 is one command per namespace, two internal phases (enumerate types via Visibility, then percentage-sample preferring running workflows). Later:

- ~~Time-window / status filters.~~ DONE — `--since` / `--until` (`StartTime` window; RFC3339 or duration) and `--status` (`ExecutionStatus`), threaded through enumeration and candidate selection. See [SAMPLER_FILTERS_CHANGES.md](SAMPLER_FILTERS_CHANGES.md).
- **Transitive sampling:** auto-fetch child-workflow and nexus-target histories so the graph is complete without separate runs per type.
- Concurrency and rate limiting against the server.
- Temporal Cloud auth via environment variables (parallel to the `temporal` CLI's env handling).

---

## Deferred: product surfaces

### VS Code / Cursor entry point

A "Visualize from workflow history" command that runs the sampler (or accepts a JSON file/folder) and feeds the `twf graph --history` envelope to the webview.

### Observed-vs-designed overlay

Because the importer emits the same node-ID scheme as `graph.Extract`, a future mode could **diff** a history-derived graph against a `.twf`-derived one — surfacing drift between design and production: orphaned designs (defined but never observed), undocumented task queues, unexpected calls. This is the long-term payoff of the "first-class graph output" decision.

---

## Open questions (cross-cutting)

- **History diagnostics kind:** reuse the envelope's `graph` diagnostic kind for import-time problems, or add a dedicated `history` kind?
- **Visibility type-enumeration mechanism:** confirm whether target server versions support `CountWorkflowExecutions GROUP BY WorkflowType`; otherwise fall back to paginated `ListWorkflow` aggregation (sampler Phase A).
- **Validation/rollout:** dogfood against a real namespace; compare a history-derived graph to the hand-written `.twf` for a system we own, to validate the event→graph mapping.
