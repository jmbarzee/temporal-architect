# Validation Runbook — graph-from-history against a real environment

The dogfood step for the [reverse-history](./GRAPH_FROM_HISTORY.md) workstream: sample a real namespace, build the deployment graph from history, and diff it against a hand-written `.twf` to validate the event→graph mapping. Tracked in [BACKLOG.md](./BACKLOG.md) § "Validation & rollout".

## 1. Build the two binaries

From the repo root (the workspace wires both modules):

```bash
go build -o bin/sampler ./tools/sampler
go build -o bin/twf ./tools/lsp/cmd/twf
```

(If the sandbox `GOMODCACHE` issue bites, prefix with `GOMODCACHE=$HOME/go/pkg/mod`. Not needed in a normal shell.)

## 2. Sample histories from a real namespace

Writes a `<namespace>/<workflowType>/<id>.json` tree under `--out`:

```bash
./bin/sampler \
  --address <host:7233> \
  --namespace <your-namespace> \
  --out ./hist \
  --sample-percent 10 \
  --min-per-type 5
```

- **Temporal Cloud / mTLS:** add `--tls-cert-path <client.pem> --tls-key-path <client.key>` and use the Cloud gRPC endpoint for `--address`.
- **Narrow the window** (recommended for a first run): `--since 24h` (or an RFC3339 timestamp), optionally `--status Running` / `--status Completed`.
- **Multiple namespaces:** rerun per namespace into the *same* `--out`; the tree accumulates and graphs as one system.

Sanity check: `find ./hist -name '*.json' | head` shows files under `hist/<namespace>/<type>/`.

## 3. Build the deployment graph from the sample

```bash
./bin/twf graph --history ./hist --json > history-graph.json
```

- One graph spans every namespace under `./hist`.
- Import warnings (e.g. `SIGNAL_TARGET_NOT_SAMPLED`) ride in the envelope's `diagnostics` — expected when a signal target wasn't in the sample.

## 4. Validate against a known design

If you have (or can sketch) a `.twf` for the same system, diff the two graphs:

```bash
./bin/twf graph ./design.twf --json > design-graph.json
jq '.graph.nodes[].id' history-graph.json | sort > /tmp/hist-nodes
jq '.graph.nodes[].id' design-graph.json  | sort > /tmp/design-nodes
diff /tmp/hist-nodes /tmp/design-nodes
```

Expectation: the **history graph is a subset of the design graph** (history is partial by construction). Investigate anything in one but not the other — nodes/edges only in history are real drift (undocumented queues/calls); nodes only in the design are unsampled or dead paths.

## Things to watch (known limits)

- **Partial coverage:** unsampled branches are invisible — widen `--sample-percent` / `--min-per-type` or drop `--status` if the graph looks thin.
- **Continue-as-new:** chained CAN runs share a WorkflowID, so later runs can overwrite the on-disk file and only the first run is decoded — expect gaps for CAN-heavy workflows.
- **Nexus & local activities** aren't decoded from history yet.

Capture any mapping mismatches found here — they are the seed for the observed-vs-designed overlay and feed back into [BACKLOG.md](./BACKLOG.md).
