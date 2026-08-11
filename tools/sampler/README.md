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
   and downloads each selected execution's full history.
3. **Phase C — build.** The histories are folded in memory into an
   observed graph: meaningful dispatch events (`ACTIVITY_TASK_SCHEDULED`,
   `START_CHILD_WORKFLOW_EXECUTION_INITIATED`,
   `SIGNAL_EXTERNAL_WORKFLOW_EXECUTION_INITIATED`) become edges, each occurrence
   bucketed by its event time. The result is written as one JSON file.

Problems found during the fold reuse the envelope's `graph` diagnostic kind —
there is no separate `history` kind; the `code` disambiguates (e.g.
`SIGNAL_TARGET_NOT_SAMPLED` when a signal's target run was not in the sample).

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

### Event → graph mapping

The root workflow type, task queue, and namespace come from
`WORKFLOW_EXECUTION_STARTED`; every `*_SCHEDULED` / `*_INITIATED` event in that
history is an edge out of the root.

| Event type | Yields | Edge | Status |
|---|---|---|---|
| `WORKFLOW_EXECUTION_STARTED` | root workflow type, task queue, namespace | (root node) | supported |
| `ACTIVITY_TASK_SCHEDULED` | activity type, task queue | `activityCall` | supported |
| `START_CHILD_WORKFLOW_EXECUTION_INITIATED` | child workflow type, queue, namespace | `workflowCall` | supported |
| `SIGNAL_EXTERNAL_WORKFLOW_EXECUTION_INITIATED` | target workflow ID (no type) | `signalSend` | supported; target resolution [#58](https://github.com/jmbarzee/temporal-architect/issues/58) |
| `MARKER_RECORDED` ("LocalActivity") | activity type | `activityCall` | deferred — [#58](https://github.com/jmbarzee/temporal-architect/issues/58) |
| `NEXUS_OPERATION_SCHEDULED` | endpoint, service, operation | `nexusCall` | deferred — [#57](https://github.com/jmbarzee/temporal-architect/issues/57) |

## Limitations

Inherent to history as an input:

- **Partial by construction.** A history shows only what *that run* did;
  coverage depends on sampling breadth. Branches never taken in the sample are
  invisible.
- **No worker identity.** History exposes task queues, not a logical worker
  name, so one worker is synthesized per `(namespace, taskQueue)`. Two distinct
  type-sets polling one queue (rare) collapse into one synthesized worker.
- **Signal targets are IDs, not types.** Resolvable only if the target run is
  in the sample.
- **Local activities are markers**, not scheduled-activity events, and are not
  decoded ([#58](https://github.com/jmbarzee/temporal-architect/issues/58)).
- **No control flow or ordering.** An edge means "this called that at least
  once" — not sequence, parallelism, or conditionality.
- **Continue-as-new collapses.** Chained CAN runs share a WorkflowID, and the
  fold's WorkflowID-keyed index keeps only the first run — expect gaps for
  CAN-heavy workflows ([#61](https://github.com/jmbarzee/temporal-architect/issues/61)).

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
| `--sample-percent` | `10` | Percent of each type's executions to sample |
| `--min-per-type` | `5` | Minimum executions to sample per type |
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
graphs — the observed graph projects to the same node-ID scheme as `twf graph`:

```bash
go run ./tools/lsp/cmd/twf graph ./design.twf --json > design-graph.json
jq -r '.observedGraph.nodes[].id' observed-graph.json | sort > /tmp/observed-nodes
jq -r '.graph.nodes[].id'         design-graph.json   | sort > /tmp/design-nodes
diff /tmp/observed-nodes /tmp/design-nodes
```

Expect the **history graph to be a subset of the design graph** — history is
partial by construction. Investigate anything in one but not the other: nodes
or edges only in history are real drift (undocumented queues or calls); nodes
only in the design are unsampled or dead paths.

If the observed graph looks thin, widen `--sample-percent` / `--min-per-type`
or drop `--status` before treating a missing node as drift.

## Unit tests

The sampling math and query construction (`sampling/select_test.go`), the
history→observed-graph fold and bucketing (`history/history_test.go`), and the
output-path / time-flag parsing (`main_test.go`) are covered by pure-function
tests:

```bash
go test ./tools/sampler/...
```

## Deferred

Open work is tracked as GitHub issues:

- Local-activity decoding and signal-target resolution — [#58](https://github.com/jmbarzee/temporal-architect/issues/58)
- Nexus decoding from history — [#57](https://github.com/jmbarzee/temporal-architect/issues/57)
- Transitive child-workflow / nexus-target sampling — [#59](https://github.com/jmbarzee/temporal-architect/issues/59)
- Concurrency and rate limiting, plus parallel sharded sampling with post-hoc `observe.Merge` — [#60](https://github.com/jmbarzee/temporal-architect/issues/60)
- Continue-as-new run chaining — [#61](https://github.com/jmbarzee/temporal-architect/issues/61)
- Temporal Cloud env-var auth — [#62](https://github.com/jmbarzee/temporal-architect/issues/62)
- Per-node occurrence series — [#63](https://github.com/jmbarzee/temporal-architect/issues/63)
- Visualizer use of the per-edge time series (edge-weight, time-animation) — [#55](https://github.com/jmbarzee/temporal-architect/issues/55)
- History-mode decomposition — [#65](https://github.com/jmbarzee/temporal-architect/issues/65)
- Observed-vs-designed overlay — [#66](https://github.com/jmbarzee/temporal-architect/issues/66)
- Dogfooding against a real namespace — [#68](https://github.com/jmbarzee/temporal-architect/issues/68)
