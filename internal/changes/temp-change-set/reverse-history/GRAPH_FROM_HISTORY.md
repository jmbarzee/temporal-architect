# Graph From Workflow History

Reverse-engineer a deployment graph — the same node/edge structure `twf graph` produces — from Temporal **workflow-history JSON** pulled off a live server, and render it in the visualizer's Graph tab. No `.twf`, no AST, no control-flow recovery.

This is a **design document**. It defines the work and stages it; it is not itself the implementation. Each stage below is meant to ship independently.

```
┌─────────────┐   ┌──────────────────┐   ┌─────────────────┐
│  Acquire    │   │  Build graph     │   │  Visualize      │
│  sampler →  │ → │  parser/history  │ → │  Graph tab only │
│  JSON files │   │  → graph.Graph   │   │  (no Tree)      │
└─────────────┘   └──────────────────┘   └─────────────────┘
```

---

## 1. Context & Goal

The toolchain today is **forward**: author `.twf` → parse → resolve → `graph.Extract` → `twf graph --json` → visualizer. The deployment graph (namespaces, workers, workflows, activities, nexus) is a deterministic projection of a resolved AST.

This feature adds a **reverse** path. Given workflow histories pulled from a running Temporal namespace, deterministically produce the *same* graph JSON contract — nodes and edges only — so the existing Graph tab can render a system that already exists in production, without anyone writing a `.twf` for it.

### Goals

- Deterministically fold a set of workflow histories into a `graph.Graph` (the existing wire contract).
- Reuse the existing visualizer Graph tab unchanged in spirit (it already renders from `ParserGraph` alone).
- Start with **workflow types, activity types, and task queues** (plus namespaces, which come for free from the same events). Nexus is deferred to the `reverse-history` workstream backlog.
- Provide a lightweight way to acquire a representative sample of histories from a namespace.
- **Elevate `twf graph` output to a first-class artifact**, on par with the AST that `twf parse` emits: independently producible (from `.twf` *or* from history), persistable, and a primary visualizer input in its own right — not a secondary enrichment of the AST. This feature is the forcing function: once a graph can originate from something other than a `.twf`, the graph payload has to stand on its own.

### Non-goals

- **No `.twf` generation.** We do not reconstruct DSL source.
- **No AST.** Recovering control flow (`if`/`for`/`await`/parallelism) from a flat event log is infeasible and out of scope.
- **No Tree view.** Only the Graph tab is meaningful for history-derived input; the Tree tab is hidden in this mode.
- **No semantic fidelity claims.** The graph reflects *what ran in the sampled executions*, not the full static design.

---

## 2. Background

### 2.1 Current graph pipeline (what we reuse)

- `graph.Extract(file *ast.File) *graph.Graph` lives in [tools/lsp/parser/graph/graph.go](tools/lsp/parser/graph/graph.go). It needs a **resolved** AST but **not** the validator.
- `graph.Graph` is plain Go structs (`Node`, `Edge`, `CoarsenedEdge`, `Unresolved`, `Diagnostic`, `Summary`). It can be constructed directly, without an AST — the importer will do exactly this.
- The `twf graph --json` command ([tools/lsp/cmd/twf/graph.go](tools/lsp/cmd/twf/graph.go)) wraps the graph in the standard envelope (`summary` / `diagnostics` / `graph`) defined by [tools/lsp/cmd/twf/twf.schema.json](tools/lsp/cmd/twf/twf.schema.json).
- The visualizer's [tools/visualizer/src/graph/build.ts](tools/visualizer/src/graph/build.ts) translates `ParserGraph` → view model. It already derives each node's `parentId` purely from `containment` edges; the Graph tab does **not** require the AST for structure (only for `sourceFile` enrichment).

### 2.2 Node identity scheme (what the importer must mimic)

Nodes are one-per-deployment with composite IDs:

```
namespace:<ns>
worker:<w>/namespace:<ns>
workflow:<wf>/worker:<w>/namespace:<ns>
activity:<a>/worker:<w>/namespace:<ns>
nexusEndpoint:<e>/namespace:<ns>
nexusService:<s>/worker:<w>/namespace:<ns>
nexusOperation:<svc>.<op>/worker:<w>/namespace:<ns>
```

Edges: `containment` (child→parent) plus dispatch (`activityCall` / `workflowCall` / `nexusCall` / `asyncBacking` / `signalSend`).

**Node identity is deployment-keyed, not caller-keyed.** A node is `(definition × worker × namespace)` — the calling workflow plays no part in node identity. Consequences for the importer:

