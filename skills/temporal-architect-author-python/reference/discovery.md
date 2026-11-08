# discovery

The Python signals the design skill's [reverse engineering](../../temporal-architect-design/reference/reverse-engineering.md#language-signals) reads code by. Call sites read backward through the [reference index](../SKILL.md#reference-index): `execute_activity` or `execute_activity_method` is an `activity` call, `execute_child_workflow` a `workflow` call, `execute_operation` a `nexus` call. Paths below are in `temporalio` and `nexusrpc` source.

## Project roots

- A `pyproject.toml` (or `requirements*.txt`, `setup.cfg`) that depends on `temporalio` marks a root that uses Temporal. Its `[project] name`, else the repo path, is the path `twf mod init` takes; ask when neither fits. A uv or Poetry workspace joins several projects, each its own root.

## Registration

- `Worker(client, task_queue=…, workflows=[…], activities=[…], nexus_service_handlers=[…])` (`temporalio/worker/_worker.py:101-108`) starts a worker on `task_queue` in its client's namespace: `Client.connect(…, namespace=…)`, `"default"` when unset (`temporalio/client/_client.py:139`). A namespace or queue read from config or the environment (`ClientConfig.load_client_connect_config()`, `temporalio/envconfig.py:362`; `os.environ`) cannot be resolved from code: ask, or leave it to the stitch's topology. Its other keyword arguments read back through [worker.md](./worker.md#worker-options--worker) into the namespace worker's `options:`.
- The types one `Worker` registers make one `worker` block ([worker.md](./worker.md#registration)), annotated `@sdk(python, "<path>")` with the module that builds it. A worker-factory function returning the `Worker` is that set, shared by the worker process and its tests: `order_types(client)` is `worker orderTypes`, and its module is the path. A list parameter defaulted in the factory (`activities or [count, store]`) is the deployment's set; a test's stand-ins are not.
- Names are wire names, byte for byte ([SKILL.md](../SKILL.md#wire-names)): `@workflow.defn(name=…)` else the class name; `@activity.defn(name=…)` else the function name, so an unnamed snake_case activity is a snake_case `.twf` activity (`temporalio/activity.py:84`).
- `@workflow.signal`, `@workflow.query` or `@workflow.update` on a method of the workflow class declares a `signal`, `query` or `update` of that workflow, named by its `name=` else the method name. Its params are the method's after `self`, its result the query's or update's return, and its body the method's statements less the arrival record (`xs.add`, or the pending append or bump). The `__init__` attributes the handlers and `run` share, less its `Arrivals` and pending lists or counts, are its `state:`. The decorator's `description` and `unfinished_policy` give `description` and `unfinished_policy`.
- An update's `@x.validator` (`temporalio/workflow/_handlers.py:267`), a `dynamic=True` workflow, activity or handler, and a handler registered at runtime with `workflow.set_signal_handler`, `set_query_handler`, `set_update_handler` or their `set_dynamic_*` forms (`temporalio/workflow/_workflow_ops.py:931-1069`) have no `.twf` form: record each in prose with its `file:line`.
- A queue built from an instance key (`f"sandbox-{sandbox_id}"`) is a [family](./worker.md#per-instance-worker-families) worker.
- Each `nexus_service_handlers` entry, an instance of a `@service_handler(service=Svc)` class, is a Nexus service on that worker. `@nexusrpc.service(name=…)` on `Svc` names it, else the class name; without a `service`, `service_handler(name=…)` else the handler class name (`nexusrpc/handler/_decorators.py:103`). Each `Operation(name=…)` names an operation, else its attribute name; without a contract, the method decorator's `name=` else the method name. A `@nexus.workflow_run_operation` returning `ctx.start_workflow(W.run, …)` is an `async` operation backed by `W`; a `@sync_operation` a `sync` one, its client forms read back through [nexus-service-def.md](./nexus-service-def.md#sync).
- `workflow.create_nexus_client(service=Svc, endpoint=…)` names the endpoint and service of every `nexus` call made through it; follow a constant to its value.
- A `Worker` behind a config loader or DI container: follow it to the call.

## Concurrency

| Python | `.twf` |
|--------|--------|
| `@workflow.signal\|update` method whose body ends with `self.xs.add(…)` on an `Arrivals` | handler, its body less the `add` ([signal-handler.md](./signal-handler.md), [update-handler.md](./update-handler.md)) |
| `await self.xs.take()` | `await signal\|update Name -> (…)` ([await-signal.md](./await-signal.md)) |
| `p = self.xs.take()`, awaited later | `promise p <- signal\|update Name` ([promise.md](./promise.md)) |
| a handler that appends to a pending list or bumps a pending count, and a `wait_condition` on it that pops or decrements | the same as `Arrivals`: handler and `await signal\|update Name` |
| `asyncio.gather(…)`; over a generator | `await all`, branches in argument order; a `for` fan-out inside ([await-all.md](./await-all.md)) |
| `xs.wait()` tickets, tasks and flags, one `wait_condition` over all of them, then the first ready one in check order wins (`claim`, `leave`) | `await one`, cases in that order ([#474](./await-one.md#tie-order-in-1350)) ([await-one.md](./await-one.md)); a losing inline timer's `.cancel()` is part of the race (spec 06), not a statement |
| `wait_condition(c, timeout=d)`, catching `asyncio.TimeoutError` | `await one` with a `c` case, then a `timer(d)` case holding the `except` body; it is an `asyncio.wait_for` over a timer (`temporalio/worker/_workflow_instance.py:2006`) |
| `workflow.wait(…, return_when=FIRST_COMPLETED)`, `workflow.as_completed` | `await one`, with a comment that the first to settle wins, not the first listed, and that every ready take claims its arrival, the losers' included (`_workflow_instance.py:2827-2837`) |
| a `bool` set in a handler, `await workflow.wait_condition(lambda: self.flag)` | `condition`, `set` in the handler ([condition.md](./condition.md)); read as `await signal Name` only with a comment that it is one-shot: the flag holds one arrival, and later ones are lost |
| a task held and awaited later (`workflow.start_activity`, `asyncio.create_task(…)`, `start_child_workflow`) | `promise` ([promise.md](./promise.md)) |
| `await` on the call itself | synchronous call |
| `start_child_workflow` with `ParentClosePolicy.ABANDON`, handle never awaited | `detach workflow`; without `ChildWorkflowCancellationType.ABANDON` the caller's cancellation still reaches it, so record that in prose ([detach.md](./detach.md)) |
| `nexus.client().start_workflow` in a sync Nexus handler, `handle.result()` never awaited | `detach workflow` ([detach.md](./detach.md)) |
| `start_operation` with `NexusOperationCancellationType.ABANDON`, handle never awaited | `detach nexus` ([detach.md](./detach.md)) |
| `workflow.continue_as_new(arg)` or `(args=[…])` | `close continue_as_new(args)` ([close.md](./close.md)); with `workflow=` another type, record it in prose (`temporalio/workflow/_workflow_ops.py:846`) |
| `workflow.sleep(d)`; `asyncio.sleep(d)`, a timer through the workflow's event loop (`_workflow_instance.py:3099`) | `await timer(d)` ([await-timer.md](./await-timer.md)) |

## Codegen

- No forward variant generates code ([SKILL.md](../SKILL.md#orient)).
- Protobuf message payloads, which the default converter handles (`temporalio/converter/_payload_converter.py:489,549`): the payload types come from the `.proto`.
- `pydantic_data_converter` (`temporalio/contrib/pydantic.py:197`) with `BaseModel` payloads: read them as user types, a `Decimal` as `decimal` and a `timedelta` as `duration`. Under the default converter those travel as a `str` and a number ([types.md](./types.md)): read them as `decimal` or `duration` only where a name or comment says so.
- A Makefile or task runner names any other generator.
