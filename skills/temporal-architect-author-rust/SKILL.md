---
name: temporal-architect-author-rust
description: Generate Rust code from .twf workflow designs using the Temporal Rust SDK. Use when implementing workflows defined in TWF, producing compiled and tested Rust crates from DSL specifications.
---

# Temporal Architect: Rust Authoring

Turn `.twf` files into Rust that compiles, runs, and implements the design with the Temporal Rust SDK. The deliverable is always `.rs` files.

## Orient

The mapping relies on Rust SDK `1.1.2`, as the corpus pins it: `temporalio-sdk`, `temporalio-client`, `temporalio-common`, `temporalio-macros` and `temporalio-workflow`, each at `=1.1.2`, on stable Rust at MSRV 1.92 (`crates/sdk/Cargo.toml:5`), edition 2024. Two features: `experimental` on `temporalio-sdk` for the Nexus caller (`crates/sdk/Cargo.toml:81`), and `vendored-protox` on `temporalio-client`, which compiles the protos without `protoc` (`crates/client/Cargo.toml:27`). Depend directly on `temporalio-workflow`, `temporalio-common` and `futures`: `#[workflow_methods]` and `#[activities]` expand to `::temporalio_workflow`, `::temporalio_common` and `::futures` paths (`crates/macros/src/workflow_definitions.rs:78`, `activities_definitions.rs:670`). On an older minor, check a call shape against that version's source before using it.

Rust is Tier 2: `temporal-developer` `v0.6.3` calls the SDK Public Preview (`references/rust/rust.md:3-4`); tell the user so.

**Unsupported in Rust.** There is no Nexus handler: "Defining Nexus handlers will be added later" (`crates/sdk/README.md:341`), and the worker runs with `enable_nexus: false` (`crates/sdk/src/lib.rs:727`). Handler attributes accept only `name` (`crates/macros/src/workflow_definitions.rs:270-290`). So these live in another SDK or not at all:

- the Nexus service contract (`nexus service`), its `sync` and `async` operation bodies, and the client-start forms inside them
- signal and update `unfinished_policy` and `description`; query `description`
- worker option `local_activity_only_mode`: task types follow the registrations (`crates/sdk/src/lib.rs:723-727`)

Settle where the code lands. The project root is the directory whose `Cargo.toml` depends on `temporalio-sdk`. In an existing repo its conventions are **requirements to match**; in greenfield, ask. The code is hand-written: no codegen variant is mapped.

For an existing repo, dispatch the design skill's [project-discovery subagent](../temporal-architect-design/subagents/project-discovery.md) on the bounded slice in scope and work from its summary; don't re-scan in the main context. A target spanning several slices goes through the design skill's [reverse decompose](../temporal-architect-design/reference/reverse-engineering.md#decompose-a-large-repo-into-slices) first.

## Wire names

A `.twf` name is the registered name, byte for byte; never rename the `.twf` to fit the code. Paths below are in sdk-rust source at `v1.1.2` (`crates/`).

| Construct | Rust default | Set the `.twf` name by |
|---|---|---|
| workflow | the `#[workflow_methods]` impl type's name (`macros/src/workflow_definitions.rs:592,644-648`, `macros/src/macro_utils.rs:49-56`) | naming the struct as the `.twf` does, with `#[run(name = …)]` unset |
| activity | `"Type::method"`, e.g. `"BatchActivities::count"` (`macros/src/activities_definitions.rs:541-549`) | always `#[activity(name = "…")]` |
| signal | the method name as is (`macros/src/workflow_definitions.rs:39-46`) | always `#[signal(name = "…")]` |
| query | the method name as is (`macros/src/workflow_definitions.rs:39-46`) | always `#[query(name = "…")]` |
| update | the method name as is (`macros/src/workflow_definitions.rs:39-46`) | always `#[update(name = "…")]` |
| Nexus service | the caller's string (`workflow/src/workflow_context/options/nexus.rs:63-69`) | `NexusOperationOptions` `service` with the `.twf` name; no handler |
| Nexus operation | the caller's string (`workflow/src/workflow_context/options/nexus.rs:69`) | `NexusOperationOptions` `operation` with the `.twf` name; no handler |

