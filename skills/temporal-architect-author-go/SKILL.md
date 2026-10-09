---
name: temporal-architect-author-go
description: Generate Go code from .twf workflow designs using the Temporal Go SDK. Use when implementing workflows defined in TWF, producing compilable Go packages from DSL specifications.
---

# Temporal Architect: Go Authoring

Turn `.twf` files into Go that compiles, runs, and implements the design with the Temporal Go SDK. The deliverable is always `.go` files.

## Principles

**Root-down.** Roots (workflows no other workflow calls as a child) → children → activities → types. Each layer is constrained by the one above; defer unknowns and revisit.

**Write only what is needed.** No speculative fields, types, or files — the minimum bridge from DSL intent to working Go.

**Prefer imports over generation.** Check `go.mod` and existing code first; use well-known libraries when types match; generate only application-specific types. Resolve types from certainty outward — [types.md](./reference/types.md).

**The user decides what is consequential.** Do mechanical mappings, SDK boilerplate, and compile fixes yourself. Surface dependency choices, ambiguous domain logic, and architectural direction as specific options with tradeoffs, never open questions — e.g. "ChargePayment: stripe-go (official, matches your existing dependency) or a plain HTTP client (flexible, more boilerplate)?" Revising a confirmed decision always needs the user's approval.

## Process

### Orient

Settle where the code lands. In an existing repo its conventions are **requirements to match**: detect the codegen variant from the signals below and conform; in greenfield, ask (default hand-written).

**Proto-first** if any of: `buf.gen.yaml` with a `protoc-gen-go_temporal` plugin; generated `*_temporal.pb.go`; `(temporal.v1.activity)` / `(temporal.v1.workflow)` annotations in `.proto`. Then load [proto-driven.md](./reference/proto-driven.md) on top of the construct references. Otherwise (hand-written `workflow.ExecuteActivity` call sites) **hand-written**. Route on these signals, never on a name or acronym ("PFI").

For an existing repo, dispatch the design skill's [project-discovery subagent](../temporal-architect-design/subagents/project-discovery.md) on the bounded slice in scope and work from its summary; don't re-scan in the main context. A target spanning several slices goes through the design skill's [reverse decompose](../temporal-architect-design/reference/reverse-engineering.md#decompose-a-large-repo-into-slices) first.

### 1. Gather and plan

- Read the `.twf` files in scope, `go.mod`, and existing code (or the discovery summary); ask brief, targeted questions about domain and key dependencies.
- **Resolve dependencies** per [dependency-resolution.md](./reference/dependency-resolution.md). The user confirms the dependency map before generation.
- Plan the root-down order, check the map against the planned signatures, and name what is deferred or ambiguous.

### 2. Generate and verify by layer

| Layer | What | Check | Reference |
|-------|------|-------|-----------|
| 1a. Types + signatures | Structs, interfaces, signatures with empty bodies; interfaces shaped by the dependency map | `go build` | [types.md](./reference/types.md) |
| 1b. Activity stubs | Every activity with its real signature and a zero-value body, so workflows can reference it by nil-pointer method value ([activity-call.md](./reference/activity-call.md)) | `go build` | [activity-def.md](./reference/activity-def.md) |
| 2. Workflow bodies | Activity and child calls, signals, timers, selectors | `go build` | [workflow-def.md](./reference/workflow-def.md), [composite-patterns.md](./reference/composite-patterns.md) |
| 3. Activity impl | Thin methods + concrete implementations behind interfaces | `go build` | [activity-def.md](./reference/activity-def.md#activity-implementation-pattern) |
| 4. Worker wiring | `cmd/` entry: build dependencies, register types, run | `go build` | [worker.md](./reference/worker.md) |
| 5. Tests | Floor: one happy-path `testsuite.WorkflowTestSuite` test per workflow. Non-trivial designs: three layers | `go test` | [three-layer-testing.md](./reference/three-layer-testing.md) |
| 6. Final | | `go vet` | — |

Then present the code for review.

**Implementation depth.** `.twf` activity bodies are pseudocode and may describe more than you implement. Where you simplify, leave a `// TODO:` naming the elided logic (e.g. `// TODO: cross-field consistency checks (see TWF)`). Shallow bodies suit examples and prototypes; for production, ask which activities need full implementations.

## Output conventions

- One Go package per `.twf`, named from its filename (snake_case), beside the `.twf` unless the user says otherwise.
- One file per workflow, a shared types file if needed, activities grouped logically, at least one `_test.go` per workflow, worker entry in `cmd/`.

## Reference index

Load only what the current layer needs.

| DSL | Go | File |
|-----|----|------|
| `workflow Name(...)` | workflow function | [workflow-def.md](./reference/workflow-def.md) |
| `activity Name(...)` | activity function / method | [activity-def.md](./reference/activity-def.md) |
| `worker`, namespace worker `options:` | `worker.New`, `worker.Options` | [worker.md](./reference/worker.md) |
| `nexus service Name:` | Nexus service + handlers | [nexus-service-def.md](./reference/nexus-service-def.md) |
| `activity Name(args) -> r` | `workflow.ExecuteActivity` | [activity-call.md](./reference/activity-call.md) |
| `workflow Name(args) -> r` | `workflow.ExecuteChildWorkflow` | [workflow-call.md](./reference/workflow-call.md) |
| `detach workflow ...` | child: confirm start, skip result | [detach.md](./reference/detach.md) |
| `nexus Endpoint Service.Op(args) -> r` | `NexusClient.ExecuteOperation` | [nexus.md](./reference/nexus.md) |
| `signal handle.Name(args)` | `SignalChildWorkflow` | [signal-send.md](./reference/signal-send.md) |
| `signal Name(params):` | signal channel + selector | [signal-handler.md](./reference/signal-handler.md) |
| `query Name(params) -> (T):` | `workflow.SetQueryHandler` | [query-handler.md](./reference/query-handler.md) |
| `update Name(params) -> (T):` | `workflow.SetUpdateHandler` | [update-handler.md](./reference/update-handler.md) |
| `await timer(d)` | `workflow.Sleep` | [await-timer.md](./reference/await-timer.md) |
| `promise p <- ...` | future, deferred `.Get` | [promise.md](./reference/promise.md) |
| `state:` / `condition` / `set` / `unset` | `bool` + `workflow.Await` | [condition.md](./reference/condition.md) |
| `await all:` | `workflow.Go` + futures | [await-all.md](./reference/await-all.md) |
| `await one:` | `workflow.NewSelector` | [await-one.md](./reference/await-one.md) |
| `options:` / `default_options:` | `ActivityOptions` / `ChildWorkflowOptions` / `NexusOperationOptions` | [options.md](./reference/options.md) |
| `if` / `for` / `switch` / `break` / `continue`, `x = expr` | Go equivalents | [control-flow.md](./reference/control-flow.md) |
| `close complete` / `fail` / `continue_as_new` | `return` / `workflow.NewContinueAsNewError` | [close.md](./reference/close.md) |
| `heartbeat(details)` | `activity.RecordHeartbeat` | [heartbeat.md](./reference/heartbeat.md) |
