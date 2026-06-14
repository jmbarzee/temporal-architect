# Graph From Workflow History

Reverse-engineer a deployment graph — the same node/edge structure `twf graph` produces — from Temporal **workflow-history JSON** pulled off a live server, and render it in the visualizer's Graph tab. No `.twf`, no AST, no control-flow recovery.

**Status: v1 shipped (Pre + Stages 1–4).** This document is now the design-of-record and use-case reference. Remaining work lives in the [reverse-history backlog](./BACKLOG.md).

---

## 1. Context & Goal

The toolchain's primary path is **forward**: author `.twf` → parse → resolve → `graph.Extract` → `twf graph --json` → visualizer. The deployment graph (namespaces, workers, workflows, activities, nexus) is a deterministic projection of a resolved AST.

This feature adds the **reverse** path: given workflow histories from a running namespace, deterministically produce the *same* graph JSON contract — nodes and edges only — so the existing Graph tab can render a system that already exists in production, without anyone writing a `.twf` for it.

It also elevates `twf graph` output to a **first-class artifact** on par with the AST: independently producible (from `.twf` *or* from history), persistable, and a primary visualizer input in its own right. Once a graph can originate from something other than a `.twf`, the graph payload stands on its own — the long-term payoff being an observed-vs-designed overlay.

**Non-goals:** no `.twf` generation, no AST, no control-flow recovery (`if`/`for`/`await`/parallelism), no Tree view for history input, and no semantic-fidelity claims — the graph reflects *what ran in the sampled executions*, not the full static design.

---

## 2. Conceptual model (the durable contract)

This is the model the importer mimics and the basis for the deferred nexus/signal work.

**Node identity is deployment-keyed, not caller-keyed** — a node is `(definition × worker × namespace)`. Composite IDs:

```
namespace:<ns>
worker:<w>/namespace:<ns>
workflow:<wf>/worker:<w>/namespace:<ns>
activity:<a>/worker:<w>/namespace:<ns>
nexusEndpoint:<e>/namespace:<ns>
nexusService:<s>/worker:<w>/namespace:<ns>
nexusOperation:<svc>.<op>/worker:<w>/namespace:<ns>
```

Consequences: the same definition on **two task queues** becomes **two nodes** (two synthesized workers, under the 1-worker-per-queue model); the same definition called by **several workflows on one queue** stays **one node** accumulating deduped incoming dispatch edges (the caller never splits a node). Edges: `containment` (child→parent) plus dispatch (`activityCall` / `workflowCall` / `nexusCall` / `asyncBacking` / `signalSend`).

**Event → graph mapping** (workflow histories are acquired as `temporal workflow show -o json`; the root workflow type/queue comes from `WORKFLOW_EXECUTION_STARTED`, and every `*_SCHEDULED`/`*_INITIATED` event in that history is an edge from that root):

| Event type | Yields | Edge | Status |
|---|---|---|---|
| `WORKFLOW_EXECUTION_STARTED` | root workflow type, task queue, namespace | (root node) | shipped |
| `ACTIVITY_TASK_SCHEDULED` | activity type, task queue | `activityCall` | shipped |
| `START_CHILD_WORKFLOW_EXECUTION_INITIATED` | child workflow type, queue, namespace | `workflowCall` | shipped |
| `SIGNAL_EXTERNAL_WORKFLOW_EXECUTION_INITIATED` | target workflow ID (no type) | `signalSend` | shipped (target resolution deferred) |
| `MARKER_RECORDED` ("LocalActivity") | activity type | `activityCall` | deferred — backlog |
| `NEXUS_OPERATION_SCHEDULED` | endpoint, service, operation | `nexusCall` | deferred — backlog |

---

## 3. What shipped (v1)

Each stage is complete; the code is the source of truth. Summaries + locations:

