---
name: temporal-architect-author-ruby
description: Generate Ruby code from .twf workflow designs using the Temporal Ruby SDK. Use when implementing workflows defined in TWF, producing syntax-checked and tested Ruby projects from DSL specifications.
---

# Temporal Architect: Ruby Authoring

Turn `.twf` files into Ruby that loads, runs, and implements the design with the Temporal Ruby SDK. The deliverable is always `.rb` files.

## Orient

The mapping relies on Ruby SDK `temporalio` `1.10.1` on Ruby 3.4 (the gem requires `>= 3.3`, `temporalio.gemspec:26`), with Bundler and Minitest, as the corpus pins them; on an older minor, check a call shape against that version's source before using it.

Ruby calls Nexus but cannot serve it. The caller is experimental: every Nexus file says "Nexus support is experimental" (`workflow.rb:49`, `workflow/nexus_client.rb:9`). There is no Nexus handler: `Worker.new` takes no service handlers and starts its worker with `enable_nexus: false` (`worker.rb:463-497,591`). So a `nexus service`, its `sync` and `async` bodies, and the worker options `max_concurrent_nexus_task_executions` and `max_concurrent_nexus_task_pollers` are unsupported in Ruby: they live on a worker in another SDK.

Settle where the code lands. The project root is the directory whose `Gemfile` depends on `temporalio`. In an existing repo its conventions are **requirements to match**; in greenfield, ask. The code is hand-written: no codegen variant is mapped.

For an existing repo, dispatch the design skill's [project-discovery subagent](../temporal-architect-design/subagents/project-discovery.md) on the bounded slice in scope and work from its summary; don't re-scan in the main context. A target spanning several slices goes through the design skill's [reverse decompose](../temporal-architect-design/reference/reverse-engineering.md#decompose-a-large-repo-into-slices) first.

## Wire names

A `.twf` name is the registered name, byte for byte; never rename the `.twf` to fit the code. Paths below are in `temporalio` source (`lib/temporalio/`).

| Construct | Ruby default | Set the `.twf` name by |
|---|---|---|
| workflow | the `Workflow::Definition` subclass's unqualified class name (`workflow/definition.rb:14,552`) | naming the class as the `.twf` does, with `workflow_name` unset |
| activity | the `Activity::Definition` subclass's unqualified class name (`activity/definition.rb:15,109`) | naming the class as the `.twf` does, with `activity_name` unset |
| signal | the method name (`workflow/definition.rb:303`) | `workflow_signal name: '…'` |
| query | the method name (`workflow/definition.rb:312`); `workflow_query_attr_reader` takes no `name:` (`:92`) | `workflow_query name: '…'` on an explicit method |
| update | the method name (`workflow/definition.rb:321`) | `workflow_update name: '…'` |
| Nexus service | the caller's string (`workflow.rb:54`) | `create_nexus_client(endpoint: '…', service: '…')` with the `.twf` names; no handler (`worker.rb:591`) |
| Nexus operation | the caller's string (`workflow/nexus_client.rb:41,74`) | `execute_operation('…', arg)` / `start_operation('…', arg)`; no handler |

Set `name:` on every signal, query and update handler, which Ruby names in snake_case; never on workflow and activity classes, which are PascalCase in both, and which a wrapping `module` does not rename. A missing `name:` registers the Ruby method name silently.

Types map by Ruby's own conventions. Read [cross-sdk.md, only where `twf check` reports `CROSS_SDK_CALL`](../temporal-architect/reference/cross-sdk.md).

## Delegation

This skill owns the `.twf` ↔ Ruby translation: call shapes, wire names, options, project layout, verify. Encodings, error-handling minutiae, and SDK idioms sit below 10,000 ft: decide them in code, never in the `.twf`. How to write Ruby Temporal code well belongs to Temporal's official `temporal-developer` skill, pinned at `v0.6.3`; load it for these topics:

| Topic | `temporal-developer` |
|---|---|
| worker setup | `references/ruby/ruby.md` § Worker Setup, § File Organization Best Practice, `gotchas.md` § File Organization, `advanced-features.md` § Activity Concurrency and Executors, § Rails Integration |
| testing | `references/ruby/testing.md` |
| determinism | `references/ruby/determinism.md`, `determinism-protection.md` |
| errors | `references/ruby/error-handling.md` |
| data | `references/ruby/data-handling.md` |
| versioning | `references/ruby/versioning.md` |

If it is not installed, install it from https://github.com/temporalio/skill-temporal-developer at `v0.6.3`, or read the topic's file there.

