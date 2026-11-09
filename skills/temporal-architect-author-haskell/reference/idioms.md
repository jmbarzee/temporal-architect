# idioms

Temporal's `temporal-developer` skill does not cover Haskell. How to write Haskell Temporal code well is the SDK's haddock and source at `e57a0ae` and `MercuryTechnologies/hs-temporal-cookbook` at `cba3897`; read them there, never a copy here. The links pin the source the haddock is generated from: the README's haddock site (`README.md:6`) does not resolve, and would track main. Each topic adds only what those pages leave out.

## Worker setup

- Cookbook: [`hello/ActivityWithBoilerplate.hs`](https://github.com/MercuryTechnologies/hs-temporal-cookbook/blob/cba3897/hello/ActivityWithBoilerplate.hs) (explicit `provideWorkflow` / `provideActivity`, a client, a worker) and [`temporal102/ex1/Worker.hs`](https://github.com/MercuryTechnologies/hs-temporal-cookbook/blob/cba3897/temporal102/ex1/Worker.hs).
- SDK: the [`Temporal.Worker` header and setters](https://github.com/MercuryTechnologies/hs-temporal-sdk/blob/e57a0ae/sdk/src/Temporal/Worker.hs#L1-L119).
- The cookbook's other examples, [`hello/Activity.hs`](https://github.com/MercuryTechnologies/hs-temporal-cookbook/blob/cba3897/hello/Activity.hs) among them, register through Template Haskell, whose names are module-qualified: use the `provide*` form ([SKILL.md § Wire names](../SKILL.md#wire-names)).
- The cookbook builds the SDK with Nix ([`cabal.project`](https://github.com/MercuryTechnologies/hs-temporal-cookbook/blob/cba3897/cabal.project)); a cabal-only project builds it as [dependency-resolution.md § The SDK itself](./dependency-resolution.md#the-sdk-itself) says.

## Testing

- Cookbook: [`temporal102/ex2/solution/tests/`](https://github.com/MercuryTechnologies/hs-temporal-cookbook/tree/cba3897/temporal102/ex2/solution/tests) — [`TestUtils.hs`](https://github.com/MercuryTechnologies/hs-temporal-cookbook/blob/cba3897/temporal102/ex2/solution/tests/TestUtils.hs) (a time-skipping server, client and worker), [`WorkflowSpec.hs`](https://github.com/MercuryTechnologies/hs-temporal-cookbook/blob/cba3897/temporal102/ex2/solution/tests/WorkflowSpec.hs), [`MockWorkflowSpec.hs`](https://github.com/MercuryTechnologies/hs-temporal-cookbook/blob/cba3897/temporal102/ex2/solution/tests/MockWorkflowSpec.hs) (mocked activities), [`ActivitySpec.hs`](https://github.com/MercuryTechnologies/hs-temporal-cookbook/blob/cba3897/temporal102/ex2/solution/tests/ActivitySpec.hs).
- SDK: [`Temporal.EphemeralServer`](https://github.com/MercuryTechnologies/hs-temporal-sdk/blob/e57a0ae/sdk/src/Temporal/EphemeralServer.hs) and [`Temporal.Testing.MockActivityEnvironment`](https://github.com/MercuryTechnologies/hs-temporal-sdk/blob/e57a0ae/sdk/src/Temporal/Testing/MockActivityEnvironment.hs).
- The cookbook's `TestUtils` finds `temporal-test-server` on the `PATH`, which its Nix shell provides. Without Nix, `exe = CachedDownload (Default (SDKDefault "community-haskell" "0.1.0.0")) Nothing Nothing` downloads Temporal's test server once and caches it (`core/src/Temporal/Core/EphemeralServer.hs:23-58`), as the corpus's `corpus/haskell/Harness.hs` does.
- **Time is locked** on a client with `enableTimeSkipping = True` (`Client/Types.hs:140`) except inside `waitWorkflowResult` (`Client.hs:303-312`): a test that signals a workflow waiting on a timer advances the clock with `unlockTimeSkippingWithSleep` (`Client/TestService.hs:90-97`).

## Determinism

- SDK: the [`Temporal.Workflow` header, § Deterministic constraints](https://github.com/MercuryTechnologies/hs-temporal-sdk/blob/e57a0ae/sdk/src/Temporal/Workflow.hs#L33-L79).
- `IO` in a workflow is a type error, not a runtime check (`Workflow/Internal/Monad.hs:230-235`): an effect is an activity. Concurrency is `Temporal.Workflow`'s own `concurrently` and `race`, never `async` or `forkIO`; shared state is a `StateVar`, never an `IORef`; time and randomness are `now`, `uuid4` and `randomGen`.

## Errors

- Cookbook: [`temporal102/ex3/`](https://github.com/MercuryTechnologies/hs-temporal-cookbook/tree/cba3897/temporal102/ex3) (an activity failure, found and fixed) and [`temporal101/RetryPolicy.hs`](https://github.com/MercuryTechnologies/hs-temporal-cookbook/blob/cba3897/temporal101/RetryPolicy.hs) (a retry policy on a flaky activity).
- SDK: [`ApplicationFailure` and `ToApplicationFailure`](https://github.com/MercuryTechnologies/hs-temporal-sdk/blob/e57a0ae/sdk/src/Temporal/Exception.hs#L436-L476).
- An exception that is not an `ApplicationFailure` goes out as a retryable one whose type is the exception's Haskell type name (`Exception.hs:588-598`); `addErrorConverter` maps an exception type to its own (`Worker.hs:287-291`). In a workflow, any exception fails the run ([close.md](./close.md)).

## Data

- SDK: the [`Temporal.Payload` header and codecs](https://github.com/MercuryTechnologies/hs-temporal-sdk/blob/e57a0ae/sdk/src/Temporal/Payload.hs#L19-L230).
- There is no default converter: each definition names its codec. What `JSON` writes for each `.twf` type is [types.md](./types.md).

## Versioning

- SDK: [`$versioning`, `patched` and `deprecatePatch`](https://github.com/MercuryTechnologies/hs-temporal-sdk/blob/e57a0ae/sdk/src/Temporal/Workflow.hs#L1044-L1115); replaying a recorded history against new code, [`runReplayHistory`](https://github.com/MercuryTechnologies/hs-temporal-sdk/blob/e57a0ae/sdk/src/Temporal/Worker.hs#L700).
- The `Temporal.Workflow` header's "Workflow Versioning: not yet implemented" (`Workflow.hs:81-83`) is stale: patching is implemented. Worker versioning: [worker.md](./worker.md#versioning-not-11).
