# discovery

The PHP signals the design skill's [reverse engineering](../../temporal-architect-design/reference/reverse-engineering.md#language-signals) reads code by. Call sites read backward through the [reference index](../SKILL.md#reference-index): a typed activity stub's method call, or `Workflow::executeActivity('Name', …)`, is an `activity` call; a typed child stub's `#[WorkflowMethod]` call, or `Workflow::executeChildWorkflow('Name', …)`, a `workflow` call (`Workflow.php:957,762`). Names read back through [Wire names](../SKILL.md#wire-names). Paths below are in `temporal/sdk` source, under `src/`.

## Project roots

- A `composer.json` whose `require` has `temporal/sdk` marks a root that uses Temporal, beside a RoadRunner config (`.rr.yaml`, or a `.rr.*.yaml`) with a `temporal:` section, whose `server.command` names the worker entry file, and usually a `dload.xml` that fetches `rr`. Its `name`, else the repo path, is the path `twf mod init` takes; ask when neither fits. Several `composer.json`s are several roots; one under `vendor/` never is.
- Each PSR-4 namespace in `autoload` is one `.twf` package, its directory that package's code; a qualified call reads back through the `use` that imports it.

## Registration

- The entry file `server.command` runs (`worker.php`) calls `WorkerFactory::create()`, then `$factory->newWorker('q', $options)` starts a worker on `q`, `'default'` when omitted (`Worker/WorkerFactoryInterface.php:36-47`), in `.rr.yaml`'s `temporal.namespace`, `"default"` when unset ([worker.md](./worker.md#registration)). A queue or namespace read from the environment (`getenv`, `.rr.yaml`'s `${VAR:-x}`) cannot be resolved from code: ask, or leave it to the stitch's topology.
- The types one `newWorker` registers make one `worker` block ([worker.md](./worker.md#registration)), annotated `@sdk(php, "<path>")` with the file that registers them. A `Workers::registerXxxTypes($factory)` helper is that set: `registerBatchTypes` is `worker batchTypes`, and its file is the path. Queues the entry file registers only for tests' fixtures (the corpus's `arrivals`) are not the design.
- `registerWorkflowTypes(A::class, …)` registers `#[WorkflowInterface]` classes; `registerActivity(Acts::class, $factory)` and the deprecated `registerActivityImplementations($instance)` each register every `#[ActivityMethod]` of the class (`Worker/WorkerInterface.php:36,59,74`).
- **A directory scan** (`samples-php`'s `DeclarationLocator::create(__DIR__ . '/src/')`, `app/worker.php:27`) registers every declaration it finds, on whatever worker the loop chooses: report it, list what the scan reaches, and ask; never guess the set.
- A `#[SignalMethod]`, `#[UpdateMethod]` or `#[QueryMethod]` method of a workflow class declares a `signal`, `update` or `query` of that workflow, as does `Workflow::registerSignal('Name', …)`, `registerUpdate` or `registerQuery` in its body (`Workflow.php:411,528,386`). Its params are the method's, positional, its result the update's or query's type (`#[ReturnType]` on a generator), and its body the handler's statements less the `$xs->add`. The properties the handlers and the `#[WorkflowMethod]` share are its `state:`. The attribute's `description:` and `unfinishedPolicy:` give `description` and `unfinished_policy`.
- `#[UpdateValidatorMethod(forUpdate: '…')]` (`Workflow/UpdateValidatorMethod.php:27`) and `Workflow::registerDynamicSignal`, `registerDynamicQuery` and `registerDynamicUpdate` (`Workflow.php:438,463,495`), which serve any unmatched name at runtime, have no `.twf` form: record each in prose with its `file:line`.
- `FeatureFlags::*` assignments in the entry file change semantics process-wide (`Worker/FeatureFlags.php:26-102`): `$cancelAbandonedChildWorkflows = false` is what makes an Abandon child a `detach workflow` (Concurrency), and any other set flag goes in prose.
- `.rr.yaml`'s `temporal.cache_size` is `max_cached_workflows` for every worker the process starts; `temporal.activities.num_workers` has no `.twf` form: prose ([worker.md](./worker.md#worker-options--workeroptions)). `WorkerOptions` read back through that same table; `withDisableEagerActivities()` is `request_eager_execution: false` on its workflows' activity calls ([options.md](./options.md)).
- A queue built by an instance-key function (`sandboxQueue($sandboxId)` → `"sandbox-{$sandboxId}"`) is a [family](./worker.md#per-instance-worker-families) worker.
- PHP has no Nexus API: a PHP root registers no `nexus service` and makes no `nexus` call ([nexus-service-def.md](./nexus-service-def.md)). A Nexus endpoint that targets a PHP worker's workflow is served by another SDK's handler.
- A worker built behind a container or factory: follow it to the `newWorker`.

## Concurrency

| PHP | `.twf` |
|-----|--------|
| `#[SignalMethod]` / `#[UpdateMethod]` method whose body ends with `$xs->add(…)` on an `Arrivals` | handler, its body less the `$xs->add` ([signal-handler.md](./signal-handler.md), [update-handler.md](./update-handler.md)); a counter it increments (`++$this->acks`) and a waiter decrements once per take (`$this->acks > 0` … `--$this->acks`) is an `Arrivals<true>`, while one never decremented, or reset, is plain `state:`; with more than one waiter it is the per-waiter form below |
| `yield $xs->take()` | `await signal\|update Name -> (…)`, an array destructured into its names; `Arrivals<true>` binds none ([await-signal.md](./await-signal.md)) |
| `$p = $xs->take()`, yielded later | `promise p <- signal\|update Name` ([promise.md](./promise.md)) |
| a `Workflow::await(fn(): bool => $this->pending !== [])` per waiter over a handler-filled list | `await signal`, with a comment that two waiters can both wake for one arrival and one finds nothing ([await-signal.md](./await-signal.md)) |
| `yield Promise::all([…])`; over a `foreach`-built list | `await all`, branches in array order; a `for` fan-out inside; a `Workflow::async` branch is its statements ([await-all.md](./await-all.md)) |
| one `Workflow::await` with one closure over `$xs->ready($t)`, an arrivals counter, a `then`-set flag (over a `Promise::all`, a nested `await all:` case) and `bool`s, then the first ready one in check order wins (`claim()`, `--$this->acks`, `yield $p`) | `await one`, cases in that order; a `Workflow::async` scope over `Workflow::timer($d)` whose `then` sets the flag is a `timer(d)` case, its `cancel()` by the winner still `await one` (`twf spec statement-syntax`, lifecycle of non-winning cases) ([await-one.md](./await-one.md)); such a scope started before the race, checked across rounds or never cancelled, is `promise t <- timer(d)` with a `t:` case, which losing never cancels ([promise.md](./promise.md)) |
| `Workflow::awaitWithTimeout($d, $c)`, or `Workflow::await` given several conditions | `await one` with a `c` case and a `timer(d)` case, with a comment that it is a `Promise::any` inside ([await-one.md](./await-one.md)), so the first to settle wins, not the first listed |
| `Promise::any(…)` / `Promise::race(…)` (`Promise.php:55,310`) | `await one`, with a comment that the first to settle wins, not the first listed |
| a `bool` property set by a handler, awaited by `Workflow::await(fn(): bool => $this->flag)` | `condition` + `set` ([condition.md](./condition.md)), with a comment that repeated arrivals collapse into one: it is no `await signal` |
| an un-yielded call's promise, yielded later | `promise` ([promise.md](./promise.md)) |
| `yield` on the call itself | synchronous call |
| a child stub's `run(…)` held un-yielded, the stub signaled or the promise yielded later | `promise p <- workflow` ([workflow-call.md](./workflow-call.md), [signal-send.md](./signal-send.md)) |
| untyped child stub `start(…)` with `ParentClosePolicy::Abandon`, `getResult()` never called, under `FeatureFlags::$cancelAbandonedChildWorkflows = false` | `detach workflow`; without the flag the caller's cancellation still reaches it, so record that in prose ([detach.md](./detach.md)) |
| `return yield Workflow::newContinueAsNewStub(self::class)->run(args…)`, or `Workflow::continueAsNew('W', [args…])` in `W` | `close continue_as_new(args)` ([close.md](./close.md)); onto another type, record it in prose |
| `yield Workflow::timer($d)` | `await timer(d)` ([await-timer.md](./await-timer.md)) |

## Codegen

- No forward variant generates code, and the SDK has none ([SKILL.md](../SKILL.md#orient)).
- Protobuf messages (`Google\Protobuf\Internal\Message`) travel through the default converter's `ProtoJsonConverter` and `ProtoConverter` (`DataConverter/DataConverter.php:38-44`, `DataConverter/ProtoJsonConverter.php:28-30`): the payload types come from the `.proto` their generated classes were compiled from.
- `composer.json` `scripts` name any other generator.