The corpus uses `WorkflowEnvironment.start_time_skipping` throughout, not `start_local` (`testing.md` leads with it), since designs wait minutes to hours; each test starts its own.

## Process

Root-down: roots (workflows no other workflow calls as a child) → children → activities → types. Each layer is constrained by the one above; defer unknowns and revisit. Write only what is needed: no speculative fields, types, or files — the minimum bridge from DSL intent to working Ruby.

**The user decides what is consequential.** Do mechanical mappings, SDK boilerplate, and type fixes yourself. Surface dependency choices, ambiguous domain logic, and architectural direction as specific options with tradeoffs, never open questions — e.g. "ChargePayment: the `stripe` gem (official, matches your existing dependency) or plain `Net::HTTP` (flexible, more boilerplate)?" Revising a confirmed decision always needs the user's approval.

### 1. Gather and plan

- Read the `.twf` files in scope, the `Gemfile`, and existing code (or the discovery summary); ask brief, targeted questions about domain and key dependencies.
- **Prefer imports over generation**: use well-known gems when types match; generate only application-specific types.
- **Resolve dependencies**: the user confirms the dependency map before generation.
- Plan the root-down order, check the map against the planned signatures, and name what is deferred or ambiguous.

### 2. Generate and verify by layer

Ruby has no type checker here: each layer's check is `ruby -wc` on every file it touched, and the tests carry the rest.

