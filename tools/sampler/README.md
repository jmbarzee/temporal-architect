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

1. **Phase A — find the types and their counts.** The workflow mode *discovers*
   the type list from a bounded random sample of the window, then counts each
   type with one filtered `Count` — see
   [How Phase A finds the workflow types](#how-phase-a-finds-the-workflow-types).
   The legacy single-process CLI still uses the old paginated `ListWorkflow`
   scan bounded by `--scan-limit`, which is O(executions) and unusable on a large
   namespace; that CLI is slated for removal once the workflow mode is proven.
2. **Phase B — sample.** For each type it selects
   `max(min-per-type, ceil(sample-percent% × count))` executions (capped at the
   count), preferring **running** workflows and topping up with closed ones,
   and downloads each selected execution's full history.
3. **Phase C — build.** The histories are folded in memory into an
   observed graph: meaningful dispatch events (`ACTIVITY_TASK_SCHEDULED`,
   `START_CHILD_WORKFLOW_EXECUTION_INITIATED`,
   `SIGNAL_EXTERNAL_WORKFLOW_EXECUTION_INITIATED`) become edges, each occurrence
   bucketed by its event time. The result is written as one JSON file.

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
| `--address` | `127.0.0.1:7233` | Temporal frontend `host:port` (grpc), or the web API host (http), e.g. `production.urgaq.web.tmprl.cloud` |
| `--namespace` | `default` | Namespace to sample; on Temporal Cloud use the fully-qualified `<namespace>.<account>` (e.g. `production.urgaq`) |
| `--transport` | `grpc` | `grpc` (SDK client) or `http` (Cloud web API with a bearer token) |
| `--caller-type` | `operator` | `caller-type` header sent on the http transport (the Cloud web API expects `operator`) |
| `--bearer-file` | _(none)_ | Path to a file holding the bearer token, re-read before every request; survives a rotating short-lived token |
| `--tls` | `false` | Enable server TLS without mTLS (implied when a bearer token is set via `TEMPORAL_API_KEY`) |
| `--tls-cert-path` | _(none)_ | Client TLS certificate (mTLS) |
| `--tls-key-path` | _(none)_ | Client TLS private key (mTLS) |
| `--out` | `./` | Output path; a directory receives `observed-graph.json` |
| `--sample-percent` | `10` | Percent of each type's executions to sample |
| `--min-per-type` | `5` | Minimum executions to sample per type |
| `--scan-limit` | _(pkg default)_ | _(legacy)_ Cap on the O(executions) `ListWorkflow` enumeration scan; `<0` = unbounded. Only this CLI scans — the workflow mode discovers instead |
| `--no-scan-fallback` | `false` | _(legacy)_ Fail enumeration rather than scan. Fails every run, since the grouped `Count` it waits for is unsupported everywhere |
| `--buckets` | `1` | Equal-width time buckets to divide `[--since, --until]` into (1 = a single total). `>1` requires `--since` |
| `--since` | _(none)_ | `StartTime` lower bound / bucket epoch: RFC3339 timestamp or duration like `24h` (relative to now) |
| `--until` | _(none)_ | `StartTime` upper bound / bucket window end: RFC3339 timestamp or duration like `1h` (defaults to now) |
| `--status` | _(none)_ | `ExecutionStatus` filter, e.g. `Running`, `Completed`, `Failed` |

mTLS is enabled only when both `--tls-cert-path` and `--tls-key-path` are set.

### Auth

Bearer-token sources, in precedence order:

1. **`--bearer-file`** — a file holding the raw token, re-read before every
   request, so overwriting it with a freshly-pulled token survives a rotating
   short-lived token without a restart.
2. **`TEMPORAL_API_KEY`** — captured once at startup (no refresh); ideal for a
   long-lived Cloud API key, sent as `Authorization: Bearer <token>`.

Both work on either transport and auto-enable TLS. On `--transport grpc`, point
`--address` at the gRPC endpoint (the namespace endpoint
`<namespace>.<account>.tmprl.cloud:7233` or a regional
`<region>.<cloud>.api.temporal.io:7233`); the file source becomes the SDK's
dynamic API-key credential. Alternatively use **mTLS** (`--tls-cert-path` +
`--tls-key-path`), or **plaintext** for a local dev server (the default).

#### Temporal Cloud via the web API (`--transport http`)

When the only credential you can obtain is a browser-scoped bearer token (e.g.
an enterprise browser injects auth and mints short-lived UI tokens), target the
Cloud **web** endpoint directly — the same grpc-gateway JSON API the Cloud UI
calls. The sampler replays the UI's request shape (bearer token + the
`caller-type: operator` header):