- A workflow or activity observed on **two different task queues** becomes **two nodes** (because, under the 1-worker-per-queue model, two queues mean two synthesized workers). This is exactly the existing parser behavior, where two worker deployments of the same definition are two nodes.
- A workflow or activity called by **several different workflows** on the **same** task queue stays **one node**, accumulating multiple incoming dispatch edges (deduped). The caller never splits a node.

### 2.3 Workflow history JSON (the new input)

Acquired via `temporal workflow show -w <id> -o json` (or the Web UI download). Shape:

```json
{ "events": [
  { "eventId": "1", "eventType": "EVENT_TYPE_WORKFLOW_EXECUTION_STARTED",
    "workflowExecutionStartedEventAttributes": {
      "workflowType": { "name": "OrderWorkflow" },
      "taskQueue": { "name": "orders", "kind": "TASK_QUEUE_KIND_NORMAL" } } },
  { "eventId": "5", "eventType": "EVENT_TYPE_ACTIVITY_TASK_SCHEDULED",
    "activityTaskScheduledEventAttributes": {
      "activityType": { "name": "ChargePayment" },
      "taskQueue": { "name": "orders" } } }
] }
```

Every event has `eventId`, `eventTime`, `eventType`, and one `<camelCaseType>EventAttributes` object.

### 2.4 Event → graph mapping (verified against the API reference)

| Event type | Attributes block | Yields | Edge |
|---|---|---|---|
| `WORKFLOW_EXECUTION_STARTED` | `workflowExecutionStartedEventAttributes` | root `workflowType.name`, `taskQueue.name`; namespace from context | (root node) |
| `ACTIVITY_TASK_SCHEDULED` | `activityTaskScheduledEventAttributes` | `activityType.name`, `taskQueue.name` | `activityCall` (root workflow → activity) |
| `START_CHILD_WORKFLOW_EXECUTION_INITIATED` | `startChildWorkflowExecutionInitiatedEventAttributes` | child `workflowType.name`, `taskQueue.name`, `namespace`, `workflowId` | `workflowCall` |
| `CHILD_WORKFLOW_EXECUTION_STARTED` | `childWorkflowExecutionStartedEventAttributes` | confirms child `workflowType`, `namespace`, `workflowExecution` | (confirmation) |
| `NEXUS_OPERATION_SCHEDULED` | `nexusOperationScheduledEventAttributes` | `endpoint`, `service`, `operation`, `endpointId` | `nexusCall` — **deferred (§8)** |
| `SIGNAL_EXTERNAL_WORKFLOW_EXECUTION_INITIATED` | `signalExternalWorkflowExecutionInitiatedEventAttributes` | target `workflowExecution.workflowId` (no type) | `signalSend` (see limitations) |

The nexus row is captured for completeness but is **out of scope for v1** — the entire nexus side of reverse-engineering (and the related forward-graph normalization in §3) is deferred to the `reverse-history` workstream backlog (§8).

The **root** workflow type/queue for a history comes from `WORKFLOW_EXECUTION_STARTED`; every `*_SCHEDULED` / `*_INITIATED` event in that same history is an edge *from that root workflow*.

---

## 3. Pre — prerequisite: normalize the graph model

This ships **before** the feature and stands on its own (it also cleans up the existing `.twf` graph). The principle: **containment edges are the single source of truth for worker/namespace membership.** Today each deployment node *also* carries denormalized `worker` / `namespace` / `queue` fields that duplicate what the `containment` edges already express. The history importer should build membership by emitting edges, not by stuffing every node with redundant context — so we remove the redundancy first.

### 3.1 What changes

**Scope note — nexus is left untouched here.** To dodge the nexus-routing-edge question entirely, the Pre stage normalizes only the **worker / workflow / activity** tiers. **Nexus nodes (`nexusEndpoint`, `nexusOperation`) keep their `namespace` + `queue` fields exactly as today**, so the visualizer's existing local endpoint↔operation derivation ([build.ts](tools/visualizer/src/graph/build.ts) lines 171-197) keeps working with zero change. Normalizing the nexus tier (and moving that edge upstream) is tracked in the `reverse-history` workstream backlog (§8).

**Go — [tools/lsp/parser/graph/](tools/lsp/parser/graph/):**

