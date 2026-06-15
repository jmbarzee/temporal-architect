# sampler

Pulls a representative sample of workflow histories from a live Temporal
namespace and writes them as protojson into the folder layout
`twf graph --history` consumes:

```
<out>/<namespace>/<workflowType>/<workflowId>.json
```

The output of each file matches `temporal workflow show -o json`, so the same
files can be inspected with the Temporal CLI.

## How it works

One invocation targets one namespace and runs two phases:

1. **Phase A — enumerate.** A paginated Visibility scan (`ListWorkflow`)
   aggregates every observed execution into a map keyed by workflow type,
   recording each execution's id, run id, and running/closed status.
2. **Phase B — sample.** For each type it selects
   `max(min-per-type, ceil(sample-percent% × count))` executions (capped at the
   count), preferring **running** workflows and topping up with closed ones.
   It downloads each selected execution's full history and writes it under
   `--out`.

Run it once per namespace into the **same** `--out` to build a multi-namespace
tree that `twf graph --history <out>` reads in one shot.

## Usage

```bash
go run ./tools/sampler \
  --address 127.0.0.1:7233 \
  --namespace default \
  --out ./histories \
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
| `--out` | `./` | Output root dir |
| `--sample-percent` | `10` | Percent of each type's executions to sample |
| `--min-per-type` | `5` | Minimum executions to sample per type |
| `--since` | _(none)_ | `StartTime` lower bound: RFC3339 timestamp or duration like `24h` (relative to now) |
| `--until` | _(none)_ | `StartTime` upper bound: RFC3339 timestamp or duration like `1h` (relative to now) |
| `--status` | _(none)_ | `ExecutionStatus` filter, e.g. `Running`, `Completed`, `Failed` |

mTLS is enabled only when both `--tls-cert-path` and `--tls-key-path` are set.

### Filtering by time window and status

`--since` / `--until` / `--status` narrow which executions are both **counted**
and **sampled** — they apply to Phase A enumeration and Phase B selection alike,
so the per-type counts always match the candidates the sampler can return.

- **Time window (`--since` / `--until`).** Each value is either an RFC3339
  timestamp (`2026-06-01T00:00:00Z`) or a Go duration (`24h`, `30m`, `168h`).
  A duration is interpreted relative to now, so `--since 24h` means "started in
  the last 24 hours" (`StartTime >= now - 24h`) and `--until 1h` means "started
  more than an hour ago" (`StartTime <= now - 1h`). Either side may be omitted
  for an open-ended window. Internally this becomes a `StartTime BETWEEN … AND …`
  clause (or a single-sided `>=` / `<=`) on the Visibility query.
- **Status (`--status`).** Restricts to a single `ExecutionStatus` value. When a
  status is set, the sampler **skips** its usual "prefer running, then top up"
  pass (which would otherwise contradict e.g. `--status Completed`) and selects
  directly from the filtered set.

```bash
# Completed workflows started in the last 24h
go run ./tools/sampler --namespace default --out ./histories \
  --since 24h --status Completed

# A fixed RFC3339 window, any status
go run ./tools/sampler --namespace default --out ./histories \
  --since 2026-06-01T00:00:00Z --until 2026-06-07T00:00:00Z
```

Filters compose cleanly with the existing `WorkflowType` / running-preference
logic and keep output deterministic (stable clause order, RFC3339 timestamps).

## Manual acceptance

There is no Temporal server in CI, so end-to-end acceptance is manual:

```bash
# 1. Start a local Temporal dev server and run a few workflow types.
# 2. Sample the namespace.
go run ./tools/sampler --namespace default --out /tmp/histories

# 3. Confirm the tree: >= min-per-type files per type, preferring running ones.
find /tmp/histories -name '*.json'

# 4. Build a graph from the sample.
go run ./tools/lsp/cmd/twf graph --history /tmp/histories --json | jq '.graph.summary'
```

A non-trivial graph (nodes + edges spanning the sampled types) confirms the
round-trip from live histories through the importer.

## Unit tests

The sampling math, query construction, and path layout are pure functions
covered by `sampling/select_test.go` (counts, candidate selection, and
filter-query building) and `path_test.go` (output paths, `--since`/`--until`
parsing):

```bash
go test ./tools/sampler/...
```

## Deferred

Transitive child-workflow and nexus-target sampling, server-side concurrency /
rate limiting, and Temporal Cloud env-var auth are tracked in the
reverse-history workstream backlog. (Time-window / status filters and the
`CountWorkflowExecutions GROUP BY WorkflowType` fast path for Phase A are now
implemented.)