A missing `name =` registers the Rust name silently.

Types map by Rust's own conventions. Read [cross-sdk.md, only where `twf check` reports `CROSS_SDK_CALL`](../temporal-architect/reference/cross-sdk.md).

## Delegation

This skill owns the `.twf` ↔ Rust translation: call shapes, wire names, options, project layout, verify. Encodings, error-handling minutiae, and SDK idioms sit below 10,000 ft: decide them in code, never in the `.twf`. How to write Rust Temporal code well belongs to Temporal's official `temporal-developer` skill, pinned at `v0.6.3`; load it for these topics. It has one Rust file, so the other topics cite the SDK's own docs from [idioms.md](./reference/idioms.md):

| Topic | `temporal-developer` |
|---|---|
| worker setup | `references/rust/rust.md` § Worker Setup, § File Organization Best Practice |
| testing | none; [idioms.md](./reference/idioms.md) |
| determinism | none; [idioms.md](./reference/idioms.md) |
| errors | none; [idioms.md](./reference/idioms.md) |
| data | none; [idioms.md](./reference/idioms.md) |
| versioning | none; [idioms.md](./reference/idioms.md) |

If it is not installed, install it from https://github.com/temporalio/skill-temporal-developer at `v0.6.3`, or read the topic's file there.

`rust.md`'s demo predates `1.1.2`: call `ctx.execute_activity`, not the deprecated `start_activity` (`crates/workflow/src/workflow_context.rs:2376`); build a `temporalio_sdk::Runtime` (`crates/sdk/src/runtime.rs:183`), which `Worker::new` takes (`crates/sdk/src/lib.rs:905-909`); and `?` each `register_workflow`, which returns `Result` (`crates/sdk/src/lib.rs:488`).

## Process

Root-down: roots (workflows no other workflow calls as a child) → children → activities → types. Each layer is constrained by the one above; defer unknowns and revisit. Write only what is needed: no speculative fields, types, or files — the minimum bridge from DSL intent to working Rust.

**The user decides what is consequential.** Do mechanical mappings, SDK boilerplate, and type fixes yourself. Surface dependency choices, ambiguous domain logic, and architectural direction as specific options with tradeoffs, never open questions — e.g. "ChargePayment: the `async-stripe` crate (typed, matches your existing dependency) or plain `reqwest` (flexible, more boilerplate)?" Revising a confirmed decision always needs the user's approval.

### 1. Gather and plan

- Read the `.twf` files in scope, `Cargo.toml`, and existing code (or the discovery summary); ask brief, targeted questions about domain and key dependencies.
- **Prefer imports over generation**: use well-known crates when types match; generate only application-specific types.
- **Resolve dependencies**: the user confirms the dependency map before generation.
- Plan the root-down order, check the map against the planned signatures, and name what is deferred or ambiguous.

### 2. Generate and verify by layer

