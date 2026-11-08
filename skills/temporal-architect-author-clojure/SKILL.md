---
name: temporal-architect-author-clojure
description: Generate Clojure code from .twf workflow designs using the community Temporal Clojure SDK (manetu/temporal-clojure-sdk). Use when implementing workflows defined in TWF, producing tested Clojure projects from DSL specifications.
---

# Temporal Architect: Clojure Authoring

Turn `.twf` files into Clojure that loads, runs, and implements the design with the community Temporal Clojure SDK. The deliverable is always `.clj` files.

## Orient

The mapping relies on `io.github.manetu/temporal-sdk` `2.4.1` from Clojars, which wraps `io.temporal:temporal-shaded` `1.40.0` (`project.clj:1,17`), the sdk-java [author-java](../temporal-architect-author-java/SKILL.md) pins, on JDK 21 (the SDK requires 11+, `README.md:34`); on an older minor, check a call shape against that version's source before using it. Paths in this skill are in the SDK's source at `v2.4.1`; sdk-java paths are in `temporal-sdk` (`io/temporal/`) at `v1.40.0`.

The SDK is community-maintained by Manetu, not Temporal. It has no Nexus API: no namespace wraps sdk-java's Nexus calls or handlers, and its only Nexus keys are worker tuning (`src/temporal/client/worker.clj:145-146,155,159`). So every Nexus construct is unsupported in Clojure: it lives on a worker in another SDK.

Settle where the code lands. The project root is the directory whose `project.clj`, `deps.edn` or `pom.xml` depends on `io.github.manetu/temporal-sdk`. In an existing repo its conventions are **requirements to match**; in greenfield, ask. The code is hand-written: no codegen variant is mapped.

For an existing repo, dispatch the design skill's [project-discovery subagent](../temporal-architect-design/subagents/project-discovery.md) on the bounded slice in scope and work from its summary; don't re-scan in the main context. A target spanning several slices goes through the design skill's [reverse decompose](../temporal-architect-design/reference/reverse-engineering.md#decompose-a-large-repo-into-slices) first.

## Wire names

A `.twf` name is the registered name, byte for byte; never rename the `.twf` to fit the code. The SDK registers everything dynamically, one `DynamicWorkflow` per worker (`src/temporal/client/worker.clj:29-35`), so none of sdk-java's interface-derived names apply. Paths below are in `src/temporal/`.

| Construct | Clojure default | Set the `.twf` name by |
|---|---|---|
| workflow | the `defworkflow` var's name verbatim, its namespace dropped; there is no override (`workflow.clj:222-224,243`) | naming the var as the `.twf` does: `(defworkflow Approval …)` |
| activity | the `defactivity` var's name verbatim; there is no override (`activity.clj:255-257,264`) | naming the var as the `.twf` does: `(defactivity ChargeCard …)` |
| signal | the string the sender passes, through `namify`, `(str (symbol x))` (`internal/utils.clj:152-156`, `client/core.clj:152-154`); the handler receives it unchanged (`internal/signals.clj:29-30`) | sending `:Open` or `"Open"` and matching `"Open"` in the handler; never a namespaced `::Open`, which sends `"my.ns/Open"` |
| query | the handler receives `(keyword name)` (`workflow.clj:135`); the caller sends `namify` of its argument (`client/core.clj:194`) | dispatching on `:Status` in the handler, sending `:Status` |
| update | the handler receives `(keyword name)` (`workflow.clj:193`); the caller sends `namify` of its argument (`client/core.clj:218`) | dispatching on `:Review` in the handler, sending `:Review` |
| Nexus service | unsupported: no Nexus API | — |
| Nexus operation | unsupported: no Nexus API | — |

A kebab-case var registers its kebab-case name silently.

Types map by Clojure's own conventions. Read [cross-sdk.md, only where `twf check` reports `CROSS_SDK_CALL`](../temporal-architect/reference/cross-sdk.md).

## Delegation

