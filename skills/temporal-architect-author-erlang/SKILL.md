---
name: temporal-architect-author-erlang
description: Generate Erlang code from .twf workflow designs using the community Erlang/Elixir SDK (andrzej-mag/temporal_sdk). Use when implementing workflows defined in TWF, producing compiled and tested Erlang projects from DSL specifications.
---

# Temporal Architect: Erlang Authoring

Turn `.twf` files into Erlang that compiles, runs, and implements the design with the community Erlang/Elixir SDK. The deliverable is always `.erl` files.

## Orient

The SDK, its engine and its API are the ones [author-elixir](../temporal-architect-author-elixir/SKILL.md) maps, so its mechanics hold here unchanged; this skill holds the Erlang spelling and what differs in substance. The mapping relies on [`temporal_sdk`](https://github.com/andrzej-mag/temporal_sdk) at `main` commit `d2749c7`, as a rebar3 git dependency (`{temporal_sdk, {git, "https://github.com/andrzej-mag/temporal_sdk", {ref, "d2749c77a74032f466345f476861a59180086fbd"}}}`), on OTP 28 (the SDK requires 27+, `rebar.config:3`), built with rebar3 3.28, as the corpus pins them; at another commit, check a call shape against that commit's source before using it. Paths in this skill are in the SDK's source at `d2749c7`, under `src/` except root files and `include/`.

The licence is MIT at the pinned commit (`LICENSE.txt:1`), while every released Hex 0.2.x is BUSL-1.1, so never depend on the Hex release ([author-elixir § Orient](../temporal-architect-author-elixir/SKILL.md#orient)).

The SDK is community-maintained, not an official Temporal SDK (`README.md:8`), and this skill supports it at Tier 3: a partial target. It has no test server, so verification needs a Temporal dev server (`temporal server start-dev`). Unsupported at the pin, as in author-elixir: [its list](../temporal-architect-author-elixir/SKILL.md#orient), each item documented in the linked reference.

Erlang has no namespaces, and every module of a rebar3 app is global, so prefix each module with its `.twf` design or package: `orders_process_order`, `orders_workers`. The SDK reads its `clusters` environment when its application starts (`node/temporal_sdk_node_sup.erl:22-23`), so a process sets it with `application:set_env(temporal_sdk, clusters, …)` or `sys.config` before `application:ensure_all_started(temporal_sdk)`; `rebar3 ct` starts no application itself.

Settle where the code lands. The project root is the directory whose `rebar.config` lists `temporal_sdk` in `{deps, …}`. In an existing repo its conventions are **requirements to match**; in greenfield, ask. The code is hand-written: no codegen variant is mapped.

For an existing repo, dispatch the design skill's [project-discovery subagent](../temporal-architect-design/subagents/project-discovery.md) on the bounded slice in scope and work from its summary; don't re-scan in the main context. A target spanning several slices goes through the design skill's [reverse decompose](../temporal-architect-design/reference/reverse-engineering.md#decompose-a-large-repo-into-slices) first.

## Wire names

A `.twf` name is the registered name, byte for byte; never rename the `.twf` to fit the code.

| Construct | Erlang default | Set the `.twf` name by |
|---|---|---|
| workflow | the module atom's name, `"orders_process_order"`: a worker resolves a type name with `binary_to_existing_atom` (`api/temporal_sdk_api.erl:591-615`) and serves every name unless restricted (`worker/temporal_sdk_worker_opts.erl:158-160`) | the worker's `temporal_name_to_erlang` fun mapping the `.twf` name to the module, with `allowed_temporal_names` listing the `.twf` names (`worker/temporal_sdk_worker.erl:39-41,186-196`); callers pass the `.twf` name as a binary, `start_child_workflow(TaskQueue, ~"Audit", …)`, since an atom becomes its module name (`temporal_sdk/temporal_sdk_workflow.erl:2058-2059`). A quoted-atom module, `-module('Audit').`, would match the default, but it needs quoting at every use and resolves only once the atom exists: never use it |
| activity | the module atom's name, as for a workflow (`api/temporal_sdk_api.erl:591-615`) | the same worker mapping; callers pass the `.twf` name as a binary, `start_activity(~"Count", …)` (`temporal_sdk/temporal_sdk_workflow.erl:1768-1771`) |
| signal | the binary the workflow awaits, `{signal_request, ~"Approve"}`, and the client sends, unchanged (`temporal_sdk/temporal_sdk_workflow.erl:1210`, `temporal_sdk/temporal_sdk.erl:1363`) | writing the `.twf` name as that binary |
| query | the binary the workflow awaits, `{query_request, ~"Status"}`, and the client sends, unchanged (`temporal_sdk/temporal_sdk_workflow.erl:1245`, `temporal_sdk/temporal_sdk.erl:1274`) | writing the `.twf` name as that binary |
| update | unsupported: no handler or client call (`temporal_sdk/temporal_sdk_workflow.erl:47`, `temporal_sdk/temporal_sdk.erl:45`) | — |
| Nexus service | unsupported: Nexus is not implemented (`TODO.md:15`) | — |
| Nexus operation | unsupported: Nexus is not implemented (`TODO.md:15`) | — |

A worker left on the default mapping finds no module for a `.twf` name like `Approval` and fails the task (`api/temporal_sdk_api.erl:600-607`), so every worker sets both options.

Types map by the BEAM's own conventions, spelled for Erlang: a `string` is a binary, never a charlist; an optional is `null`, never `undefined`; a user type is a map, never a proplist or record ([types.md](./reference/types.md)). Read [cross-sdk.md, only where `twf check` reports `CROSS_SDK_CALL`](../temporal-architect/reference/cross-sdk.md).

## Delegation

This skill owns the `.twf` ↔ Erlang translation: call shapes, wire names, options, project layout, verify. Encodings, error-handling minutiae, and SDK idioms sit below 10,000 ft: decide them in code, never in the `.twf`. Temporal's official `temporal-developer` skill has no Erlang coverage, so how to write Temporal Erlang well belongs to the SDK's own hexdocs and `temporal_sdk_samples`, whose `src/` is Erlang, which author-elixir's [idioms.md](../temporal-architect-author-elixir/reference/idioms.md) links by topic:

| Topic | Source |
|---|---|
| worker setup | [idioms.md § worker setup](../temporal-architect-author-elixir/reference/idioms.md#worker-setup) |
| testing | [idioms.md § testing](../temporal-architect-author-elixir/reference/idioms.md#testing) |
| determinism | [idioms.md § determinism](../temporal-architect-author-elixir/reference/idioms.md#determinism) |
| errors | [idioms.md § errors](../temporal-architect-author-elixir/reference/idioms.md#errors) |
| data | [idioms.md § data](../temporal-architect-author-elixir/reference/idioms.md#data) |
| versioning | [idioms.md § versioning](../temporal-architect-author-elixir/reference/idioms.md#versioning) |
| signals and queries | [idioms.md § signals and queries](../temporal-architect-author-elixir/reference/idioms.md#signals-and-queries) |

## Process

Root-down: roots (workflows no other workflow calls as a child) → children → activities → types. Each layer is constrained by the one above; defer unknowns and revisit. Write only what is needed: no speculative fields, types, or files — the minimum bridge from DSL intent to working Erlang.

**The user decides what is consequential.** Do mechanical mappings, SDK boilerplate, and type fixes yourself. Surface dependency choices, ambiguous domain logic, and architectural direction as specific options with tradeoffs, never open questions — e.g. "ChargePayment: the `hackney` client (matches your existing dependency) or OTP's `httpc` (no new dependency, more boilerplate)?" Revising a confirmed decision always needs the user's approval.

### 1. Gather and plan

- Read the `.twf` files in scope, `rebar.config`, and existing code (or the discovery summary); ask brief, targeted questions about domain and key dependencies.
- **Prefer imports over generation**: use well-known Hex packages when types match; generate only application-specific types.
- **Resolve dependencies**: the user confirms the dependency map before generation.
- Plan the root-down order, check the map against the planned signatures, and name what is deferred or ambiguous.

### 2. Generate and verify by layer

`rebar.config` sets `{erl_opts, [debug_info, warnings_as_errors]}`, so `rebar3 compile` is each layer's static check.

| Layer | What | Check |
|-------|------|-------|
| 1a. Types + signatures | Each workflow module, `-include_lib("temporal_sdk/include/workflow.hrl")`, with a stub `execute(Context, Input)`, whose input is the list of decoded payloads (`temporal_sdk/temporal_sdk_workflow.erl:1581`); shaped by the dependency map | `rebar3 compile` |
| 1b. Activity stubs | Every activity module, `-include_lib("temporal_sdk/include/activity.hrl")`, with its real `execute(Context, Input)` (`temporal_sdk/temporal_sdk_activity.erl:95`), so workflows call it through `start_activity(~"Name", Input, Opts)` | `rebar3 compile` |
| 2. Workflow bodies | Activity and child calls, signals, timers, races | `rebar3 compile` |
| 3. Activity impl | Bodies, with concrete implementations behind the activity modules | `rebar3 compile` |
| 4. Worker wiring | Each worker's `start_<worker>(TaskQueue)` in `<design>_workers.erl`; the process sets its cluster, starts the SDK, then calls it | `rebar3 compile`, `twf check` |
| 5. Tests | Floor: one happy-path Common Test case per workflow against a dev server, its worker started with `start_<worker>` on the suite's own task queue. Waits are real, so a long design timer is tested with a short test-only one. Every start passes `{opentelemetry, false}`, as in [author-elixir § Process](../temporal-architect-author-elixir/SKILL.md#process) | [Verify](#verify) |
| 6. Final | | [Verify](#verify) |

Then present the code for review.

**Implementation depth.** `.twf` activity bodies are pseudocode and may describe more than you implement. Where you simplify, leave a `%% TODO:` naming the elided logic (e.g. `%% TODO: cross-field consistency checks (see TWF)`). Shallow bodies suit examples and prototypes; for production, ask which activities need full implementations.

## Verify

From the project root, with a dev server up:

```sh
rebar3 compile && rebar3 ct
```

## Output conventions

- One module per workflow or activity, named for its `.twf` design or package (`orders_process_order` in `orders_process_order.erl`).
- A `<design>_workers.erl` per design holds each `.twf` worker's name→module map (`#{~"Approval" => approvals_approval}`) and `start_<worker>(TaskQueue)`, which starts a workflow and an activity worker with `temporal_sdk_worker:start(Cluster, workflow | activity, Opts)` (`worker/temporal_sdk_worker.erl:453`), passing a fun over the map as `temporal_name_to_erlang` and its keys as `allowed_temporal_names`. The worker process and the tests share it. Its `@sdk(erlang, "<path>")` names that file, from the directory of the nearest `twf.mod`, else the `.twf` file's directory, e.g. `@sdk(erlang, "erlang/orders_workers.erl")`.

## Reference index

Load only what the current layer needs. A link into author-elixir is a construct whose mapping has no Erlang code of its own.

| DSL | Erlang | File |
|-----|--------|------|
| `workflow Name(...)` | a module including `workflow.hrl` whose `execute(Context, Input)` takes the positional payload list | [workflow-def.md](./reference/workflow-def.md) |
| `id_scheme: "..."` | one ID function on the workflow's module, called by every start | [workflow-def.md](./reference/workflow-def.md#id_scheme) |
| `workflow_id_reuse_policy` / `workflow_id_conflict_policy` | start-options function; child gets reuse only | [options.md](./reference/options.md#workflow-id-policies) |
| `activity Name(...)` | a module including `activity.hrl` whose `execute/2` returns the result's payload list | [activity-def.md](./reference/activity-def.md) |
| types (`int`, `time`, `bytes`, …), user types | what the default codec chain round-trips; binaries, maps with binary keys, `null` | [types.md](./reference/types.md) |
| activity dependencies | dependency map, confirmed from `rebar.lock` | [dependency-resolution.md](./reference/dependency-resolution.md) |
| `worker`, namespace worker `options:` | name→module maps and `start_<worker>` in `<design>_workers.erl`, `temporal_sdk_worker:start/3` | [worker.md](./reference/worker.md) |
| `nexus service Name:`, `async` / `sync` operations | unsupported | [author-elixir nexus-service-def.md](../temporal-architect-author-elixir/reference/nexus-service-def.md) |
| `activity Name(args) -> r` | `start_activity(~"Name", [Args], [wait \| Opts])`, matched on `completed` | [activity-call.md](./reference/activity-call.md) |
| `workflow Name(args) -> r` | `start_child_workflow(TaskQueue, ~"Name", [{input, [Args]}, {workflow_id, …}, wait])` | [workflow-call.md](./reference/workflow-call.md) |
| `detach workflow ...` / `detach nexus ...` | child with `'PARENT_CLOSE_POLICY_ABANDON'`, `{awaitable_event, start}`, `await_open_before_close(false)` / unsupported | [detach.md](./reference/detach.md) |
| `nexus Endpoint Service.Op(args) -> r` | unsupported | [author-elixir nexus.md](../temporal-architect-author-elixir/reference/nexus.md) |
| `signal Name(params):` | `corpus_arrivals:on(~"Name", Body)`: the body runs per arrival at sync | [signal-handler.md](./reference/signal-handler.md) |
| `query Name(params) -> (T):` | a `start_execution` answering `{query_request, ~"Name"}` from `set_info` state; `handle_query/2` for a closed run | [query-handler.md](./reference/query-handler.md) |
| `update Name(params) -> (T):` | unsupported | [author-elixir update-handler.md](../temporal-architect-author-elixir/reference/update-handler.md) |
| `await signal Name -> (...)` | `corpus_arrivals:take(~"Name")` | [await-signal.md](./reference/await-signal.md) |
| `promise p <- ...` | the call's handle, awaited with `wait(P)`; for a signal, `corpus_arrivals:promise(~"Name")` | [promise.md](./reference/promise.md) |
| `state:` / `condition` / `set` / `unset` | process-dictionary state in the main execution, awaited on the signals that set it | [condition.md](./reference/condition.md) |
| `await all:` | `wait_branches([...])`, a `wait_any` loop that closes at the first failed branch | [await-all.md](./reference/await-all.md) |
| `await one:` | `corpus_arrivals:first` over every case: earliest workflow task, then first listed | [await-one.md](./reference/await-one.md) |
| handler + condition + `await one` | worked compositions | [composite-patterns.md](./reference/composite-patterns.md) |
| `signal handle.Name(args)` / `signal Type.Name(args)` + `id:` | unsupported | [author-elixir signal-send.md](../temporal-architect-author-elixir/reference/signal-send.md) |
| `await timer(d)` | `start_timer(D, [wait])` | [await-timer.md](./reference/await-timer.md) |
| `options:` / `default_options:` | the call's proplist; nested structures as maps with atom keys | [options.md](./reference/options.md) |
| `if` / `for` / `switch` / `break` / `continue`, `x = expr` | `case`, guards, `lists:foldl`, recursion; single assignment | [control-flow.md](./reference/control-flow.md) |
| `close complete` / `fail` / `continue_as_new` | `complete_workflow_execution` / `fail_workflow_execution` / `continue_as_new_workflow` | [close.md](./reference/close.md) |
| `heartbeat(details)` | `heartbeat([Details])`, with `handle_heartbeat/1` and `handle_cancel/1` | [heartbeat.md](./reference/heartbeat.md) |
| SDK idioms | the SDK's hexdocs and `temporal_sdk_samples`, by topic | [author-elixir idioms.md](../temporal-architect-author-elixir/reference/idioms.md) |
| recovered `.twf` (code → `.twf`) | project roots, registration, concurrency, for mix and rebar3 | [author-elixir discovery.md](../temporal-architect-author-elixir/reference/discovery.md) |

The spec states only what `detach` guarantees (`twf spec statement-syntax`); the author maps it to [author-elixir's mechanics](../temporal-architect-author-elixir/SKILL.md#reference-index), spelled in Erlang:

- **`detach workflow`**: `start_child_workflow(TaskQueue, ~"W", [{input, [...]}, {workflow_id, …}, {parent_close_policy, 'PARENT_CLOSE_POLICY_ABANDON'}, {awaitable_event, start}, wait])` (`temporal_sdk/temporal_sdk_workflow.erl:261-286`). On `#{state := initiate_failed}`, close with `fail_workflow_execution(…)` (`temporal_sdk/temporal_sdk_workflow.erl:2236-2240`), so a failed start fails the caller; any other state means the child started. Then `await_open_before_close(false)` (`temporal_sdk/temporal_sdk_workflow.erl:2883-2884`). Cancellation never reaches the child (`temporal_sdk/temporal_sdk_workflow.erl:32`). A client start just starts. Neither reads the result.
- **`detach nexus`**: unsupported: Nexus is not implemented (`TODO.md:15`), and there is no `cancel_nexus` (`temporal_sdk/temporal_sdk_workflow.erl:26`).
