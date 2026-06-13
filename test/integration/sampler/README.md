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
           → sampler pulls the history
           → twf graph --history rebuilds the deployment graph
           → assert: workflow node + activity node + activityCall edge
```

It exercises the real `sampler` and `twf` binaries as subprocesses (via
`go run`), so the actual CLI surfaces are tested — not internal functions.

## Running

The tests are guarded by the `integration` build tag and skip under
`go test -short`, so the default `go test ./...` never runs them.

```bash
go test -tags integration ./test/integration/sampler/... -v
```

The first run downloads and caches a Temporal dev-server binary (network
required). Subsequent runs reuse the cache.

## Scope

Intentionally minimal for now: a single workflow that calls a single activity.
Child-workflow / sub-tree and nexus coverage will be added alongside the
transitive-sampling work tracked in the reverse-history backlog.
