---
name: temporal-architect-author-elixir
description: Generate Elixir code from .twf workflow designs using the community Erlang/Elixir SDK (andrzej-mag/temporal_sdk). Use when implementing workflows defined in TWF, producing compiled and tested Elixir projects from DSL specifications.
---

# Temporal Architect: Elixir Authoring

Turn `.twf` files into Elixir that compiles, runs, and implements the design with the community Erlang/Elixir SDK. The deliverable is always `.ex` files.

## Orient

The mapping relies on [`temporal_sdk`](https://github.com/andrzej-mag/temporal_sdk) at `main` commit `d2749c7`, as a mix git dependency (`{:temporal_sdk, git: "https://github.com/andrzej-mag/temporal_sdk", ref: "d2749c77a74032f466345f476861a59180086fbd"}`), on OTP 28 and Elixir 1.19.7 (the SDK requires OTP 27+ and Elixir `~> 1.17`, `rebar.config:3`, `mix.exs:20`), built with mix, as the corpus pins them; at another commit, check a call shape against that commit's source before using it. Paths in this skill are in the SDK's source at `d2749c7`, under `src/` except root files and `lib/` and `test/` paths.

The licence is MIT at the pinned commit (`LICENSE.txt:1`, `README.md:145`), while every released Hex 0.2.x is BUSL-1.1 (`LICENSE.txt:1` at `v0.2.20`). So never install the Hex release, though the SDK's own quick start does (`README.md:64-69`).

The SDK is community-maintained, not an official Temporal SDK (`README.md:8`), and this skill supports it at Tier 3: a partial target. The engine is Erlang, wrapped by generated Elixir modules (`lib/temporal_sdk/temporal_sdk_workflow.ex:1-12`), so the paths below are `.erl`. It has no test server, so verification needs a Temporal dev server (`temporal server start-dev`), which the SDK's own suites also run against (`test/bin/temporal_namespace.sh`).

Unsupported at the pin, each documented in its own reference: updates ([update-handler.md](./reference/update-handler.md)), all of Nexus ([nexus.md](./reference/nexus.md)), in-workflow signal send ([signal-send.md](./reference/signal-send.md)), versioning ([idioms.md](./reference/idioms.md#versioning)), and signal `unfinished_policy`/`description` ([signal-handler.md](./reference/signal-handler.md)).

Settle where the code lands. The project root is the directory whose `mix.exs` depends on `:temporal_sdk`. In an existing repo its conventions are **requirements to match**; in greenfield, ask. The code is hand-written: no codegen variant is mapped.

For an existing repo, dispatch the design skill's [project-discovery subagent](../temporal-architect-design/subagents/project-discovery.md) on the bounded slice in scope and work from its summary; don't re-scan in the main context. A target spanning several slices goes through the design skill's [reverse decompose](../temporal-architect-design/reference/reverse-engineering.md#decompose-a-large-repo-into-slices) first.

## Wire names

A `.twf` name is the registered name, byte for byte; never rename the `.twf` to fit the code.

| Construct | Elixir default | Set the `.twf` name by |
|---|---|---|
| workflow | the module atom's name, `"Elixir.Orders.ProcessOrder"`: a worker resolves a type name with `binary_to_existing_atom` (`api/temporal_sdk_api.erl:595-599`) and serves every name unless restricted (`worker/temporal_sdk_worker_opts.erl:140-142`) | the worker's `temporal_name_to_erlang` mapping the `.twf` name to the module, with `allowed_temporal_names` listing the `.twf` names (`worker/temporal_sdk_worker.erl:39-41,186-196`); callers pass the `.twf` name as a string, `start_child_workflow(tq, "Audit", …)`, since an atom becomes its module name (`temporal_sdk/temporal_sdk_workflow.erl:2058-2059`) |
| activity | the module atom's name, as for a workflow (`api/temporal_sdk_api.erl:595-599`) | the same worker mapping; callers pass the `.twf` name as a string, `start_activity("Count", …)` (`temporal_sdk/temporal_sdk_workflow.erl:1769-1771`) |
| signal | the string the workflow awaits, `{:signal_request, "Approve"}`, and the client sends, unchanged (`temporal_sdk/temporal_sdk_workflow.erl:1210`, `temporal_sdk/temporal_sdk.erl:1363`) | writing the `.twf` name as that string |
| query | the string the workflow awaits, `{:query_request, "Status"}`, and the client sends, unchanged (`temporal_sdk/temporal_sdk_workflow.erl:1245`, `temporal_sdk/temporal_sdk.erl:1274`) | writing the `.twf` name as that string |
| update | unsupported: no handler or client call (`temporal_sdk/temporal_sdk_workflow.erl:47`, `temporal_sdk/temporal_sdk.erl:45`) | — |
| Nexus service | unsupported: Nexus is not implemented (`TODO.md:15`) | — |
| Nexus operation | unsupported: Nexus is not implemented (`TODO.md:15`) | — |

A worker left on the default mapping finds no module for a `.twf` name like `Approval` and fails the task (`api/temporal_sdk_api.erl:600-607`), so every worker sets both options.

Types map by the BEAM's own conventions. Read [cross-sdk.md, only where `twf check` reports `CROSS_SDK_CALL`](../temporal-architect/reference/cross-sdk.md).

## Delegation

This skill owns the `.twf` ↔ Elixir translation: call shapes, wire names, options, project layout, verify. Encodings, error-handling minutiae, and SDK idioms sit below 10,000 ft: decide them in code, never in the `.twf`. Temporal's official `temporal-developer` skill has no Erlang or Elixir coverage, so how to write Temporal Elixir well belongs to the SDK's own hexdocs and `temporal_sdk_samples` at the pin, which [idioms.md](./reference/idioms.md) links by topic:

| Topic | Source |
|---|---|
| worker setup | [idioms.md § worker setup](./reference/idioms.md#worker-setup) |
| testing | [idioms.md § testing](./reference/idioms.md#testing) |
| determinism | [idioms.md § determinism](./reference/idioms.md#determinism) |
| errors | [idioms.md § errors](./reference/idioms.md#errors) |
| data | [idioms.md § data](./reference/idioms.md#data) |
| versioning | [idioms.md § versioning](./reference/idioms.md#versioning) |

## Process

Root-down: roots (workflows no other workflow calls as a child) → children → activities → types. Each layer is constrained by the one above; defer unknowns and revisit. Write only what is needed: no speculative fields, types, or files — the minimum bridge from DSL intent to working Elixir.

**The user decides what is consequential.** Do mechanical mappings, SDK boilerplate, and type fixes yourself. Surface dependency choices, ambiguous domain logic, and architectural direction as specific options with tradeoffs, never open questions — e.g. "ChargePayment: the `stripity_stripe` library (matches your existing dependency) or plain `Req` (one HTTP client, more boilerplate)?" Revising a confirmed decision always needs the user's approval.

### 1. Gather and plan

- Read the `.twf` files in scope, `mix.exs`, and existing code (or the discovery summary); ask brief, targeted questions about domain and key dependencies.
- **Prefer imports over generation**: use well-known Hex packages when types match; generate only application-specific types.
- **Resolve dependencies**: the user confirms the dependency map before generation.
- Plan the root-down order, check the map against the planned signatures, and name what is deferred or ambiguous.

### 2. Generate and verify by layer

`mix.exs` sets `elixirc_options: [warnings_as_errors: true]`, so `mix compile` is each layer's static check.

| Layer | What | Check |
|-------|------|-------|
| 1a. Types + signatures | Each workflow module, `use TemporalSdk.Workflow`, with a stub `execute(context, input)`, whose input is the list of decoded payloads (`temporal_sdk/temporal_sdk_workflow.erl:1581`); shaped by the dependency map | `mix compile` |
| 1b. Activity stubs | Every activity module, `use TemporalSdk.Activity`, with its real `execute(context, input)` (`temporal_sdk/temporal_sdk_activity.erl:95`), so workflows call it through `start_activity("Name", input, opts)` | `mix compile` |
| 2. Workflow bodies | Activity and child calls, signals, timers, races | `mix compile` |
| 3. Activity impl | Bodies, with concrete implementations behind the activity modules | `mix compile` |
| 4. Worker wiring | Each worker's `start_<worker>(task_queue)` in `workers.ex`; the process starts its cluster, then calls it | `mix compile`, `twf check` |
| 5. Tests | Floor: one happy-path ExUnit test per workflow against a dev server, its worker started with `start_<worker>` on the test's own task queue. Waits are real, so a long design timer is tested with a short test-only one. Every start passes `opentelemetry: false`: the default turns tracing on (`temporal_sdk/temporal_sdk.erl:78-80,609`), and without the `opentelemetry` SDK application every workflow task fails (`executor/temporal_sdk_executor_workflow.erl:815`) | [Verify](#verify) |
| 6. Final | | [Verify](#verify) |

Then present the code for review.

**Implementation depth.** `.twf` activity bodies are pseudocode and may describe more than you implement. Where you simplify, leave a `# TODO:` naming the elided logic (e.g. `# TODO: cross-field consistency checks (see TWF)`). Shallow bodies suit examples and prototypes; for production, ask which activities need full implementations.

## Verify

From the project root, with a dev server up:

```sh
MIX_ENV=test mix deps.get --check-locked && mix compile && mix test
```

## Output conventions

- One Elixir namespace per `.twf` package (`Orders.ProcessOrder` in `orders/process_order.ex`); one module per workflow or activity.
- A `workers.ex` per `.twf` worker holds its name→module map (`%{"Approval" => Approvals.Approval}`) and `start_<worker>(task_queue)`, which starts a workflow and an activity worker with `:temporal_sdk_worker.start(cluster, :workflow | :activity, opts)` (`worker/temporal_sdk_worker.erl:453`), passing the map as `temporal_name_to_erlang` and its keys as `allowed_temporal_names`. The worker process and the tests share it. Its `@sdk(elixir, "<path>")` names that file, from the directory of the nearest `twf.mod`, else the `.twf` file's directory, e.g. `@sdk(elixir, "elixir/workers.ex")`.

## Reference index

Load only what the current layer needs.

| DSL | Elixir | File |
|-----|--------|------|
| `workflow Name(...)` | a `use TemporalSdk.Workflow` module whose `execute(context, input)` takes the positional payload list | [workflow-def.md](./reference/workflow-def.md) |
| `id_scheme: "..."` | one ID function on the workflow's module, called by every start | [workflow-def.md](./reference/workflow-def.md#id_scheme) |
| `workflow_id_reuse_policy` / `workflow_id_conflict_policy` | start-options function; child gets reuse only | [options.md](./reference/options.md#workflow-id-policies) |
| `activity Name(...)` | a `use TemporalSdk.Activity` module whose `execute/2` returns the result's payload list | [activity-def.md](./reference/activity-def.md) |
| types (`int`, `time`, `bytes`, …), user types | what the default codec chain round-trips; maps with string keys, `:null` | [types.md](./reference/types.md) |
| activity dependencies | dependency map, confirmed from the locked version | [dependency-resolution.md](./reference/dependency-resolution.md) |
| `worker`, namespace worker `options:` | name→module maps and `start_<worker>` in `workers.ex`, `TemporalSdk.Worker.start/3` | [worker.md](./reference/worker.md) |
| `nexus service Name:`, `async` / `sync` operations | unsupported | [nexus-service-def.md](./reference/nexus-service-def.md) |
| `activity Name(args) -> r` | `start_activity("Name", [args], opts ++ [wait: true])`, matched on `:completed` | [activity-call.md](./reference/activity-call.md) |
| `workflow Name(args) -> r` | `start_child_workflow(task_queue, "Name", input: [args], workflow_id: …, wait: true)` | [workflow-call.md](./reference/workflow-call.md) |
| `detach workflow ...` / `detach nexus ...` | child with `ABANDON`, `awaitable_event: :start`, `await_open_before_close(false)` / unsupported | [detach.md](./reference/detach.md) |
| `nexus Endpoint Service.Op(args) -> r` | unsupported | [nexus.md](./reference/nexus.md) |
| `signal Name(params):` | `Arrivals.on("Name", body)`: the body runs per arrival at sync | [signal-handler.md](./reference/signal-handler.md) |
| `query Name(params) -> (T):` | a `start_execution` answering `{:query_request, "Name"}` from `set_info` state; `handle_query/2` for a closed run | [query-handler.md](./reference/query-handler.md) |
| `update Name(params) -> (T):` | unsupported | [update-handler.md](./reference/update-handler.md) |
| `await signal Name -> (...)` | `Arrivals.take("Name")` | [await-signal.md](./reference/await-signal.md) |
| `promise p <- ...` | the call's handle, awaited with `wait(p)`; for a signal, `Arrivals.promise("Name")` | [promise.md](./reference/promise.md) |
| `state:` / `condition` / `set` / `unset` | process-dictionary state in the main execution, awaited on the signals that set it | [condition.md](./reference/condition.md) |
| `await all:` | `wait_all([...])` | [await-all.md](./reference/await-all.md) |
| `await one:` | `Arrivals.first` over every case: earliest workflow task, then first listed | [await-one.md](./reference/await-one.md) |
| handler + condition + `await one` | worked compositions | [composite-patterns.md](./reference/composite-patterns.md) |
| `signal handle.Name(args)` / `signal Type.Name(args)` + `id:` | unsupported | [signal-send.md](./reference/signal-send.md) |
| `await timer(d)` | `start_timer(d, [:wait])` | [await-timer.md](./reference/await-timer.md) |
| `options:` / `default_options:` | the call's keyword list; `Keyword.merge` overrides a default | [options.md](./reference/options.md) |
| `if` / `for` / `switch` / `break` / `continue`, `x = expr` | `if`, `Enum`, recursion, `case`, `reduce_while` | [control-flow.md](./reference/control-flow.md) |
| `close complete` / `fail` / `continue_as_new` | `complete_workflow_execution` / `fail_workflow_execution` / `continue_as_new_workflow` | [close.md](./reference/close.md) |
| `heartbeat(details)` | `heartbeat([details])`, with `handle_heartbeat/1` and `handle_cancel/1` | [heartbeat.md](./reference/heartbeat.md) |

The spec states only what `detach` guarantees (`twf spec statement-syntax`); the author maps it to these mechanics:

- **`detach workflow`**: `start_child_workflow(task_queue, "W", input: [...], workflow_id: …, parent_close_policy: :PARENT_CLOSE_POLICY_ABANDON, awaitable_event: :start, wait: true)` (`temporal_sdk/temporal_sdk_workflow.erl:261-286`), which returns at the child's start, its failed start, or a later state the child has already reached (`api/awaitable/temporal_sdk_api_awaitable_index.erl:343-352`). On `:initiate_failed`, close with `fail_workflow_execution(…)` (`temporal_sdk/temporal_sdk_workflow.erl:2236-2240`), so a failed start fails the caller; any other state means the child started. A failed match would raise, and a raise fails only the workflow task, which the server retries while the caller stays open (`executor/temporal_sdk_executor_workflow.erl:1370-1386,2256-2290`). Then `await_open_before_close(false)` (`temporal_sdk/temporal_sdk_workflow.erl:2883-2884`), since the default holds the caller's close until every open child closes (`executor/temporal_sdk_executor_workflow.erl:1106-1110`). Cancellation never reaches the child: the SDK has no command that cancels a child or an external workflow (`temporal_sdk/temporal_sdk_workflow.erl:32`). A client start just starts. Neither reads the result.
- **`detach nexus`**: unsupported: Nexus is not implemented (`TODO.md:15`), and there is no `cancel_nexus` (`temporal_sdk/temporal_sdk_workflow.erl:26`).
