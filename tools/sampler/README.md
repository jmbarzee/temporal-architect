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

mTLS is enabled only when both `--tls-cert-path` and `--tls-key-path` are set.

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

The sampling math and path layout are pure functions covered by
`sample_test.go`:

```bash
go test ./tools/sampler/...
```

## Deferred

Time-window / status filters, transitive child-workflow and nexus-target
sampling, server-side concurrency / rate limiting, Temporal Cloud env-var auth,
and a `CountWorkflowExecutions GROUP BY WorkflowType` fast path for Phase A are
tracked in the reverse-history workstream backlog.