| Layer | What | Check |
|-------|------|-------|
| 1a. Types + signatures | serde structs and `#[workflow]` structs with stub `#[workflow_methods]`; shaped by the dependency map | `cargo check --all-targets` |
| 1b. Activity stubs | Every `#[activities]` impl's `#[activity(name = …)]` methods with their real signatures, so workflows call them through `ctx.execute_activity` | `cargo check --all-targets` |
| 2. Workflow bodies | Activity and child calls, signals, timers, races | `cargo check --all-targets` |
| 3. Activity impl | Concrete implementations; methods holding state take `self: Arc<Self>` (`crates/macros/src/activities_definitions.rs:199`) | `cargo check --all-targets` |
| 4. Worker wiring | Each worker's `<worker>_types()`; the worker `main.rs` builds dependencies and runs `Worker::new(&runtime, client, options)?.run()` (`crates/sdk/src/lib.rs:905,1042`) | `cargo check --all-targets`, `twf check` |
| 5. Tests | Floor: one happy-path test per workflow under the time-skipping test server, since designs wait minutes to hours, its worker built from `<worker>_types()`; see [idioms.md](./reference/idioms.md) | `cargo test` |
| 6. Final | | [Verify](#verify) |

Then present the code for review.

**Implementation depth.** `.twf` activity bodies are pseudocode and may describe more than you implement. Where you simplify, leave a `// TODO:` naming the elided logic (e.g. `// TODO: cross-field consistency checks (see TWF)`). Shallow bodies suit examples and prototypes; for production, ask which activities need full implementations.

## Verify

From the project root:

```sh
cargo clippy --locked --workspace --all-targets -- -D warnings && cargo test --locked --workspace
```

## Output conventions

- One crate per `.twf` package.
- The crate's `src/lib.rs` holds one `pub fn <worker>_types() -> Result<WorkerOptions, WorkflowRegistrationError>` per `.twf` worker, named for the worker (`approval_types()`), returning `WorkerOptions::new(task_queue)` with its registrations, then `.build()` (`crates/sdk/src/lib.rs:186-194,472,488`), shared by the worker `main.rs` and the tests. Its `@sdk(rust, "<path>")` names that file, from the directory of the nearest `twf.mod`, else the `.twf` file's directory, e.g. `@sdk(rust, "src/lib.rs")`.
- Handler methods (`#[run]`, `#[signal]`, `#[query]`, `#[update]`) on a `pub` workflow are `pub`: each gets a marker type with the method's visibility (`crates/macros/src/macro_utils.rs:58-84`), and a private one in the workflow's public interface fails to compile.

## Reference index

Load only what the current layer needs.

| DSL | Rust | File |
|-----|------|------|
| `signal Name(params):` | `#[signal(name=)]` method: body, then `arrivals.add` | [signal-handler.md](./reference/signal-handler.md) |
| `query Name(params) -> (T):` | `#[query(name=)]` method on `&self` | [query-handler.md](./reference/query-handler.md) |
| `update Name(params) -> (T):` | `#[update(name=)]` method: body, then `arrivals.add`, then return | [update-handler.md](./reference/update-handler.md) |
| `await signal\|update Name -> (...)` | `take(ctx, of!(arrivals)).await?` | [await-signal.md](./reference/await-signal.md) |
| `promise p <- ...` | the unawaited call; for a signal or update, an unawaited `take` | [promise.md](./reference/promise.md) |
| `state:` / `condition` / `set` / `unset` | `bool` field + `ctx.wait_condition` | [condition.md](./reference/condition.md) |
| `await all:` | `workflows::join!` / `join_all` | [await-all.md](./reference/await-all.md) |
| `await one:` | `workflows::select!`, arms in listed order; first listed ready wins | [await-one.md](./reference/await-one.md) |
| handler + condition + `await one` | worked compositions | [composite-patterns.md](./reference/composite-patterns.md) |

The spec states only what `detach` guarantees (`twf spec statement-syntax`); the author maps it to these mechanics:

- **`detach workflow`**: `ChildWorkflowOptions` set `parent_close_policy: ParentClosePolicy::Abandon` and `cancel_type: ChildWorkflowCancellationType::Abandon`, so neither the caller's close nor its cancellation reaches the child (`crates/workflow/src/workflow_context/options.rs:91,141,496,501`); `ctx.start_child_workflow(W::run, input, options).await?` resolves once the child starts, so a failed start fails the caller (`crates/workflow/src/workflow_context.rs:1938-1946`). A client start just starts. Neither calls `.result()` (`crates/workflow/src/workflow_context.rs:3496`).
- **`detach nexus`** (preview: the Nexus caller is behind `experimental`, `crates/workflow/src/workflow_context.rs:1-2`): `NexusOperationOptions` set `cancellation_type: Some(NexusOperationCancellationType::Abandon)` (`crates/workflow/src/workflow_context/options/nexus.rs:22,88`); `ctx.start_nexus_operation(options).await` resolves once the operation starts (a sync operation starts by completing) to `Result<StartedNexusOperation, Failure>` (`crates/workflow/src/workflow_context/nexus.rs:76-83`, `crates/workflow/src/runtime/model/nexus.rs:4`), and never calls `.result()` (`crates/workflow/src/workflow_context/nexus.rs:115`). After the caller closes, the operation's completion callback to it fails and is dropped.
