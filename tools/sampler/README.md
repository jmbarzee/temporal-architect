# sampler

Pulls a representative sample of workflow histories from a live Temporal
namespace, extracts the meaningful events in memory, and writes a single
**observed-graph** JSON — the deployment-graph shape (see
[`tools/lsp/parser/observe`](../lsp/parser/observe)) plus a per-edge occurrence
time series. The visualizer reads this file directly; there is no intermediate
on-disk history tree.

```
<out>/observed-graph.json      # { "observedGraph": { window, summary, nodes, edges, … } }
```

Each edge carries a `buckets` array (its occurrence time series over the
`window`); with the default single bucket it is just a total. The graph reuses
the same node-ID scheme and coarsening as `twf graph`, so the projected graph is
byte-compatible with a `.twf`-derived one.

## How it works

One invocation targets one namespace and runs three phases:

1. **Phase A — enumerate.** A Visibility scan aggregates every observed
   execution into a map keyed by workflow type, recording each execution's id,
   run id, and running/closed status. It tries `CountWorkflowExecutions GROUP BY
   WorkflowType` first and falls back to a paginated `ListWorkflow` scan when
   the server does not support the grouping.
2. **Phase B — sample.** For each type it selects
   `max(min-per-type, ceil(sample-percent% × count))` executions (capped at the
   count), preferring **running** workflows and topping up with closed ones,
   and downloads each selected execution's full history, plus that of every run
   chained to it by continue-as-new. A transitive pass then fetches the runs
   those histories name, so a child or Nexus handler needs no sampling of its
   own type: a child from its `CHILD_WORKFLOW_EXECUTION_STARTED` event, a handler
   from the workflow link on its operation's `NEXUS_OPERATION_STARTED` event (the
   operation token is opaque and not read). Each run comes whole with its
   continue-as-new chain, in the namespace the event or link names, and the
   runs it fetches are scanned in turn, so grandchildren follow. A run is
   fetched once, which ends a cycle, and there is no depth limit. What bounds the
   pass is `--transitive-per-type`: a child workflow type, or a Nexus operation,
   already holding that many executions, sampled or fetched, is not fetched
   further. The pass is a consequence of the sample, not part of it: it runs after
   direct selection and leaves it unchanged, and ignores `--since`, `--until` and
   `--status`. A run it cannot read (past retention, in a namespace the
   sampler cannot see, or denied) is skipped and reported below.
3. **Phase C — build.** The histories are folded in memory into an
   observed graph: meaningful dispatch events (`ACTIVITY_TASK_SCHEDULED`,
   `MARKER_RECORDED` of a local activity, `START_CHILD_WORKFLOW_EXECUTION_INITIATED`,
   `SIGNAL_EXTERNAL_WORKFLOW_EXECUTION_INITIATED`, `NEXUS_OPERATION_SCHEDULED`)
   become edges, each occurrence bucketed by its event time. The result is
   written as one JSON file.

Problems and notes found during the fold reuse the envelope's `graph`
diagnostic kind — there is no separate `history` kind; the `code` disambiguates:

| Code | When |
|---|---|
| `SIGNAL_TARGET_NOT_SAMPLED` | none of a signal's target workflow's runs was in the sample, and its ID fits no `id_scheme:` of the `--design` (or there is none) |
| `SIGNAL_TARGET_AMBIGUOUS` | a signal's target ID fits the `id_scheme:` of several workflows the design hosts in its namespace; the message names them, and the signal stays unresolved |
| `LOCAL_ACTIVITY_TYPE_MISSING` | a `LocalActivity` marker records no activity type; the call is not drawn, and the code is reported once per calling workflow |
| `NEXUS_TARGET_UNREACHABLE` | a started Nexus operation links a handler run the sampler could not read; reported once per calling workflow and operation, `from` is the caller |
| `NEXUS_TARGET_UNLINKED` (hint) | a started Nexus operation links no workflow run (its handler is not a workflow, or the server attached no link), so its handler is not sampled; reported like the one above. A synchronous operation never starts and is silent |
| `CHILD_HISTORY_UNAVAILABLE` | a started child workflow's run could not be read; reported once per calling workflow and child type, `from` is the caller |
| `NEXUS_ENDPOINT_NOT_IN_DESIGN` | the `--design` declares no static endpoint of a scheduled operation's endpoint name; the message names it, `from` is its orphan endpoint node, and it is reported once per name |
| `FAMILY_AMBIGUOUS` | an observed namespace or task queue fits the template of several of the `--design`'s families; the message names them, and the node stays concrete |
| `FAMILY_MEMBERS` (hint) | a design family has observed members; the message counts and lists them, `from` is the family's node |