| Layer | What | Check |
|-------|------|-------|
| 1a. Types + signatures | `Data` types and `Workflow::Definition` classes with stub `execute` methods; shaped by the dependency map | `ruby -wc` |
| 1b. Activity stubs | Every `Activity::Definition` class with its real `execute` signature, so workflows call it through `Workflow.execute_activity` | `ruby -wc` |
| 2. Workflow bodies | Activity and child calls, signals, timers, races | `ruby -wc` |
| 3. Activity impl | Thin `execute` methods + concrete implementations passed to `initialize`; the worker registers instances (`worker.rb:381`) | `ruby -wc` |
| 4. Worker wiring | Each worker's factory method; the process builds dependencies, calls it, and runs the `Worker` | `ruby -wc`, `twf check` |
| 5. Tests | Floor: one happy-path Minitest test per workflow under `WorkflowEnvironment.start_time_skipping` (`testing/workflow_environment.rb:154`), its worker built from the factory method | `bundle exec ruby -e …` ([Verify](#verify)) |
| 6. Final | | [Verify](#verify) |

Then present the code for review.

**Implementation depth.** `.twf` activity bodies are pseudocode and may describe more than you implement. Where you simplify, leave a `# TODO:` naming the elided logic (e.g. `# TODO: cross-field consistency checks (see TWF)`). Shallow bodies suit examples and prototypes; for production, ask which activities need full implementations.

## Verify

From the worker's Ruby directory, under the `Gemfile` that pins `temporalio`:

```sh
printf '%s\n' *.rb | xargs -n1 ruby -wc >/dev/null && bundle exec ruby -e 'Dir["*_test.rb"].sort.each { |f| require File.expand_path(f) }'
```

## Output conventions

- One Ruby `module` per `.twf` package, wrapping every file of that package's directory; files load each other with `require_relative`.
- Each `.twf` worker's `worker.rb` defines a factory method named for the worker (`def self.approval_types(client)`), returning the `Temporalio::Worker.new(client:, task_queue:, workflows: […], activities: […])` (`worker.rb:463`), shared by the worker process (`if __FILE__ == $PROGRAM_NAME`) and the tests. Its `@sdk(ruby, "<path>")` names that file, from the directory of the nearest `twf.mod`, else the `.twf` file's directory, e.g. `@sdk(ruby, "ruby/worker.rb")`.

## Reference index

Load only what the current layer needs.

| DSL | Ruby | File |
|-----|------|------|
| `workflow Name(...)` | `Workflow::Definition` subclass with `execute`; state in `initialize` | [workflow-def.md](./reference/workflow-def.md) |
| `id_scheme: "..."` | ID method, called by every start and sender | [workflow-def.md](./reference/workflow-def.md#id_scheme) |
| `workflow_id_reuse_policy` / `workflow_id_conflict_policy` | start options; child gets reuse only | [options.md](./reference/options.md#workflow-id-policies) |
| `activity Name(...)` | `Activity::Definition` subclass with `execute`, dependencies through `initialize` | [activity-def.md](./reference/activity-def.md) |
| types (`int`, `time`, `bytes`, …), user types | what the default JSON converter writes; `Data` with `to_json` / `from_h` | [types.md](./reference/types.md) |
| activity dependencies | dependency map, confirmed from the resolved gem | [dependency-resolution.md](./reference/dependency-resolution.md) |
| `worker`, namespace worker `options:` | factory method in `worker.rb`, `Worker.new` keywords | [worker.md](./reference/worker.md) |
| `nexus service Name:`, `async` / `sync` operations | unsupported: no Nexus handler | [nexus-service-def.md](./reference/nexus-service-def.md) |
| `activity Name(args) -> r` | `Workflow.execute_activity` | [activity-call.md](./reference/activity-call.md) |
| `workflow Name(args) -> r` | `Workflow.execute_child_workflow` | [workflow-call.md](./reference/workflow-call.md) |
| `detach workflow ...` / `detach nexus ...` | `start_child_workflow` / `start_operation` with `ABANDON`, result never read | [detach.md](./reference/detach.md) |
| `nexus Endpoint Service.Op(args) -> r` | `Workflow.create_nexus_client(...).execute_operation` (experimental) | [nexus.md](./reference/nexus.md) |
| `signal Name(params):` | `workflow_signal name:` method: body, then `arrivals.add` | [signal-handler.md](./reference/signal-handler.md) |
| `query Name(params) -> (T):` | `workflow_query name:` method | [query-handler.md](./reference/query-handler.md) |
| `update Name(params) -> (T):` | `workflow_update name:` method: body, then `arrivals.add`, then the result | [update-handler.md](./reference/update-handler.md) |
| `await signal\|update Name -> (...)` | `arrivals.take_now` | [await-signal.md](./reference/await-signal.md) |
| `promise p <- ...` | a `Workflow::Future`; for a signal or update, `arrivals.take` | [promise.md](./reference/promise.md) |
| `state:` / `condition` / `set` / `unset` | instance variable + `Workflow.wait_condition` | [condition.md](./reference/condition.md) |
| `await all:` | `Workflow::Future.all_of(...).wait` | [await-all.md](./reference/await-all.md) |
| `await one:` | one `wait_condition` over every case; first listed ready wins | [await-one.md](./reference/await-one.md) |
| handler + condition + `await one` | worked compositions | [composite-patterns.md](./reference/composite-patterns.md) |
| `signal handle.Name(args)` / `signal Type.Name(args)` + `id:` | `ChildWorkflowHandle#signal` / `Workflow.external_workflow_handle(...).signal` | [signal-send.md](./reference/signal-send.md) |
| `await timer(d)` | `Workflow.sleep` | [await-timer.md](./reference/await-timer.md) |
| `options:` / `default_options:` | the call's keyword arguments, in Float seconds; a frozen `Hash` splatted with `**` | [options.md](./reference/options.md) |
| `if` / `for` / `switch` / `break` / `continue`, `x = expr` | Ruby equivalents | [control-flow.md](./reference/control-flow.md) |
| `close complete` / `fail` / `continue_as_new` | `return` / `raise Error::ApplicationError` / `raise Workflow::ContinueAsNewError` | [close.md](./reference/close.md) |
| `heartbeat(details)` | `Activity::Context.current.heartbeat` | [heartbeat.md](./reference/heartbeat.md) |

The spec states only what `detach` guarantees (`twf spec statement-syntax`); the author maps it to these mechanics:

- **`detach workflow`**: a child start is `Workflow.start_child_workflow(W, arg, id: …, parent_close_policy: Workflow::ParentClosePolicy::ABANDON, cancellation_type: Workflow::ChildWorkflowCancellationType::ABANDON)`, so neither the caller's close nor its cancellation reaches the child (`workflow/parent_close_policy.rb:14`, `workflow/child_workflow_cancellation_type.rb:10`); it returns once the child starts, so a failed start raises in the caller (`internal/worker/workflow_instance/outbound_implementation.rb:395-434`). A client start just starts. Neither reads the handle's `result`.
- **`detach nexus`** (experimental, `workflow/nexus_operation_cancellation_type.rb:9`): `client.start_operation('Op', arg, cancellation_type: Workflow::NexusOperationCancellationType::ABANDON)` (`workflow/nexus_client.rb:41-52`, `workflow/nexus_operation_cancellation_type.rb:15`), which returns once the operation starts (a sync operation starts by completing) and raises on a failed start (`internal/worker/workflow_instance/outbound_implementation.rb:494-512`), and never reads the handle's `result` (`workflow/nexus_operation_handle.rb:32`). After the caller closes, the operation's completion callback to it fails and is dropped.
