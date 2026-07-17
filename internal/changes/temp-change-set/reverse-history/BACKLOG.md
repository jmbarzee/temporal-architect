# reverse-history Workstream Backlog

Dedicated backlog for the **reverse-history** effort: reverse-engineering a deployment graph from Temporal workflow-history JSON. Kept separate from the per-component backlogs (`parser`, `visualizer`, `dsl`, …) so this project's deferred work isn't lost behind slower component workstreams.

Design/architecture hub: [GRAPH_FROM_HISTORY.md](./GRAPH_FROM_HISTORY.md) — the design-of-record and use-case reference (v1 shipped). This file owns only the genuinely-open work. When an item runs, its active cycle work (`REVISIONS`/`CHANGES`) lives with the component it edits (e.g. `internal/changes/parser/`), initiated from and linked back to this workstream.

---

## Deferred: Nexus history decoding

The forward-graph nexus half shipped (see GRAPH_FROM_HISTORY.md § "Since v1"). What remains is the *history* side:

- Decode `NEXUS_OPERATION_SCHEDULED` (and its started/completed siblings) in `tools/sampler/history`.
- Emit `nexusCall` edges; synthesize endpoint / service / operation nodes from the observed `endpoint` / `service` / `operation` names.

**Open question:** endpoint→namespace mapping. Nexus endpoints are namespace-scoped routing aliases; history gives `endpoint`/`endpointId` but not the backing namespace/queue, so reconstructing endpoint placement from history alone needs design.

---

## Deferred: history fidelity

### Signal-target resolution

Resolve `signalSend` edges to real workflow-type nodes using the cross-file `workflowId → workflowType` index built during the import fold. Only works when the target's history was also sampled; until then, signal targets to un-sampled workflows surface as `unresolved` and show in the diagnostics panel.

### Local activities

Local activities appear as `MARKER_RECORDED` ("LocalActivity") events, not `ACTIVITY_TASK_SCHEDULED`. Add a marker decoder to `tools/sampler/history` to recover them as activity nodes/edges.

---

## Deferred: sampler ergonomics

`tools/sampler/` v1 is one command per namespace, two internal phases (enumerate types via Visibility, then percentage-sample preferring running workflows). Time-window / status filters shipped (GRAPH_FROM_HISTORY.md § "Since v1"). Still open:

- **Transitive sampling:** auto-fetch child-workflow and nexus-target histories so the graph is complete without separate runs per type.
- Concurrency and rate limiting against the server.
- Temporal Cloud auth via environment variables (parallel to the `temporal` CLI's env handling).
- **Continue-as-new run boundaries:** `history.Build`'s `workflowID → startInfo` index is keyed by WorkflowID, so chained CAN runs (same WorkflowID, new RunID) collapse and only the first run's events are folded — activities in later runs are invisible. Needs a RunID-aware decode.

---

## Deferred: observed-graph time series & merge

The sampler now emits a single `observed-graph.json` (`observe.ObservedGraph`) with a per-edge occurrence time series (`ObservedEdge.Buckets`) laid out on an absolute-time `Window`. The shape was designed so the following are additive, not redesigns — none are wired yet:

- **Parallel / multi-namespace sampling.** `observe.Merge(a, b)` folds two graphs sampled over the *same* `Window` by unioning nodes/edges and summing buckets element-wise (associative). The sampler CLI still samples one namespace serially and never calls `Merge`. Wiring: shard history fetch across goroutines (and/or namespaces) with a shared `Window`, fold the shards, write once. Depends on the concurrency item above.
- **Per-node occurrence series (node "heat").** `ObservedGraph.Nodes` is structural only. A symmetric `ObservedNode { graph.Node; Buckets []int }` — populated from the `WORKFLOW_EXECUTION_STARTED` event already visited — would capture root-workflow execution counts per bucket (the one datum not derivable from incident edges). Cheap; adds node-throughput to the wire for the visualizer's future heat encoding.
- **Visualizer consumption.** The per-edge series reaches the visualizer on the wire but is dropped in the client projection today. Edge-weight (thickness/opacity by `sum(buckets)`) and time-based edge appear/decay animation are tracked in [`internal/changes/visualizer/BACKLOG.md`](../../visualizer/BACKLOG.md).

---

## Deferred: history-mode decomposition

`twf graph chunks --history` was removed alongside `twf graph --history` when history extraction moved into the sampler (the parser is now Temporal-free). A sampled deployment graph therefore no longer has a chunk-decomposition overlay in the visualizer's history mode. `decompose.Decompose` still operates on a `*graph.Graph`, so restoring this means giving it an observed-graph input path — e.g. the sampler additionally emitting a `chunks` payload, or a small `twf` subcommand that decomposes an `observed-graph.json` (via `observe.ToGraph`). Owner: parser (`decompose`) + sampler.

### Integration-suite harness gaps

The case set in `test/integration/sampler/` is implemented; two harness ergonomics remain open:

- **Running-preference path unexercised:** the harness awaits each `run.Get`, so all sampled executions are closed and `selectCandidates`' running-first branch never runs. Needs a non-blocking start (a long-running workflow the case doesn't await).
- **Opaque expansion step:** a case can't assert *which* sample step (10/50/100%) satisfied it, only the final union. Exposing the satisfying step would let coverage cases assert "resolved only at full sample."

---

## Deferred: product surfaces

### VS Code / Cursor entry point

Shipped (dist repo): "Visualize All Workflows in Folder" detects a sampler `observed-graph.json` under the folder, projects it to a `ParserGraph`, and renders it in history mode. Still open: a first-class "run the sampler from the extension" command (today the user runs the sampler binary, then opens the output folder).

### Observed-vs-designed overlay

Because the importer emits the same node-ID scheme as `graph.Extract`, a future mode could **diff** a history-derived graph against a `.twf`-derived one — surfacing drift between design and production: orphaned designs (defined but never observed), undocumented task queues, unexpected calls. This is the long-term payoff of the "first-class graph output" decision.

---

## Validation & rollout (planned next)

Dogfood against a real namespace: run the sampler to produce `observed-graph.json`, project it (`observe.ToGraph`), and diff it against a hand-written `.twf` for a system we own. Expect the history graph to be a subset of the design graph; investigate any node/edge present in one but not the other. Validates the event→graph mapping end to end and seeds the observed-vs-designed overlay.

Step-by-step instructions: [VALIDATION_RUNBOOK.md](./VALIDATION_RUNBOOK.md).

(The two former cross-cutting questions — diagnostics kind and Visibility enumeration — are resolved; see GRAPH_FROM_HISTORY.md § "Resolved decisions".)