## Node identity

A node is a **deployment**, not a call site: identity is
`(definition × worker × namespace)` and never keyed by the caller. Composite
IDs:

```
namespace:<ns>
worker:<w>/namespace:<ns>
workflow:<wf>/worker:<w>/namespace:<ns>
activity:<a>/worker:<w>/namespace:<ns>
nexusEndpoint:<e>/namespace:<ns>
nexusService:<s>/worker:<w>/namespace:<ns>
nexusOperation:<svc>.<op>/worker:<w>/namespace:<ns>
```

Two consequences:

- The same definition on **two task queues** becomes **two nodes** — one per
  synthesized worker, under the 1-worker-per-queue model.
- The same definition called by **several workflows on one queue** stays **one
  node**, accumulating deduped incoming dispatch edges. The caller never splits
  a node.

Edges are `containment` (child → parent) plus dispatch (`activityCall`,
`workflowCall`, `nexusCall`, `asyncBacking`, `signalSend`).

### Packages and the design input

History names a definition only by its bare runtime type, and a package has no
runtime meaning, so the sampler cannot tell `orders.Process` from
`billing.Process` on its own. `--design` takes the `.twf` file or directory the
system was designed in, loaded as `twf check` loads it, and joins each sampled
definition to its package: a name one package declares takes that package, and
a name several declare takes the one a worker hosts on the sampled namespace
and task queue (one the family join attributes to a design family counts as the
family's). The package qualifies the name element of the ID as `graph.Extract`
does, so a packaged definition's observed ID equals its design node's (a worker's ID still carries
its queue, so the worker must be named for it). A name the design lacks, or one
it cannot tell apart, keeps its bare ID and is listed in `unresolved`. The
design's `packages` table, which maps a package ID to its declared name, rides
on the observed graph so a reader labels a packaged node as the design graph
does. Without `--design` every name stays bare, `packages` is absent, and the
output is unchanged. The join's index (definition → package → hosting namespace
and queue, and each workflow's `id_scheme`), with the design graph, is
`design.Design`.

With `--design`, a signal's target is also recovered by ID. A sampled run of
the target's workflow ID resolves it first. Failing that, the ID is matched with
the parser's own `id_scheme:` matcher against the workflows the design hosts in
the signal's target namespace, and a single match lands the `signalSend` edge on
that workflow's node, on the queue its worker listens on. An ID that fits several
schemes (the parser's `ID_SCHEME_OVERLAP` case) resolves to none and is reported
as `SIGNAL_TARGET_AMBIGUOUS` with the candidates; one that fits none stays
unresolved as `SIGNAL_TARGET_NOT_SAMPLED`. A workflow hosted only under a
templated namespace or queue never matches.

With `--design`, an observed namespace or task queue is likewise joined to its
design family. A concrete name (`fabric-shard-acme`, `sandbox-8f3a`) is matched
against the design's family templates with the parser's own matchers (the
`deploy_name` template for a namespace, `ast.ParseDeployQueue` for a worker's
queue, among the workers of the namespace it resolved to), and a single match
lands the observation on the family's node: all instances fold into it, it
carries the design's `templateParams`, and a worker family takes the design
worker's name, so the observed and design graphs agree and the
[diff](#diffing-against-a-design-graph) shows no drift for them. A name the
design declares literally is its own. One that fits several families resolves to
none, stays a concrete node and is reported as `FAMILY_AMBIGUOUS` with the
candidates, once per name; one that fits none stays a concrete node. Each family
with observed members also carries a `FAMILY_MEMBERS` hint counting and listing
them, so the node needs no field for it. After `observe.Merge`, each shard keeps
its own hint, not a combined count. A worker instantiated under two queue
families in one namespace is one design node that keeps its first queue, so only
that queue attributes.

### Nexus operations

History names a scheduled operation's endpoint, service and operation, never where
the endpoint points. With `--design`, the endpoint is joined by name to the
design's static endpoint, whose namespace and queue place the callee as any
other: the endpoint, service and operation take the design graph's IDs and
fields (the service's package from the [package join](#packages-and-the-design-input)),
with containment (endpoint to namespace, service to worker, operation to
service), a `nexusCall` edge from the caller to the operation carrying
`routing.nexusEndpoint`, and a `nexusRoute` edge from the operation to the
endpoint.

Without a design, or when it lacks the endpoint
(`NEXUS_ENDPOINT_NOT_IN_DESIGN`), the three are orphans
(`nexusEndpoint:<e>/orphan`, `nexusService:<s>/orphan`,
`nexusOperation:<s>.<op>/orphan`) with the same call and route edges, and no
namespace or worker guessed. Their operation is contained in its service, which
history names; `twf graph` gives an orphan no containment. An edge is identified
by `(from, to, kind)`, so one orphan operation serves every endpoint, and two
endpoints reaching one operation keep the first in `routing`.

An endpoint's `endpointId` is a registry key, not a join key, and is not read.

### `templateParams` is always empty on observed nodes

`graph.Node` carries a `templateParams` field for parameterized design families:
a namespace `fabric-shard-{org}` or a worker on queue `sandbox-{sandboxId}` is
one design node whose name has template parameters. From history alone the
sampler **never populates it**, and this is deliberate, not an unimplemented
feature. Observed node names come entirely from resolved runtime history
attributes (`h.Namespace`, `attr.GetNamespace()`, task-queue and type names), so
a sampled name is always a concrete instance (`fabric-shard-acme`,
`sandbox-8f3a`) with no template parameters. There is nothing to extract, so
`templateParams` is absent/empty (the field is `omitempty`), keeping such an
observed node **byte-identical** to a statically extracted `twf graph` node.
Only the `--design` [join](#packages-and-the-design-input) sets it, by landing
an instance on its family's design node.

The consequence is a representation gap: a design family is one node with
`templateParams`, while its observed counterpart is *one node per instance*
(`fabric-shard-acme`, `fabric-shard-globex`, …; `sandbox-8f3a`, `sandbox-c71d`,
…), each with no `templateParams`. Without `--design` a family never ID-matches
an observed instance, and [the diff](#diffing-against-a-design-graph) flags
every instance as drift. With it, the sampler joins each instance to its family
node ([#265](https://github.com/jmbarzee/temporal-architect/issues/265)); a name
that fits no family stays concrete. The observed-vs-designed overlay that reads
the result is [#66](https://github.com/jmbarzee/temporal-architect/issues/66).

### Event mapping

Every Temporal event type has one row. The **aggregate graph** column is the
fold behind `observed-graph.json`: the root workflow type, task queue, and
namespace come from `WORKFLOW_EXECUTION_STARTED`, and every `*_SCHEDULED` /
`*_INITIATED` event in that history is an edge out of the root. The **execution
event** column is what `history.Decode` returns for a run: a `history.Event`
(`subject.phase`, with its name, target, opening event, attempt, and failure),
in history order, for a per-run view. Decoding is separate from the fold, so
neither changes the other's output. A heartbeat is not a history event, so
it has no row.

| Event type | Aggregate graph | Execution event |
|---|---|---|
| `WORKFLOW_EXECUTION_STARTED` | root workflow type, task queue, namespace (root node) | `workflow.started` |
| `WORKFLOW_EXECUTION_COMPLETED` | — | `workflow.completed` |
| `WORKFLOW_EXECUTION_FAILED` | — | `workflow.failed` |
| `WORKFLOW_EXECUTION_TIMED_OUT` | — | `workflow.timedOut` |
| `WORKFLOW_TASK_SCHEDULED` | — | ignored, because it only queues a replay step for a worker |
| `WORKFLOW_TASK_STARTED` | — | ignored, because it only marks a worker picking up a replay step |
| `WORKFLOW_TASK_COMPLETED` | — | ignored, because the commands the task issued are recorded as their own events |
| `WORKFLOW_TASK_TIMED_OUT` | — | ignored, because a retried replay step is a worker fault, not a step of the design |
| `WORKFLOW_TASK_FAILED` | — | ignored, because a failed replay step is a worker fault, not a step of the design |
| `ACTIVITY_TASK_SCHEDULED` | `activityCall` to the activity type on its task queue | `activity.scheduled` |
| `ACTIVITY_TASK_STARTED` | — | `activity.started`, with its attempt |
| `ACTIVITY_TASK_COMPLETED` | — | `activity.completed` |
| `ACTIVITY_TASK_FAILED` | — | `activity.failed` |
| `ACTIVITY_TASK_TIMED_OUT` | — | `activity.timedOut` |
| `ACTIVITY_TASK_CANCEL_REQUESTED` | — | `activity.cancelRequested` |
| `ACTIVITY_TASK_CANCELED` | — | `activity.canceled` |
| `TIMER_STARTED` | — | `timer.started` |
| `TIMER_FIRED` | — | `timer.fired` |
| `TIMER_CANCELED` | — | `timer.canceled` |
| `WORKFLOW_EXECUTION_CANCEL_REQUESTED` | — | `workflow.cancelRequested` |
| `WORKFLOW_EXECUTION_CANCELED` | — | `workflow.canceled` |
| `REQUEST_CANCEL_EXTERNAL_WORKFLOW_EXECUTION_INITIATED` | — | `externalCancel.initiated` |
| `REQUEST_CANCEL_EXTERNAL_WORKFLOW_EXECUTION_FAILED` | — | `externalCancel.failed` |
| `EXTERNAL_WORKFLOW_EXECUTION_CANCEL_REQUESTED` | — | `externalCancel.completed` |
| `MARKER_RECORDED` | `activityCall` for a `LocalActivity` marker to the activity type in its details, hosted on the calling workflow's own task queue (a local activity has none); read from the Go, Core (Python, TypeScript, .NET, Ruby, Rust) and Java SDKs' marker formats (Go's checked against the SDK; Core's and Java's derived from their proto and source, not captured histories); a marker naming no type is `LOCAL_ACTIVITY_TYPE_MISSING`; a retry that backs off on a timer records a marker per attempt, each counted | `marker.recorded` |
| `WORKFLOW_EXECUTION_SIGNALED` | — | `signal.received` |
| `WORKFLOW_EXECUTION_TERMINATED` | — | `workflow.terminated` |
| `WORKFLOW_EXECUTION_CONTINUED_AS_NEW` | next run of the chain; each run is its own history, folded into the aggregate graph; the decode keeps per-run identity `(WorkflowID, RunID)`, not yet on the wire ([#775](https://github.com/jmbarzee/temporal-architect/issues/775)) | `workflow.continuedAsNew`, targeting the next run |
| `START_CHILD_WORKFLOW_EXECUTION_INITIATED` | `workflowCall` to the child workflow type, queue, namespace | `child.initiated` |
| `START_CHILD_WORKFLOW_EXECUTION_FAILED` | — | `child.failed`, with the cause |
| `CHILD_WORKFLOW_EXECUTION_STARTED` | — | `child.started` |
| `CHILD_WORKFLOW_EXECUTION_COMPLETED` | — | `child.completed` |
| `CHILD_WORKFLOW_EXECUTION_FAILED` | — | `child.failed`, with the failure |
| `CHILD_WORKFLOW_EXECUTION_CANCELED` | — | `child.canceled` |
| `CHILD_WORKFLOW_EXECUTION_TIMED_OUT` | — | `child.timedOut` |
| `CHILD_WORKFLOW_EXECUTION_TERMINATED` | — | `child.terminated` |
| `SIGNAL_EXTERNAL_WORKFLOW_EXECUTION_INITIATED` | `signalSend` to the target's workflow type: its sampled run, else the `--design` `id_scheme:` it fits, else unresolved by ID | `externalSignal.initiated` |
| `SIGNAL_EXTERNAL_WORKFLOW_EXECUTION_FAILED` | — | `externalSignal.failed` |
| `EXTERNAL_WORKFLOW_EXECUTION_SIGNALED` | — | `externalSignal.completed` |
| `UPSERT_WORKFLOW_SEARCH_ATTRIBUTES` | — | ignored, because it changes visibility metadata, not a step of the design |
| `WORKFLOW_EXECUTION_UPDATE_ACCEPTED` | — | `update.accepted` |
| `WORKFLOW_EXECUTION_UPDATE_REJECTED` | — | `update.rejected` |
| `WORKFLOW_EXECUTION_UPDATE_COMPLETED` | — | `update.completed`, with the failure of a failed outcome |
| `WORKFLOW_PROPERTIES_MODIFIED_EXTERNALLY` | — | ignored, because an operator edited the run's metadata |
| `ACTIVITY_PROPERTIES_MODIFIED_EXTERNALLY` | — | ignored, because an operator edited an activity's options |
| `WORKFLOW_PROPERTIES_MODIFIED` | — | ignored, because it changes the run's memo, not a step of the design |
| `WORKFLOW_EXECUTION_UPDATE_ADMITTED` | — | ignored, because the server queues an update before the worker decides on it; acceptance or rejection records the decision |
| `NEXUS_OPERATION_SCHEDULED` | `nexusCall` to the operation, placed by the `--design`'s endpoint or an [orphan](#nexus-operations) | `nexus.scheduled` |
| `NEXUS_OPERATION_STARTED` | — | `nexus.started` |
| `NEXUS_OPERATION_COMPLETED` | — | `nexus.completed` |
| `NEXUS_OPERATION_FAILED` | — | `nexus.failed` |
| `NEXUS_OPERATION_CANCELED` | — | `nexus.canceled` |
| `NEXUS_OPERATION_TIMED_OUT` | — | `nexus.timedOut` |
| `NEXUS_OPERATION_CANCEL_REQUESTED` | — | `nexus.cancelRequested` |
| `WORKFLOW_EXECUTION_OPTIONS_UPDATED` | — | ignored, because it overrides run options, not a step of the design |
| `NEXUS_OPERATION_CANCEL_REQUEST_COMPLETED` | — | ignored, because it is the handler's acknowledgement of a cancel request; the operation's own closing event records the outcome |
| `NEXUS_OPERATION_CANCEL_REQUEST_FAILED` | — | ignored, because it is the handler's refusal of a cancel request; the operation's own closing event records the outcome |
| `WORKFLOW_EXECUTION_PAUSED` | — | ignored, because an operator paused the run, which is not a step of the design |
| `WORKFLOW_EXECUTION_UNPAUSED` | — | ignored, because an operator resumed the run, which is not a step of the design |
| `WORKFLOW_EXECUTION_TIME_SKIPPING_TRANSITIONED` | — | ignored, because it records a test-server clock jump |

## Limitations

**Non-goals.** The sampler produces a graph, never a design: no `.twf` generation, no AST, no
control-flow recovery, and no semantic-fidelity claim. The graph reflects what ran in the sampled
executions, not the system as designed.

Inherent to history as an input:

- **Partial by construction.** A history shows only what *that run* did;
  coverage depends on sampling breadth. Branches never taken in the sample are
  invisible.
- **No worker identity.** History exposes task queues, not a logical worker
  name, so one worker is synthesized per `(namespace, taskQueue)`. Two distinct
  type-sets polling one queue (rare) collapse into one synthesized worker.
- **Signal targets are IDs, not types.** A target resolves to its named
  run, else to the latest-started sampled run of that workflow ID (an
  approximation of the current run), else, given a design, to the one workflow
  whose `id_scheme:` the ID fits; otherwise it stays unresolved.
- **No control flow or ordering.** An edge means "this called that at least
  once" — not sequence, parallelism, or conditionality.
- **Transitive fetches bypass the filters.** A child or Nexus handler is fetched
  whatever its start time or status, so a graph sampled with `--since` or
  `--status` also holds runs outside that window; only `--transitive-per-type`
  bounds them. A handler that is not a workflow run is not followed.
- **Continue-as-new chains are fetched whole.** A sampled workflow brings every
  run of its chain, so a long chain costs one history fetch per run.

## Usage

```bash
go run ./tools/sampler \
  --address 127.0.0.1:7233 \
  --namespace default \
  --out ./observed-graph.json \
  --sample-percent 10 \
  --min-per-type 5
```

### Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--address` | `127.0.0.1:7233` | Temporal frontend host:port |
| `--namespace` | `default` | Namespace to sample |
| `--tls-cert-path` | _(none)_ | Client TLS certificate (mTLS) |
| `--tls-key-path` | _(none)_ | Client TLS private key (mTLS) |
| `--out` | `./` | Output path; a directory receives `observed-graph.json` |
| `--design` | _(none)_ | A `.twf` file or directory to join sampled definitions to (see [Packages and the design input](#packages-and-the-design-input)) |
| `--sample-percent` | `10` | Percent of each type's executions to sample |
| `--min-per-type` | `5` | Minimum executions to sample per type |
| `--transitive-per-type` | `5` | Most executions to hold per child workflow type or Nexus operation, sampled or fetched for a caller's sake; `0` skips fetching them |
| `--buckets` | `1` | Equal-width time buckets to divide `[--since, --until]` into (1 = a single total). `>1` requires `--since` |
| `--since` | _(none)_ | `StartTime` lower bound / bucket epoch: RFC3339 timestamp or duration like `24h` (relative to now) |
| `--until` | _(none)_ | `StartTime` upper bound / bucket window end: RFC3339 timestamp or duration like `1h` (defaults to now) |
| `--status` | _(none)_ | `ExecutionStatus` filter, e.g. `Running`, `Completed`, `Failed` |

mTLS is enabled only when both `--tls-cert-path` and `--tls-key-path` are set.

### The occurrence time series (`--buckets`)

`--since` is the bucket epoch and `[--since, --until]` (with `--until`
defaulting to now) is divided into `--buckets` equal-width slices. Each observed
dispatch is counted into the bucket its event time falls in. Because the
boundaries are absolute — anchored on `--since`/`--until`, not on any one
sample's event range — graphs sampled with the same window have index-aligned
bucket arrays and can be merged by summing them element-wise
(`observe.Merge`). This is the seam for future parallel sampling, edge-weight,
and time-animation features.

`--buckets 1` (the default) yields a single total per edge — the "just sum it
all" starting point.

### Filtering by time window and status

`--since` / `--until` / `--status` narrow which executions are both **counted**
and **sampled** — they apply to Phase A enumeration and Phase B selection alike,
so the per-type counts always match the candidates the sampler can return.
`--since` / `--until` additionally define the bucket window (above).

- **Time window (`--since` / `--until`).** Each value is either an RFC3339
  timestamp (`2026-06-01T00:00:00Z`) or a Go duration (`24h`, `30m`, `168h`).
  A duration is interpreted relative to now, so `--since 24h` means "started in
  the last 24 hours" (`StartTime >= now - 24h`).
- **Status (`--status`).** Restricts to a single `ExecutionStatus` value. When a
  status is set, the sampler **skips** its usual "prefer running, then top up"
  pass and selects directly from the filtered set.

```bash
# Completed workflows started in the last 24h, as a single total
go run ./tools/sampler --namespace default --out ./observed-graph.json \
  --since 24h --status Completed

# A fixed RFC3339 window split into 24 hourly buckets
go run ./tools/sampler --namespace default --out ./observed-graph.json \
  --since 2026-06-01T00:00:00Z --until 2026-06-02T00:00:00Z --buckets 24
```

## Manual acceptance

There is no Temporal server in CI, so end-to-end acceptance is manual:

```bash
# 1. Start a local Temporal dev server and run a few workflow types.
# 2. Sample the namespace.
go run ./tools/sampler --namespace default --out /tmp/observed-graph.json

# 3. Inspect the result.
jq '.observedGraph.summary' /tmp/observed-graph.json
```

A non-trivial graph (nodes + edges spanning the sampled types) confirms the
round-trip from live histories through the importer. The file can be opened
directly in the visualizer / VS Code extension.

### Diffing against a design graph

If a `.twf` exists (or can be sketched) for the same system, diff the two
graphs — the observed graph projects to the same node-ID scheme as `twf graph`
(pass `--design` when the design has packages):

```bash
go run ./tools/lsp/cmd/twf graph ./design.twf --json > design-graph.json
jq -r '.observedGraph.nodes[].id' observed-graph.json | sort > /tmp/observed-nodes
jq -r '.graph.nodes[].id'         design-graph.json   | sort > /tmp/design-nodes
diff /tmp/observed-nodes /tmp/design-nodes
```

Expect the **history graph to be a subset of the design graph** — history is
partial by construction. Investigate anything in one but not the other: nodes
or edges only in history are real drift (undocumented queues or calls), except
concrete instances of a design family when the sample ran without `--design`
([above](#templateparams-is-always-empty-on-observed-nodes));
nodes only in the design are unsampled or dead paths.

A sample joined to a `--design` folds each family's instances into the
family's node; read how many there were from its hint:

```bash
jq -r '.observedGraph.diagnostics[] | select(.code == "FAMILY_MEMBERS") | .message' observed-graph.json
```

If the observed graph looks thin, widen `--sample-percent` / `--min-per-type`
or drop `--status` before treating a missing node as drift.

## Unit tests

The sampling math and query construction (`sampling/select_test.go`), the
history→observed-graph fold and bucketing (`history/history_test.go`), the
per-run event decode and its table above (`history/events_test.go`), the
transitive pass (`sampling/transitive_test.go`) and its diagnostics
(`history/history_test.go`), the nexus fold and endpoint join (`design/design_test.go`,
`history/nexus_test.go`), the package join (`design/design_test.go`, `history/packages_test.go`), the
signal-target join by `id_scheme:` (`history/id_schemes_test.go`), the
family join (`design/design_test.go`, `history/families_test.go`), and the
output-path / time-flag parsing (`main_test.go`) are covered by pure-function
tests:

```bash
go test ./tools/sampler/...
```

## Deferred

Open work is tracked as GitHub issues:

- Templated nexus endpoint families — [#816](https://github.com/jmbarzee/temporal-architect/issues/816)
- Concurrency and rate limiting, plus parallel sharded sampling with post-hoc `observe.Merge` — [#60](https://github.com/jmbarzee/temporal-architect/issues/60)
- Temporal Cloud env-var auth — [#62](https://github.com/jmbarzee/temporal-architect/issues/62)
- Per-node occurrence series — [#63](https://github.com/jmbarzee/temporal-architect/issues/63)
- Visualizer use of the per-edge time series (edge-weight, time-animation) — [#55](https://github.com/jmbarzee/temporal-architect/issues/55)
- History-mode decomposition — [#65](https://github.com/jmbarzee/temporal-architect/issues/65)
- Observed-vs-designed overlay — [#66](https://github.com/jmbarzee/temporal-architect/issues/66)
- Dogfooding against a real namespace — [#68](https://github.com/jmbarzee/temporal-architect/issues/68)
