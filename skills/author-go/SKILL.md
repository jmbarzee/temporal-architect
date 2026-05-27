---
name: temporal-go-author
description: Generate Go code from .twf workflow designs using the Temporal Go SDK. Use when implementing workflows defined in TWF, producing compilable Go packages from DSL specifications.
---

# Temporal Go Author

Generate functioning Go code from `.twf` (Temporal Workflow Format) files using the Temporal Go SDK. The primary goal is producing code that compiles, runs, and correctly implements the workflow design. Always produce `.go` files as deliverables.

---

## Core Principles

**Root-down generation.** Start from root workflows (no parent), work down to children, then activities, then types. Each layer is constrained by what the layer above needs. Defer unknowns, revisit later.

**Write only what is needed.** No speculative fields, no extra types, no over-generation. The minimum bridge between DSL intent and working Go.

**Prefer imports over generation.** Check `go.mod` and existing project code first. Use well-known libraries when types match. Only generate stubs for application-specific types.

**Iterative type resolution.** Work from certainty outward. Explicit signatures first, then derive from constructors/field access, then defer the rest. Revisit deferred types as surrounding code solidifies. See [types.md](./reference/types.md).

**User as decision-maker.** The skill owns execution; the user owns consequential choices. Handle mechanical mappings, SDK boilerplate, and compilation fixes autonomously. Surface dependency choices, ambiguous domain logic, and architectural direction to the user — present specific options with tradeoffs, not open-ended questions. Revising a previously confirmed decision always requires user approval.
> Example: "For ChargePayment, should I use stripe-go (official SDK, matches your existing stripe dependency) or a generic HTTP client (more flexible, but more boilerplate)?"

---

## Process

### 1. Context Gathering

- Read `.twf` files in scope
- Examine `go.mod`, existing project code, and conventions
- Ask the user about project context, domain, key dependencies — brief, targeted questions

### 2. Dependency Resolution

Identify external integration points for each activity and resolve to concrete types. See [dependency-resolution.md](./reference/dependency-resolution.md) for the full process. Deliverable: a dependency map confirmed by the user before generation begins.

### 3. Planning

- Identify root workflows (not called as children by other workflows in the `.twf` file)
- Outline the generation order: roots → children → activities → types
- Review the dependency map against planned type signatures — flag any conflicts
- If the dependency map is incomplete, note which decisions are deferred
- Surface ambiguities to the user

### 4. Generate + Verify Incrementally