This skill owns the `.twf` ↔ Clojure translation: call shapes, wire names, options, project layout, verify. Encodings, error-handling minutiae, and SDK idioms sit below 10,000 ft: decide them in code, never in the `.twf`. Temporal's official `temporal-developer` skill has no Clojure coverage, so how to write Clojure Temporal code well belongs to the SDK's own `doc/` at `v2.4.1`, and, where the SDK passes through to sdk-java, to [author-java's Delegation](../temporal-architect-author-java/SKILL.md#delegation):

| Topic | Source |
|---|---|
| worker setup | [`doc/workers.md` § How to start a Worker](https://github.com/manetu/temporal-clojure-sdk/blob/v2.4.1/doc/workers.md#how-to-start-a-worker) |
| testing | [`doc/testing.md`](https://github.com/manetu/temporal-clojure-sdk/blob/v2.4.1/doc/testing.md), [`doc/replay_testing.md`](https://github.com/manetu/temporal-clojure-sdk/blob/v2.4.1/doc/replay_testing.md) |
| determinism | [`doc/workflows.md` § Workflow Implementation Constraints](https://github.com/manetu/temporal-clojure-sdk/blob/v2.4.1/doc/workflows.md#workflow-implementation-constraints), [§ Promises](https://github.com/manetu/temporal-clojure-sdk/blob/v2.4.1/doc/workflows.md#promises); the runner is sdk-java's (`src/temporal/client/worker.clj:29-35`): author-java |
| errors | [`doc/workflows.md` § Exceptions](https://github.com/manetu/temporal-clojure-sdk/blob/v2.4.1/doc/workflows.md#exceptions); a stone crosses as sdk-java's `ApplicationFailure` (`src/temporal/internal/exceptions.clj:34-38`): author-java |
| data | [types.md](./reference/types.md): the default converter is Nippy (`src/temporal/converter/default.clj:15-18`), which the SDK does not document |
| versioning | [`doc/workflows.md` § Versioning](https://github.com/manetu/temporal-clojure-sdk/blob/v2.4.1/doc/workflows.md#versioning), [`doc/replay_testing.md` § Connection to versioning](https://github.com/manetu/temporal-clojure-sdk/blob/v2.4.1/doc/replay_testing.md#connection-to-versioning) |

In a test, read a result through the stub, `(.getResult (:stub wf) 60 TimeUnit/SECONDS Object)`, not `@(c/get-result wf)`: the SDK chains the result future (`src/temporal/client/core.clj:173-177`), so the test server cannot skip time while it waits.

## Process

Root-down: roots (workflows no other workflow calls as a child) → children → activities → types. Each layer is constrained by the one above; defer unknowns and revisit. Write only what is needed: no speculative fields, types, or files — the minimum bridge from DSL intent to working Clojure.

**The user decides what is consequential.** Do mechanical mappings, SDK boilerplate, and type fixes yourself. Surface dependency choices, ambiguous domain logic, and architectural direction as specific options with tradeoffs, never open questions — e.g. "ChargePayment: the `stripe-java` library through interop (official, matches your existing dependency) or `hato` (idiomatic Clojure HTTP, more boilerplate)?" Revising a confirmed decision always needs the user's approval.

### 1. Gather and plan

- Read the `.twf` files in scope, the project file, and existing code (or the discovery summary); ask brief, targeted questions about domain and key dependencies.
- **Prefer imports over generation**: use well-known libraries when types match; generate only application-specific types.
- **Resolve dependencies**: the user confirms the dependency map before generation.
- Plan the root-down order, check the map against the planned signatures, and name what is deferred or ambiguous.

### 2. Generate and verify by layer

Clojure compiles on load, so each layer's check is [Verify](#verify), whose test run loads every namespace it requires.

| Layer | What | Check |
|-------|------|-------|
| 1a. Types + signatures | Plain maps with kebab-case keyword keys for user types; each `defworkflow` with its one params map and a stub body | [Verify](#verify) |
| 1b. Activity stubs | Every `defactivity` with its real params map, so workflows call it through `a/invoke` | [Verify](#verify) |
| 2. Workflow bodies | Activity and child calls, signals, timers, races | [Verify](#verify) |
| 3. Activity impl | Bodies, with dependencies taken from the worker's `:ctx`, which each activity receives first (`src/temporal/client/worker.clj:19,28`) | [Verify](#verify) |
| 4. Worker wiring | Each worker's options map in `workers.clj`; the process builds dependencies into `:ctx` and calls `worker/start` (`src/temporal/client/worker.clj:168-188`) | [Verify](#verify), `twf check` |
| 5. Tests | Floor: one happy-path `clojure.test` per workflow under `temporal.testing.env`, sdk-java's time-skipping `TestWorkflowEnvironment` (`src/temporal/testing/env.clj:58-62`; `temporal-testing` `TestEnvironmentOptions.java:55`), since designs wait minutes to hours, its worker started from the options map with `e/start` | [Verify](#verify) |
| 6. Final | | [Verify](#verify) |

Then present the code for review.

**Implementation depth.** `.twf` activity bodies are pseudocode and may describe more than you implement. Where you simplify, leave a `;; TODO:` naming the elided logic (e.g. `;; TODO: cross-field consistency checks (see TWF)`). Shallow bodies suit examples and prototypes; for production, ask which activities need full implementations.

## Verify

From the project root, the one line for its project file:

```sh
lein test          # project.clj
clojure -X:test    # deps.edn, with a :test alias that runs clojure.test
mvn verify         # pom.xml, with clojure-maven-plugin's test goal bound
```

## Output conventions

- One Clojure namespace per concern (a workflow with its handlers, an activity set, the worker maps), under one namespace prefix per `.twf` package; each file's path matches its namespace, with `-` as `_`.
- A `workers.clj` holds each `.twf` worker's options map, named for the worker (`(def approval-types {:task-queue "approvals" :dispatch {:workflows [Approval] :activities [Count]}})`), shared by the worker process and the tests. The `:dispatch` is always explicit: without it, every `defworkflow` and `defactivity` loaded in the JVM registers on that worker (`src/temporal/client/worker.clj:22-26`). Its `@sdk(clojure, "<path>")` names that file, from the directory of the nearest `twf.mod`, else the `.twf` file's directory, e.g. `@sdk(clojure, "src/approvals/workers.clj")`.

## Reference index

Load only what the current layer needs.

| DSL | Clojure | File |
|-----|---------|------|
| `workflow Name(...)` | `defworkflow` named as the `.twf`, taking one params map | [workflow-def.md](./reference/workflow-def.md) |
| `id_scheme: "..."` | one ID function beside the workflow, its value the full workflow ID | [workflow-def.md](./reference/workflow-def.md#id_scheme) |
| `workflow_id_reuse_policy` / `workflow_id_conflict_policy` | start-options map; child gets reuse only | [options.md](./reference/options.md#workflow-id-policies) |
| `activity Name(...)` | `defactivity` named as the `.twf`, taking the worker's `:ctx` and one params map | [activity-def.md](./reference/activity-def.md) |
| types (`int`, `time`, `bytes`, …), user types | what Nippy round-trips; maps with kebab-case keyword keys | [types.md](./reference/types.md) |
| activity dependencies | dependency map, confirmed from the resolved artifact; keys of `:ctx` | [dependency-resolution.md](./reference/dependency-resolution.md) |
| `worker`, namespace worker `options:` | one options map with an explicit `:dispatch` in `workers.clj`, `worker/start` | [worker.md](./reference/worker.md) |
| `nexus service Name:`, `async` / `sync` operations | unsupported | [nexus-service-def.md](./reference/nexus-service-def.md) |
| `activity Name(args) -> r` | `@(a/invoke Name params opts)` | [activity-call.md](./reference/activity-call.md) |
| `workflow Name(args) -> r` | `@(w/invoke Name params opts)` | [workflow-call.md](./reference/workflow-call.md) |
| `detach workflow ...` / `detach nexus ...` | untyped child stub with `ABANDON`, wait for `getExecution` / unsupported | [detach.md](./reference/detach.md) |
| `nexus Endpoint Service.Op(args) -> r` | unsupported | [nexus.md](./reference/nexus.md) |
| `signal handle.Name(args)` / `signal Type.Name(args)` + `id:` | the untyped child stub's `.signal` / `s/>!`, `w/signal-external` | [signal-send.md](./reference/signal-send.md) |
| `await timer(d)` | `w/sleep` | [await-timer.md](./reference/await-timer.md) |
| `options:` / `default_options:` | an options map per call; `merge` overrides a default | [options.md](./reference/options.md) |
| `if` / `for` / `switch` / `break` / `continue`, `x = expr` | Clojure equivalents | [control-flow.md](./reference/control-flow.md) |
| `close complete` / `fail` / `continue_as_new` | the body's value / `throw+` / `w/continue-as-new` | [close.md](./reference/close.md) |
| `heartbeat(details)` | `a/heartbeat` | [heartbeat.md](./reference/heartbeat.md) |

The spec states only what `detach` guarantees (`twf spec statement-syntax`); the author maps it to these mechanics:

- **`detach workflow`**: `w/invoke` returns only the result promise (`src/temporal/workflow.clj:311-321`), so the start goes through sdk-java interop: `Workflow/newUntypedChildWorkflowStub` with the `.twf` name and `ChildWorkflowOptions` that set `.setParentClosePolicy ParentClosePolicy/PARENT_CLOSE_POLICY_ABANDON` and `.setCancellationType ChildWorkflowCancellationType/ABANDON`, so neither the caller's close nor its cancellation reaches the child (`workflow/ChildWorkflowOptions.java:228,278`, `workflow/ChildWorkflowCancellationType.java:33`); `.executeAsync`, then `(.get (.getExecution stub))`, which resolves once the child starts, so a failed start fails the caller (`workflow/ChildWorkflowStub.java:43-48`). A client start just starts. Neither reads the result.
- **`detach nexus`**: unsupported: the SDK has no Nexus API.
