# idioms

`temporal-developer` `v0.6.3` has one Rust file, `references/rust/rust.md`, which says its Rust-specific references "do not exist yet" (`:205-207`). For the topics it lacks, the SDK's own sources at `v1.1.2` are the reference: its [README](https://github.com/temporalio/sdk-rust/blob/v1.1.2/crates/sdk/README.md), [docs.rs](https://docs.rs/temporalio-sdk/1.1.2/temporalio_sdk/), and [examples](https://github.com/temporalio/sdk-rust/tree/v1.1.2/crates/sdk/examples). Read them there; this file points, and adds only what they leave out. Paths are in sdk-rust's `crates/`. Where `rust.md`'s demo predates `1.1.2` (`start_activity`, `CoreRuntime`, `register_workflow` without `?`), [SKILL.md § Delegation](../SKILL.md#delegation) gives the current calls.

## Testing

- **Activities alone:** `ActivityEnvironment`, behind `temporalio-sdk`'s `testing` feature (`sdk/README.md` § Testing; `sdk/src/testing.rs:257-345`).
- **Workflows, with time skipping:** the SDK's `WorkflowEnvironment::start_local` starts a Temporal CLI dev server, which does not skip time (`sdk/src/testing.rs:508-564`), so a design that waits minutes to hours never finishes under it. The time-skipping test server comes from `temporalio-sdk-core` with its `ephemeral-server` feature, which Orient's `temporalio-*` pins do not include; add it, and `tonic` for its test-service requests, as dev-dependencies:

  ```toml
  [dev-dependencies]
  temporalio-sdk-core = { version = "=0.10.2", features = ["ephemeral-server"] }
  ```

  `TestServerConfig` with `default_cached_download()` downloads Temporal's test server once into the OS temp dir and starts it (`sdk-core/src/ephemeral_server/mod.rs:225-250,389-395`); the connection's `test_service()` skips time with `unlock_time_skipping_with_sleep`, or by unlocking time skipping around a result wait. The corpus's test kit, `corpus/testkit.rs`, is that environment.
- **Workers in tests:** a worker's `run` future is not `Send` — its workflows run on a `LocalSet` (`sdk/src/lib.rs:1048,1071-1075`) — so a test starts workers with `tokio::task::spawn_local` inside a `LocalSet`, building each from the `<worker>_types()` the worker binary uses ([worker.md](./worker.md)).
- **Replay:** `WorkflowReplayer` (`sdk/README.md` § Workflow Replay).

## Determinism

`sdk/README.md` § Workflow Logic Constraints and § Runtime Nondeterminism Detection: no I/O, threads, randomness or system time in workflow code, and the `temporalio_sdk::workflows` combinators (`select!`, `join!`, `join_all`) in place of `tokio`'s or `futures`'. The detector is on by default (`WorkerOptions::detect_nondeterministic_futures`, `sdk/src/lib.rs:308-312`) and misses `futures::select!` without `biased`. The deterministic stand-ins are on the context: `ctx.workflow_time()`, `ctx.random()`, `ctx.uuid4()` (`workflow/src/workflow_context.rs:2231-2280`). Races: [await-one.md](./await-one.md); map iteration: [control-flow.md](./control-flow.md).

## Errors

`sdk/README.md` § Activities in detail: Error Handling, and § Failure Conversion and Error Wrapping. An activity returns `Result<T, ActivityError>`, and `?` turns any error into a retryable `ApplicationFailure` (`common-wasm/src/activity_definition.rs:84-94`); a non-retryable one is `ActivityError::application(ApplicationFailure::non_retryable(e))` (`:78-81`, `common-wasm/src/error.rs:280-286`). A workflow fails its run by returning `Err` ([close.md](./close.md)). Retry policy and timeouts per call: [options.md](./options.md).

## Data

The default converter and the `.twf` type map: [types.md](./types.md). Evolving inputs and results: `temporal-developer` `references/rust/rust.md` § Evolving Inputs and Results. Untyped values (`RawValue`, `UntypedSignal`): `sdk/README.md` § Signals, Queries, and Updates. A custom converter or codec is a `DataConverter::new(payload_converter, failure_converter, codec)` (`common-wasm/src/data_converters.rs:794-802`) set as the client's `data_converter`; docs.rs [`temporalio_common::data_converters`](https://docs.rs/temporalio-common/1.1.2/temporalio_common/data_converters/).

## Versioning

Patching: `ctx.patched(id)` and `ctx.deprecate_patch(id)` (`sdk/README.md` § Patching; `workflow/src/workflow_context.rs:1970-1983`). Worker deployment versioning: `WorkerDeploymentOptions` ([worker.md](./worker.md#versioning-not-11)), docs.rs [`temporalio_common::worker`](https://docs.rs/temporalio-common/1.1.2/temporalio_common/worker/). Check a change against recorded histories with `WorkflowReplayer` before deploying it.
