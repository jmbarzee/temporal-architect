# Corpus

Small `.twf` designs, each authored into every supported SDK and built and tested in CI. Together they cover each construct group once; they are a sample, not an exhaustive harness. Modeled on [`temporalio/features`](https://github.com/temporalio/features).

| Design | Covers |
|---|---|
| [`nexus`](./nexus/nexus.twf) | Nexus service, sync and async operations, caller and handler, `detach nexus`, endpoints |
| [`messages`](./messages/messages.twf) | signal, query and update handlers, `await signal`, `promise <- signal`, `await update` |
| [`concurrency`](./concurrency/concurrency.twf) | `await all`, `await one`, `detach workflow`, child workflows, timers |
| [`continue-as-new`](./continue-as-new/continue-as-new.twf) | `close continue_as_new`, `await timer` |

## Layout

```
corpus/
  go.mod                 one project per SDK, at the corpus root
  package.json
  pyproject.toml
  <design>/
    <design>.twf         the design, with no @sdk
    go/                  its Go output, per skills/temporal-architect-author-go
      <design>.twf       the design plus only @sdk(go, …)
    typescript/          its TypeScript output
      <design>.twf       the design plus only @sdk(typescript, …)
    python/              its Python output, as top-level modules
      <design>.twf       the design plus only @sdk(python, …)
```

Each SDK's copy of the design names only its own implementation, so no worker carries two SDKs. `check-corpus` checks every `.twf` file on its own (a directory check would load the copies together) and fails when a copy, its `@sdk` lines stripped, differs from the design.

Each output registers the `.twf` names, implements every workflow and activity, and tests each workflow with the SDK's time-skipping test environment, so no Temporal server is needed.

## Run

```shell
make corpus-go          # check the corpus, then go vet and go test the Go outputs
make corpus-typescript  # check the corpus, then npm ci, tsc and the node:test suites
make corpus-python      # check the corpus, then uv sync, mypy and pytest in each design's python/
```

## Add an SDK

1. Author each design into `<design>/<sdk>/`, beside a copy of `<design>.twf` carrying only its `@sdk`, with the project file at the corpus root.
2. Add a `corpus-<sdk>` target to the [Makefile](../Makefile) that depends on `check-corpus`, then builds and tests those outputs. The targets iterate `CORPUS_DESIGNS`, the designs found by `corpus/*/*.twf`, never a directory glob, so a dependency directory such as `node_modules` is never checked or built.
3. Add `<sdk>` to the `corpus` job's matrix in [ci.yml](../.github/workflows/ci.yml), with a setup step if the runner lacks its toolchain. No test needs a Temporal server today; an SDK whose tests do adds `temporalio/setup-temporal` as a step gated on `matrix.sdk`.
