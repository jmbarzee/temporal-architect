# Validation Runbook — graph-from-history against a real environment

The dogfood step for the [reverse-history](./GRAPH_FROM_HISTORY.md) workstream: sample a real namespace (the sampler builds the deployment graph from history in memory and writes `observed-graph.json`), then diff it against a hand-written `.twf` to validate the event→graph mapping. Tracked in [BACKLOG.md](./BACKLOG.md) § "Validation & rollout".

## 1. Build the two binaries

From the repo root (the workspace wires both modules):

```bash
go build -o bin/sampler ./tools/sampler
go build -o bin/twf ./tools/lsp/cmd/twf
```

(If the sandbox `GOMODCACHE` issue bites, prefix with `GOMODCACHE=$HOME/go/pkg/mod`. Not needed in a normal shell.)

## 2. Sample a real namespace → observed-graph.json

The sampler pulls histories, folds them into the deployment graph in memory, and writes a single `observed-graph.json` (`{ "observedGraph": { … } }`):

```bash
./bin/sampler \
  --address <host:7233> \
  --namespace <your-namespace> \
  --out ./observed-graph.json \
  --sample-percent 10 \
  --min-per-type 5
```

- **Temporal Cloud / mTLS:** add `--tls-cert-path <client.pem> --tls-key-path <client.key>` and use the Cloud gRPC endpoint for `--address`.
- **Narrow the window** (recommended for a first run): `--since 24h` (or an RFC3339 timestamp), optionally `--status Running` / `--status Completed`.
- **Occurrence time series:** `--buckets N` (with `--since`) splits the window into N buckets on each edge; the default is a single total.
- Import warnings (e.g. `SIGNAL_TARGET_NOT_SAMPLED`) surface as `unresolved`/`diagnostics` in the payload — expected when a signal target wasn't in the sample.

Sanity check: `jq '.observedGraph.summary' ./observed-graph.json`.

## 3. Validate against a known design

If you have (or can sketch) a `.twf` for the same system, diff the two graphs (the observed graph projects to the same node-ID scheme as `twf graph`):

```bash
./bin/twf graph ./design.twf --json > design-graph.json
jq -r '.observedGraph.nodes[].id' observed-graph.json | sort > /tmp/hist-nodes
jq -r '.graph.nodes[].id'         design-graph.json  | sort > /tmp/design-nodes
diff /tmp/hist-nodes /tmp/design-nodes
```

Expectation: the **history graph is a subset of the design graph** (history is partial by construction). Investigate anything in one but not the other — nodes/edges only in history are real drift (undocumented queues/calls); nodes only in the design are unsampled or dead paths.

## Things to watch (known limits)

- **Partial coverage:** unsampled branches are invisible — widen `--sample-percent` / `--min-per-type` or drop `--status` if the graph looks thin.
- **Continue-as-new:** chained CAN runs share a WorkflowID, so `history.Build`'s WorkflowID-keyed index collapses them and only the first run is folded — expect gaps for CAN-heavy workflows.
- **Nexus & local activities** aren't decoded from history yet.

Capture any mapping mismatches found here — they are the seed for the observed-vs-designed overlay and feed back into [BACKLOG.md](./BACKLOG.md).