Root-down, with build checks between layers. Consult [reference files](#reference-index) for DSL→Go mapping at each layer.

| Layer | What | Check | Key references |
|-------|------|-------|----------------|
| 1a. Types + signatures | Structs, interfaces, function signatures (empty bodies, zero-value returns). Dependency map informs interface shapes | `go build` | [types.md](./reference/types.md) |
| 1b. Activity stubs | Forward-declare all activity functions/methods with correct signatures, empty bodies, zero-value returns. This makes activity functions available as references for Layer 2 and enables the nil-pointer method pattern (`var a *Activities; workflow.ExecuteActivity(ctx, a.Foo, ...)`) | `go build` | [activity-def.md](./reference/activity-def.md) |
| 2. Workflow bodies | Orchestration logic: activity calls, child workflows, signals, timers, selectors | `go build` | [workflow-def.md](./reference/workflow-def.md), [activity-call.md](./reference/activity-call.md) |
| 3. Activity impl | Thin activity methods + concrete implementations behind interfaces | `go build` | [activity-def.md](./reference/activity-def.md) |
| 4. Worker wiring | `cmd/` entry point: construct dependencies, wire activity struct, register types, start worker | `go build` | [worker.md](./reference/worker.md), [nexus-service-def.md](./reference/nexus-service-def.md) |
| 5. Tests | One happy-path test per workflow using `testsuite.WorkflowTestSuite`. Catches: activity name resolution failures, serialization round-trip issues, update handler races, missing activity options | `go test` | — |
| 6. Final | Full correctness check | `go vet` | — |

After generation: present the code to the user for review.

---

## Activity Implementation Pattern

See [activity-def.md](./reference/activity-def.md#activity-implementation-pattern) for the full pattern (struct, methods, interfaces, concrete implementations).

### Implementation Depth

Activity bodies in `.twf` are pseudocode that may describe richer logic than the generated code implements. When simplifying an activity relative to its TWF description, emit a `// TODO:` comment referencing the elided logic so the gap is visible:

```go
func (a *Activities) ValidateExtraction(ctx context.Context, doc Document) (ValidationResult, error) {
    // TODO: format conformance checks, cross-field consistency, external reference lookups (see TWF)
    if doc.Text == "" {
        return ValidationResult{Valid: false, Reason: "empty text"}, nil
    }
    return ValidationResult{Valid: true}, nil
}
```

For **examples and prototypes**, shallow implementations with `// TODO:` markers are appropriate — the goal is demonstrating workflow orchestration, not domain logic. For **production code**, ask the user which activities need full implementations and which are stubs.

---

## Output Conventions

- Each `.twf` maps to a Go package; Go files live alongside `.twf` sources or where the user specifies
- One file per workflow, shared types file if needed, activity files grouped logically
- One `_test.go` file per workflow (at minimum) with happy-path workflow tests
- Package names derived from `.twf` filename (snake_case)
- Worker entry point in `cmd/`

---

## Reference Index

Read only what the current generation step requires.

### Definitions

| DSL Construct | Go Mapping | File |
|---------------|------------|------|
| `workflow Name(...)` | Workflow function | [workflow-def.md](./reference/workflow-def.md) |
| `activity Name(...)` | Activity function | [activity-def.md](./reference/activity-def.md) |
| `worker Name:` | Worker entry point | [worker.md](./reference/worker.md) |
| `nexus service Name:` | Nexus service + handlers | [nexus-service-def.md](./reference/nexus-service-def.md) |

### Calls

| DSL Construct | Go Mapping | File |
|---------------|------------|------|
| `activity Name(args) -> result` | `workflow.ExecuteActivity` | [activity-call.md](./reference/activity-call.md) |
| `workflow Name(args) -> result` | `workflow.ExecuteChildWorkflow` | [workflow-call.md](./reference/workflow-call.md) |
| `nexus Endpoint Service.Op(args) -> result` | `NexusClient.ExecuteOperation` | [nexus.md](./reference/nexus.md) |

### Handlers

| DSL Construct | Go Mapping | File |
|---------------|------------|------|
| `signal Name(params):` | Signal channel + selector | [signal-handler.md](./reference/signal-handler.md) |
| `query Name(params) -> (Type):` | `workflow.SetQueryHandler` | [query-handler.md](./reference/query-handler.md) |
| `update Name(params) -> (Type):` | `workflow.SetUpdateHandler` | [update-handler.md](./reference/update-handler.md) |

### Async Primitives

| DSL Construct | Go Mapping | File |
|---------------|------------|------|
| `await timer(duration)` | `workflow.Sleep` | [await-timer.md](./reference/await-timer.md) |
| `promise p <- ...` | Future (deferred `.Get`) | [promise.md](./reference/promise.md) |
| `state:` / `condition` / `set` / `unset` | `bool` + `workflow.Await` | [condition.md](./reference/condition.md) |

### Compound Async

| DSL Construct | Go Mapping | File |
|---------------|------------|------|
| `await all:` | `workflow.Go` + futures | [await-all.md](./reference/await-all.md) |
| `await one:` | `workflow.NewSelector` | [await-one.md](./reference/await-one.md) |

### Modifiers & Control Flow

| DSL Construct | Go Mapping | File |
|---------------|------------|------|
| `options: ...` | `ActivityOptions` / `ChildWorkflowOptions` | [options.md](./reference/options.md) |
| `detach workflow ...` | Fire-and-forget child (confirm start, skip result) | [detach.md](./reference/detach.md) |
| `if`/`for`/`switch`/`break`/`continue` | Go equivalents | [control-flow.md](./reference/control-flow.md) |
| `close complete`/`fail`/`continue_as_new` | `return` / `workflow.NewContinueAsNewError` | [close.md](./reference/close.md) |
| `x = expr` | Variable declaration/assignment | [assignment.md](./reference/assignment.md) |
| `heartbeat(details)` | `activity.RecordHeartbeat` | [heartbeat.md](./reference/heartbeat.md) |

### Composite Patterns

| Topic | File |
|-------|------|
| Update + condition + selector, signal + sleep + await | [composite-patterns.md](./reference/composite-patterns.md) |

### Types

| Topic | File |
|-------|------|
| Type resolution strategy | [types.md](./reference/types.md) |
