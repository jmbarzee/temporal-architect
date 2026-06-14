# reverse-history Workstream Backlog

Dedicated backlog for the **reverse-history** effort: reverse-engineering a deployment graph from Temporal workflow-history JSON. Kept separate from the per-component backlogs (`parser`, `visualizer`, `dsl`, …) so this project's deferred work isn't lost behind slower component workstreams.

Design/architecture hub: [GRAPH_FROM_HISTORY.md](./GRAPH_FROM_HISTORY.md) — the design-of-record and use-case reference (v1 shipped). This file owns only the genuinely-open work. When an item runs, its active cycle work (`REVISIONS`/`CHANGES`) lives with the component it edits (e.g. `internal/changes/parser/`), initiated from and linked back to this workstream.

---

## Deferred: Nexus history decoding

The forward-graph nexus half shipped (see GRAPH_FROM_HISTORY.md § "Since v1"). What remains is the *history* side:

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

`tools/sampler/` v1 is one command per namespace, two internal phases (enumerate types via Visibility, then percentage-sample preferring running workflows). Time-window / status filters shipped (GRAPH_FROM_HISTORY.md § "Since v1"). Still open:

- **Transitive sampling:** auto-fetch child-workflow and nexus-target histories so the graph is complete without separate runs per type.
- Concurrency and rate limiting against the server.
- Temporal Cloud auth via environment variables (parallel to the `temporal` CLI's env handling).
- **Continue-as-new run boundaries:** the `<ns>/<wfType>/<id>.json` layout is keyed by WorkflowID, so chained CAN runs (same WorkflowID, new RunID) collide/overwrite, and `history.Build` reads only the first run — activities in later runs are invisible. Needs a layout/decoding fix.

### Integration-suite harness gaps

The case set in `test/integration/sampler/` is implemented; two harness ergonomics remain open:

- **Running-preference path unexercised:** the harness awaits each `run.Get`, so all sampled executions are closed and `selectCandidates`' running-first branch never runs. Needs a non-blocking start (a long-running workflow the case doesn't await).
- **Opaque expansion step:** a case can't assert *which* sample step (10/50/100%) satisfied it, only the final union. Exposing the satisfying step would let coverage cases assert "resolved only at full sample."

---

## Deferred: product surfaces

### VS Code / Cursor entry point

A "Visualize from workflow history" command that runs the sampler (or accepts a JSON file/folder) and feeds the `twf graph --history` envelope to the webview.

### Observed-vs-designed overlay

Because the importer emits the same node-ID scheme as `graph.Extract`, a future mode could **diff** a history-derived graph against a `.twf`-derived one — surfacing drift between design and production: orphaned designs (defined but never observed), undocumented task queues, unexpected calls. This is the long-term payoff of the "first-class graph output" decision.

---

## Validation & rollout (planned next)

Dogfood against a real namespace: run the sampler, build the graph with `twf graph --history`, and diff it against a hand-written `.twf` for a system we own. Expect the history graph to be a subset of the design graph; investigate any node/edge present in one but not the other. Validates the event→graph mapping end to end and seeds the observed-vs-designed overlay.

(The two former cross-cutting questions — diagnostics kind and Visibility enumeration — are resolved; see GRAPH_FROM_HISTORY.md § "Resolved decisions".)