```bash
go run ./tools/sampler \
  --transport http \
  --address production.urgaq.web.tmprl.cloud \
  --namespace production.urgaq \
  --bearer-file ./bearer \
  --out ./observed-graph.json \
  --min-per-type 1 --sample-percent 0
```

The three read calls map onto the web routes `GET .../workflow-count`,
`GET .../workflows`, and `GET .../workflows/{id}/history`.

**Rotating tokens.** A Cloud UI JWT is short-lived (~15 min — it's an Auth0
`saas-api.tmprl.cloud` access token the UI silently refreshes). `--bearer-file`
is re-read before **every** request, so overwriting the file with a
freshly-pulled token lets an in-flight sample continue across a rotation without
restarting. A stale token surfaces as an `HTTP 401/403 (auth failed — the
bearer token is likely expired; refresh it and re-run)` error.
(`TEMPORAL_API_KEY` is captured once at startup and does not refresh — fine for
a long-lived Cloud API key, the friction-free option when you can mint one.)

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

## Parallel Temporal workflow mode

The single-process CLI above runs the whole pull in one synchronous process — no
progress visibility on large namespaces, no parallelism. The same sample can
instead be run as a **Temporal workflow tree**, for the Web UI's live
child/activity progress tree, a queryable progress handler, durability/retries,
and bounded fan-out concurrency. The design is in
[`sample-namespace.twf`](./sample-namespace.twf); the implementation is under
[`temporal/`](./temporal) (`workflows.go`, `activities.go`) with the worker and
starter in [`cmd/worker`](./cmd/worker) and [`cmd/start`](./cmd/start).

```
SampleNamespaceWorkflow (orchestrator)
├─ EnumerateTypesWorkflow            → []{type, count}   (child; "find the types")
└─ SampleTypeWorkflow  (one per type, bounded fan-out)
   └─ FetchFoldHistoryActivity       → partial ObservedGraph   (one per execution batch)
```

Each `FetchFoldHistoryActivity` downloads a batch of executions' histories and
folds them (`history.Build`) to a partial `ObservedGraph`; the per-type children
and the orchestrator fold the partials back together with `observe.Merge`. Every
partial is built with the **same absolute `Window`** (resolved once in the
starter), so the bucket arrays are index-aligned and the fold is exact — the
result is byte-identical to the single-process graph for the same inputs (proven
by `TestWorkflowSamplerReproducesSingleProcess` in the integration suite).

Run it against a Temporal server:

```bash
# 1. Worker — polls the "sampler" task queue. SAMPLER_* env vars configure how its
#    activities reach the TARGET namespace being sampled (see below).
SAMPLER_ADDRESS=127.0.0.1:7233 SAMPLER_TRANSPORT=grpc \
  go run ./tools/sampler/cmd/worker

# 2. Starter — starts SampleNamespaceWorkflow, waits, writes observed-graph.json.
go run ./tools/sampler/cmd/start \
  --namespace default \
  --out ./observed-graph.json \
  --sample-percent 10 --min-per-type 5 \
  --type-concurrency 4 --exec-concurrency 8 --batch-size 20
```

Starter flags beyond the shared sampling knobs:

