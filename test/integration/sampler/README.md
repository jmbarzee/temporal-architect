# test/integration/sampler

End-to-end tests for the reverse-history toolchain. **Not part of any shipped
binary** — this is a standalone module so the heavyweight test dependencies (the
Temporal Go SDK and its in-process dev server) stay out of the production
modules.

## What `TestSamplerE2E` covers

The full reverse path against a real Temporal server:

```
dev server → worker runs GraphTestWorkflow (calls GraphTestActivity)
           → execute + wait
           → sampler pulls the history and writes observed-graph.json
           → read + project the observed graph
           → assert: workflow node + activity node + activityCall edge
```

It exercises the real `sampler` binary as a subprocess (via `go run`) and reads
the single observed-graph JSON it writes, so the actual CLI surface is tested —
not internal functions.

## Running

The tests are guarded by the `integration` build tag and skip under
`go test -short`, so the default `go test ./...` never runs them.

```bash
go test -tags integration ./test/integration/sampler/... -v
```

The first run downloads and caches a Temporal dev-server binary (network
required). Subsequent runs reuse the cache.

## Scope

Deliberately minimal: one workflow calling one activity. That covers the whole
CLI path end to end without a large fixture. Child-workflow / sub-tree and nexus
coverage lands with transitive sampling —
[#59](https://github.com/jmbarzee/temporal-architect/issues/59).