- **Pre — graph-model normalization.** Made `containment` edges the single source of truth for worker/namespace membership: dropped the redundant `worker`/`namespace` fields from worker/workflow/activity nodes and added `signalSend` to the edge-kind enum. Touches `tools/lsp/parser/graph/`, `tools/lsp/cmd/twf/twf.schema.json`, and the visualizer graph types/build.
- **Stage 1 — `parser/history` package.** `history.Build([]History, Context) *graph.Graph` deterministically folds histories into the existing graph contract, reusing shared (exported) ID constructors so importer and `Extract` cannot drift. Lives in `tools/lsp/parser/history/`.
- **Stage 2 — `twf graph --history <dir>`.** The existing `graph` command takes a sampler-output root (`<ns>/<type>/<id>.json`) as an alternate input, emits one graph spanning all namespaces under the root in the standard envelope, and is mutually exclusive with positional `.twf` paths. In `tools/lsp/cmd/twf/graph.go`.
- **Stage 3 — visualizer Graph-only mode.** `App.tsx` accepts a graph-only `{ graph }` envelope (empty AST); `WorkflowCanvas` hides the Tree tab and defaults to Graph when `definitions` is empty. History-derived diagnostics surface in the diagnostics panel.
- **Stage 4 — `tools/sampler/` binary.** Standalone binary (own module, in `go.work`): per namespace it enumerates workflow types, percentage-samples executions (preferring running ones, with a per-type minimum), and writes `protojson` histories into the `--history` folder layout. Covered by the integration suite under `test/integration/sampler/`.

**Since v1 (post-ship enhancements):**

- **Nexus forward-normalization.** The endpoint↔operation composition is now a dedicated `nexusRoute` graph edge emitted upstream by `tools/lsp/parser/graph/` (matched on `(namespace, queue)`) and consumed by the visualizer; `namespace` was dropped from `nexusEndpoint`/`nexusOperation` nodes (`queue`/`worker` retained as display-only). Records: `internal/changes/parser/CHANGES_004.md`, `internal/changes/visualizer/CHANGES_003.md`. (This is the forward-graph half; *history* nexus decoding remains deferred — see backlog.)
- **Sampler time-window / status filters.** `--since` / `--until` (a `StartTime` window; RFC3339 or duration) and `--status` (`ExecutionStatus`), threaded consistently through enumeration and candidate selection in `tools/sampler/`.

---

## 4. Limitations (inherent to history input)

- **Partial by construction.** A history shows only what *that run* did; coverage depends on sampling breadth. Branches never taken in the sample are invisible.
- **No worker identity.** History exposes task queues, not a logical worker name; we synthesize one worker per `(namespace, taskQueue)`. Two distinct type-sets polling one queue (rare) collapse into one synthesized worker.
- **Signal targets are IDs, not types.** Resolvable only if the target run is in the sample.
- **Local activities** are markers, not scheduled-activity events (decoding deferred).
- **No control flow / ordering.** Edges mean "this called that at least once," not sequence, parallelism, or conditionality.

---

## 5. Resolved decisions

- **History diagnostics kind:** reuse the envelope's `graph` diagnostic kind; the `code` (e.g. `SIGNAL_TARGET_NOT_SAMPLED`) disambiguates import-time problems. No dedicated `history` kind.
- **Visibility type-enumeration:** ship both — try `CountWorkflowExecutions GROUP BY WorkflowType` first, fall back to a paginated `ListWorkflow` scan when the server doesn't support the grouping. Implemented in `tools/sampler/sampling`.
- **Nexus endpoint↔operation edge kind:** a dedicated `nexusRoute` kind (mapped to the view's `containment` edge type for now, leaving room for distinct styling later) rather than overloading `containment`.

---

## 6. Open / next

- **Validation & rollout** *(the planned next step)* — dogfood against a real namespace and diff the history-derived graph against a hand-written `.twf` for a system we own, to validate the event→graph mapping. Tracked in the [backlog](./BACKLOG.md).
- All other deferred work — nexus reverse-engineering, signal-target resolution, local-activity decoding, sampler ergonomics, and product surfaces — lives in the [reverse-history backlog](./BACKLOG.md).