| Flag | Default | Description |
|------|---------|-------------|
| `--workflow-types` | _(none)_ | Comma-separated types to sample, skipping the discovery loop (still verified with one count) |
| `--discovery-probes` | `32` | Stratified time slices probed per discovery round (one `ListWorkflow` call each) |
| `--discovery-page-size` | `200` | Executions read per discovery probe |
| `--discovery-seed` | _(clock)_ | Seed for probe placement; pin it to reproduce a run's exact sample |
| `--discovery-max-rounds` | `20` | Cap on exclusion rounds; each round finds ≥1 new type, so this bounds discoverable types |
| `--type-concurrency` | `4` | Max in-flight `SampleTypeWorkflow` children |
| `--exec-concurrency` | `8` | Max in-flight `FetchFoldHistoryActivity` per type |
| `--batch-size` | `20` | Executions folded per `FetchFoldHistoryActivity` call |
| `--batches-per-run` | `0` | Batches before `SampleTypeWorkflow` continues-as-new (0 = unbounded) |

Query live progress while it runs:

```bash
temporal workflow query --workflow-id <id> --type GetProgress
# → {typesTotal, typesDone, executionsSampled, perType: {sampled, target}}
```

### Two namespaces, and the credential

The sampler's **control plane** (where the three workflows run) is a *separate*
namespace from the **target** being sampled. `cmd/worker` connects its own client
to the control plane via `SAMPLER_TEMPORAL_HOSTPORT` / `SAMPLER_TEMPORAL_NAMESPACE`;
the activities reach the target namespace (the `--namespace` passed to `cmd/start`)
via the `SAMPLER_*` transport vars, which mirror the single-process flags:
`SAMPLER_ADDRESS`, `SAMPLER_TRANSPORT`, `SAMPLER_CALLER_TYPE`,
`SAMPLER_TLS_CERT_PATH` / `SAMPLER_TLS_KEY_PATH` / `SAMPLER_TLS`, and the
credential. Run the sampler in a different namespace than the target, or it will
enumerate its own in-flight executions.

> **Credential longevity (important).** A durable/parallel run can outlive a
> browser-pulled JWT (they rotate every few minutes). Use a **long-lived**
> credential — a Temporal Cloud API key or mTLS — or point `SAMPLER_BEARER_FILE`
> (worker) / `--bearer-file` (single-process) at a file a sidecar keeps
> refreshed: it is re-read on every request (http) and via a dynamic-credentials
> callback (grpc), so an in-flight sample survives token rotation. Do **not**
> depend on a raw short-lived token in `TEMPORAL_API_KEY` for a long run.

### How Phase A finds the workflow types

**`CountWorkflowExecutions GROUP BY WorkflowType` does not exist.** No Temporal
server supports it — Cloud and OSS alike implement `GROUP BY` for
`ExecutionStatus` only, rejecting anything else with *"operation is not
supported: 'group by' clause is only supported for ExecutionStatus search
attribute"* (grouping by arbitrary search attributes has been "planned for a
future release" since v1.20). Cloud's web API makes this worse by disguising the
rejection as `{"count": null, "groupCount": 0}` rather than an error.

So the type list is *discovered*, not counted, in three steps:

1. **Seed — an exclusion loop that proves its own completeness.** Every
   discovery query excludes the types already known:

   ```
   StartTime BETWEEN '…' AND '…' AND WorkflowType != 'CAPRefreshWorkflow' AND WorkflowType != 'NeoWorkflow'
   ```

   Two properties fall out, and they are the whole point:

   - **Guaranteed progress.** Any row that comes back is a *new* type by
     construction, so the loop runs at most once per distinct type — O(types),
     never O(executions), and it does not depend on a random sample getting
     lucky. This matters because execution counts are wildly skewed: one type
     with 3M executions will dominate every unfiltered page and bury the rare
     orchestrator you actually need.
   - **Proven termination.** `CountWorkflowExecutions` over that same excluded
     set answers *"how many executions have a type I don't know about?"* When it
     reaches zero, the type list is **provably complete** for the window. Short
     of that, it is an honest progress metric — the activity logs
     `exhaustive` and `remaining` so an incomplete sample is visible rather
     than silent.

   Each round also fires `--discovery-probes` stratified `ListWorkflow` pages
   (`--discovery-page-size` rows each) across equal time slices of the window, as
   an accelerant that surfaces several new types per round. The full-window query
   runs first regardless, so progress never depends on a probe landing well.
   Slice placement is jittered by `--discovery-seed`, which the **starter**
   resolves (like the window) and pins into workflow input, so replays and
   continue-as-new probe identical slices.

   `--discovery-max-rounds` bounds the loop. Note that `NOT IN` is not a
   supported List Filter operator, so exclusion is chained `!=`; the query grows
   with the type count, and past `sampling.MaxExcludedTypes` discovery stops and
   reports itself non-exhaustive rather than sending a query the server may
   reject.