1. `Node` struct ([graph.go](tools/lsp/parser/graph/graph.go)): on **workflow / activity** hosted nodes drop `Worker` and `Namespace`; on **worker** nodes drop `Namespace` but keep `Queue` (intrinsic, no edge equivalent). Leave `nexusEndpoint` / `nexusOperation` nodes as-is. Stop populating the dropped fields in [nodes.go](tools/lsp/parser/graph/nodes.go).
2. `emitCoarsenedEdges` / `buildParentIndex` ([coarsen.go](tools/lsp/parser/graph/coarsen.go)): currently reads `n.Worker` / `n.Namespace`. Rewrite to derive the worker-tier and namespace-tier parents from the already-emitted `containment` edges (follow hosted→worker→namespace). The comment already anticipates this.
3. [twf.schema.json](tools/lsp/cmd/twf/twf.schema.json): update `GraphNode` to reflect the per-node-type field changes, and fix the existing **schema drift** by adding `signalSend` to the edge `kind` enum.

**Visualizer — [tools/visualizer/src/](tools/visualizer/src/):**

4. [types/parser-graph.ts](tools/visualizer/src/types/parser-graph.ts): mirror the field removals; add `signalSend` to `ParserEdgeKind`.
5. [graph/build.ts](tools/visualizer/src/graph/build.ts): stop reading `pn.worker/namespace` on workflow/activity nodes (the nexus endpoint↔operation derivation stays untouched).
6. [graph/model.ts](tools/visualizer/src/graph/model.ts) + [components/GraphView.tsx](tools/visualizer/src/components/GraphView.tsx): the hover `contextLine` (GraphView lines ~1365-1371) reads `node.worker/namespace/queue`. Re-derive worker/namespace for workflow/activity nodes from the `parentId` chain (workflow → parent worker node, which still carries `queue` → grandparent namespace node). The nexus-highlight (lines ~595-599) is unchanged.

### 3.2 Contract impact

This is a breaking change to the `twf graph` JSON contract (parser → visualizer edge). Existing `.twf` graph output changes shape (fewer node fields, one new edge), so visualizer and schema land in the same release. Tracking and idea-capture for the whole effort lives in the dedicated `reverse-history` workstream backlog (§8) — **not** the per-component backlogs — so it doesn't get lost behind slower component workstreams. Active cycle work (the actual `REVISIONS`/`CHANGES` files, when a stage runs) still lives with the component it edits, but is initiated from and linked back to the `reverse-history` workstream.

### 3.3 Why before the feature

The importer constructs nodes/edges by hand. If the model still required per-node `worker`/`namespace`/`queue`, the importer would have to replicate that denormalization perfectly to stay byte-compatible with `Extract`. Normalizing first means the importer only has to get **nodes + containment edges** right, and everything downstream (coarsening, parent derivation, tooltips) falls out of the edges.

---

## 4. Implement — staged

Each stage is independently shippable and testable. Stages 1-3 are sequential; Stage 4 (sampler) is independent once the folder contract (Stage 2) is fixed.

### Stage 1 — `parser/history` package (history → `graph.Graph`)

New package `tools/lsp/parser/history/`. Pure function, no I/O beyond reading provided bytes:

```
func Build(histories []History, ctx Context) *graph.Graph
```