2. **Size — one supported call per type.** `CountWorkflowExecutions` filtered by
   `WorkflowType='X'` is fine and cheap: O(types), not O(executions).

3. **Close over relationships.** Sampled histories name the workflow types of
   any children outright (the initiating event carries `workflowType`), while
   parents, roots, and signal targets appear as workflow IDs only —
   `history.References` collects them and `sampling.ResolveTypes` maps them back
   to types in batched `WorkflowId IN (...)` queries. Walking *up* is the
   valuable direction: a random sample is dominated by whatever runs most, which
   is usually leaf children, so the rare orchestrator that started them is
   exactly what sampling misses.

### Coverage: knowing whether the graph is the whole system

A workflow type that was never discovered is a **subgraph missing from the
output**, and nothing in the graph itself distinguishes that from a system which
genuinely has no such workflow. Because the exclusion loop can *prove*
completeness, that proof is treated as part of the result rather than a log line.
The workflow-mode artifact carries it beside the graph:

```json
{
  "observedGraph": { "...": "unchanged — same shape twf graph --json emits" },
  "coverage": {
    "types": 4,
    "exhaustive": true,
    "remaining": 0,
    "rounds": 1,
    "calls": 6,
    "source": "discovered"
  }
}
```

- `exhaustive: true` means a `Count` of everything *excluding* the known types
  returned zero — the type list is provably complete for the window.
- `remaining` is the size of the blind spot when it is not: how many executions
  have a type the sample never identified. The starter prints a loud warning in
  that case, and `GetProgress` exposes the same block mid-run so a long sample
  can be judged before it finishes.
- `source` is `discovered`, or `explicit` when you passed `--workflow-types` (in
  which case the coverage fields are a verification of *your* list).

This is what makes the sample interpretable downstream: a consumer can tell "this
is the system" from "this is some of it" without re-querying the namespace.

> **`--workflow-types` is honored verbatim — and verified.** Workflow types are
> static (compiled into your workers), so a service registry or the codebase is a
> good source. Supplying the list skips the discovery loop, but *one* count still
> runs against the excluded set, so you find out whether your list actually
> covers the namespace: `exhaustive=true` confirms it, while
> `remaining=N` tells you how many executions your list would silently omit.

Concurrency is bounded in two places that compose: in-workflow semaphores
(`--type-concurrency`, `--exec-concurrency`) and the worker's
`MaxConcurrent*` limits (`SAMPLER_MAX_ACTIVITIES`, `SAMPLER_MAX_WORKFLOW_TASKS`),
so the fan-out never hammers the target frontend / web API. For a type with many
candidates, `SampleTypeWorkflow` continues-as-new every `--batches-per-run`
batches to bound its own history.

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

## Unit tests

The sampling math and query construction (`sampling/select_test.go`), the
history→observed-graph fold and bucketing (`history/history_test.go`), and the
output-path / time-flag parsing (`main_test.go`) are covered by pure-function
tests. The parallel mode adds `temporal/types_test.go` (batching, window
resolution) and `temporal/workflows_test.go` (the fan-out/`observe.Merge`
fan-in, per-type continue-as-new, and the `GetProgress` query, all via
`testsuite.TestWorkflowEnvironment` with mocked activities):

```bash
go test ./tools/sampler/...
```

## Deferred

Transitive child-workflow and nexus-target sampling, server-side concurrency /
rate limiting, and Temporal Cloud env-var auth are tracked in the
reverse-history workstream backlog. Parallel sharded sampling with post-hoc
`observe.Merge` is now wired as the [Temporal workflow
mode](#parallel-temporal-workflow-mode) above; the visualizer's use of the
per-edge time series (edge-weight, time-animation) is enabled by this design but
not yet wired.