- `History` is a minimally-typed view of the event log — only the graph-relevant attribute blocks are decoded (`workflowExecutionStarted`, `activityTaskScheduled`, `startChildWorkflowExecutionInitiated`, `signalExternalWorkflowExecutionInitiated`). Nexus events are **not** decoded in v1 (deferred — §8). Unknown events are ignored.
- `Context` carries the namespace (histories don't always self-identify it) and options.
- Reuse the graph package's ID constructors (`namespaceID`, `workerID`, `hostedID`, `defKey`). These are currently unexported — **export them** or add a small shared `graph.Builder` so the importer and `Extract` cannot drift. This shared-identity guarantee is the crux of "produces the same graph."

**Algorithm (deterministic fold):**

1. **Pass 1 (index):** scan all histories; build `workflowId → workflowType` (for signal-target resolution) and collect `(namespace, taskQueue)` and `(namespace, workflowType|activityType, taskQueue)` tuples.
2. **Synthesize workers:** one worker per `(namespace, taskQueue)`, named after the queue (the **1-worker-per-queue assumption** — true ~95% of the time). Emit the namespace node, the worker node (carrying `queue`), and the worker→namespace `containment` edge.
3. **Hosted nodes:** for each workflow / activity / nexus operation observed on a queue, emit the hosted node + `containment` edge to its synthesized worker.
4. **Dispatch edges:** from each history's root workflow, emit `activityCall` / `workflowCall` / `signalSend` edges to the observed callees. Dedupe across runs (same edge from many sampled executions collapses to one). (`nexusCall` deferred — §8.)
5. **Finalize:** call the existing coarsening + `finalize()` so summary, sort order, and wire shape are byte-identical to `Extract` output.

**Determinism:** identical input files (regardless of order) must produce byte-identical JSON. The existing `finalize()` sort guarantees this once we sort the input set.

**Tests (three-layer mindset):** checked-in fixture histories under `testdata/` (a root workflow with activities; a parent+child pair across queues; a nexus caller). Golden-file assertions on the emitted `graph.Graph`. Unit tests for the event decoder and the worker-synthesis rule.

**Acceptance:** given the fixtures, `history.Build` emits a graph whose nodes/edges match a hand-written golden JSON, and re-running on shuffled input is byte-identical.

### Stage 2 — `twf graph --history <dir>` input flag

Extend the existing `graph` command ([tools/lsp/cmd/twf/graph.go](tools/lsp/cmd/twf/graph.go)) with an alternate input source rather than adding a new subcommand. The default path stays `.twf` files → `Extract`; the flag switches to the history importer.

- `twf graph --history <root-dir> [--json]`. `<root-dir>` is the **multi-namespace root** that contains the sampler's `./<namespace>/<workflowType>/<id>.json` layout. The namespace for each history is taken from its first path segment under the root.
- One invocation emits **one graph spanning all namespaces** found under the root, so cross-namespace child-workflow edges draw correctly.
- `--history` and positional `.twf` paths are mutually exclusive (error if both given).
- Reuse `printGraphJSON` so output is the **same envelope** as a normal `twf graph`. `definitions` is empty (no AST). History-stage problems (e.g. unresolved signal target) surface as envelope `diagnostics`.

**Acceptance:** `twf graph --history testdata/sample/ --json` emits a valid envelope that passes `twf.schema.json`, the embedded graph matches Stage 1's golden output, and a graph spanning two namespaces shows the cross-namespace `workflowCall` edge.

### Stage 3 — visualizer partial input (Graph-only mode)

The Graph tab already renders from `ParserGraph` alone; the blockers are the mandatory `ast` gate and the always-on Tree tab.

- [App.tsx](tools/visualizer/src/App.tsx) and [webview.tsx](tools/visualizer/src/webview.tsx): both hard-return when `!ast`. Make `ast` optional / accept `{ definitions: [] }`.
- [components/WorkflowCanvas.tsx](tools/visualizer/src/components/WorkflowCanvas.tsx): when `definitions` is empty (history mode), hide/disable the **Tree** tab and default to **Graph**.
- Surface `parserGraph.diagnostics` and `parserGraph.unresolved` (currently typed but unused in the UI) so history-derived warnings (e.g. signal target not in sample) are visible.
- Entry path: simplest is feeding the `twf graph --history` envelope as the wrapped `{ ast, parserGraph }` payload the webview already expects. A dedicated "Visualize from history JSON" command is deferred (Post).

**Acceptance:** loading a history-derived envelope (empty `definitions`, populated `graph`) renders the deployment graph; the Tree tab is hidden; no console errors; diagnostics panel shows history warnings.

### Stage 4 — `sampler` standalone binary

A separate Go binary (own `go.mod`, added to `go.work`) at **`tools/sampler/`**. Independent of the parser; its only contract is the output folder layout. Connects via `go.temporal.io/sdk/client` with flags mirroring the `temporal` CLI: `--address`, `--namespace`, `--tls-cert-path`, `--tls-key-path`.

**One command, one namespace, two internal phases.** A single invocation targets a single namespace and runs both phases end to end (no separate commands):

**Phase A — enumerate workflow types (Visibility API).** Discover the distinct workflow types present in the namespace via the Visibility subsystem rather than downloading every execution. Options (pick during implementation): `CountWorkflowExecutions` with a `GROUP BY WorkflowType` clause where the server supports it, otherwise a paginated `ListWorkflow` that aggregates the distinct `Execution.Type.Name` values. This phase also yields per-type counts, which Phase B needs for percentage sampling.

**Phase B — sample histories per type.** For each discovered type, select a **configurable percentage** of its executions (`--sample-percent`, default e.g. 10%) with a **configurable minimum** (`--min-per-type`, default e.g. 5) so low-volume types still get representative coverage. **Prefer running workflows** (query `ExecutionStatus = 'Running'` first, top up from recently-closed if a type lacks enough running executions). For each selected execution, `client.GetWorkflowHistory(ctx, wfID, runID, false, HISTORY_EVENT_FILTER_TYPE_ALL_EVENT)`, collect events, and serialize with **`protojson`** on the assembled `history.History` proto so the output matches `temporal workflow show -o json` (plain `json.Marshal` of SDK events does **not** match).

**Output is one folder.** Write each history to `<out>/<namespace>/<workflowType>/<workflowId>.json` under a single configurable output dir (`--out`, default `./`). Running the sampler per namespace into the same `--out` builds up the multi-namespace tree that `twf graph --history <out>` consumes directly.

**Acceptance:** against a namespace with a few running workflow types, one `sampler` invocation lists the types and writes `>= min-per-type` (or all, if fewer) histories per type preferring running ones into one output folder, and `twf graph --history <out>` on that folder yields a non-trivial graph.

### Stage dependency

```
Stage 0 (Pre) ──► Stage 1 ──► Stage 2 ──► Stage 3
                                  │
                                  └──► (folder contract) ──► Stage 4
```

---

## 5. Post

After v1 ships (Pre + Stages 1–4 covering workflows / activities / task queues), the follow-on work is tracked in full in the [reverse-history backlog](internal/changes/reverse-history/BACKLOG.md). In brief:

- **Nexus reverse-engineering** + the deferred forward-graph nexus normalization.
- **Signal-target resolution** and **local-activity** decoding for higher history fidelity.
- **Sampler ergonomics:** transitive sampling, filters, concurrency, Cloud auth.
- **Product surfaces:** a VS Code "Visualize from workflow history" command, and the **observed-vs-designed overlay** (diff a history-derived graph against a `.twf`-derived one — the long-term payoff of first-class graph output).
- **Rollout/validation:** dogfood against a real namespace; compare the history graph to a hand-written `.twf` for a system we own to validate the mapping.

---

## 6. Limitations (inherent to history input)

- **Partial by construction.** A single history shows only what *that run* did. Coverage depends on sampling breadth (hence Stage 4). Conditional branches never taken in the sample are invisible.
- **No worker identity.** History exposes task queues and `identity` strings / `workerVersion.buildId`, but not a logical "worker" name. We synthesize one worker per `(namespace, taskQueue)`. If two distinct worker type-sets poll the same queue (rare), they collapse into one synthesized worker.
- **Signal targets are IDs, not types.** Resolvable only if the target run is in the sample.
- **Local activities** are markers, not scheduled-activity events (deferred).
- **No control flow / ordering semantics.** Edges are "this called that at least once," not sequence, parallelism, or conditionality.

---

## 7. Open Questions / Decisions

Decisions made (per discussion):
- **Node model:** synthesize one worker per task queue (1-worker-per-queue assumption); keep one-node-per-deployment. Node identity is deployment-keyed, not caller-keyed (different task queues split nodes; different callers do not). *(decided)*
- **Namespace:** taken from folder/path context, plus explicit `namespace` on child events. *(decided)*
- **Prereq:** drop redundant `worker`/`namespace` fields on worker/workflow/activity nodes; edges are the source of truth. Nexus nodes untouched. *(decided)*
- **First-class graph output:** treat `twf graph` output as a first-class artifact paralleling the AST/`twf parse` output (independently producible, persistable, a primary visualizer input). *(decided)*
- **Importer home:** a `--history <dir>` input flag on the existing `twf graph` command, accepting the multi-namespace root folder. *(decided)*
- **Multi-namespace:** one graph spanning all namespaces under the root. *(decided)*
- **Nexus:** the entire nexus side (forward-graph normalization *and* reverse-engineering) is deferred to the `reverse-history` workstream backlog (§8). *(decided)*
- **Sampler:** `tools/sampler/` — one command per namespace, two internal phases (enumerate types via the Visibility API, then sample a configurable percentage with a configurable minimum per type, preferring running workflows). Writes one output folder `<out>/<namespace>/<workflowType>/`. *(decided)*
- **Workstream tracking:** a dedicated `reverse-history` backlog ([internal/changes/reverse-history/BACKLOG.md](internal/changes/reverse-history/BACKLOG.md)) owns all deferred/idea work for this effort, kept out of the per-component backlogs. *(decided)*

Still open (minor; resolve while writing Stage specs):

1. **History diagnostics kind:** reuse the envelope's `graph` diagnostic kind, or add a `history` kind to distinguish import-time problems?
2. **Visibility type-enumeration mechanism:** confirm whether the target server versions support `CountWorkflowExecutions GROUP BY WorkflowType`, else fall back to paginated `ListWorkflow` aggregation (sampler Phase A).

---

## 8. `reverse-history` workstream backlog

Deferred work and ideas for this effort are tracked in a dedicated workstream backlog so they don't get lost behind slower component workstreams: [internal/changes/reverse-history/BACKLOG.md](internal/changes/reverse-history/BACKLOG.md).

Headline deferred items (nexus reverse-engineering, forward-graph nexus normalization, local activities, signal-target resolution, observed-vs-designed overlay, sampler ergonomics) live there in full. This document remains the design/architecture hub; the backlog is the durable task list.
