# Common Errors

This file covers **parser, resolver, and validator diagnostics** emitted by
`twf check` and `twf parse`. For **design-level anti-patterns** (structural
mistakes, primitive misuse), see [anti-patterns.md](./anti-patterns.md).

Each row lists the symbolic `code` (stable across releases), the human
message you'll see, the cause, and the fix. The codes are also emitted by
`twf parse` inside the structured envelope (`diagnostics[].code`); programmatic
consumers should match on `kind+code` rather than the message.

## Resolve errors (kind: `resolve`)

| Code | Message | Cause | Fix |
|------|---------|-------|-----|
| `UNDEFINED_ACTIVITY` | `undefined activity: Foo` | Activity `Foo` is called but not defined | Add `activity Foo(...):` definition to the file |
| `UNDEFINED_WORKFLOW` | `undefined workflow: Foo` | Child workflow `Foo` is called but not defined | Add `workflow Foo(...):` definition to the file |
| `UNDEFINED_SIGNAL` | `undefined signal: Foo` | `await signal Foo` or `signal Foo:` case but no signal handler declared | Add `signal Foo(...):` declaration inside the workflow, before the body |
| `UNDEFINED_UPDATE` | `undefined update: Foo` | `await update Foo` or `update Foo:` case but no update handler declared | Add `update Foo(...) -> (Type):` declaration inside the workflow, before the body |
| `UNDEFINED_CONDITION` | `undefined condition: Foo` | `set Foo`, `unset Foo`, or `await Foo` but no condition declared | Add `condition Foo` inside the workflow's `state:` block |
| `UNDEFINED_PROMISE_OR_CONDITION` | `undefined promise or condition: Foo` | `await Foo` or `Foo:` case in `await one` but `Foo` is not a promise or condition | Add `promise Foo <- ...` in the workflow body or `condition Foo` in the `state:` block |
| `DUPLICATE_WORKFLOW` | `duplicate workflow definition: Foo` | Two `workflow Foo` definitions in the same file | Remove or rename the duplicate |
| `DUPLICATE_ACTIVITY` | `duplicate activity definition: Foo` | Two `activity Foo` definitions in the same file | Remove or rename the duplicate |
| `DUPLICATE_WORKER` | `duplicate worker definition: Foo` | Two `worker Foo` definitions | Remove or rename the duplicate |
| `DUPLICATE_NAMESPACE` | `duplicate namespace definition: Foo` | Two `namespace Foo` blocks | Remove or rename the duplicate |
| `DUPLICATE_NEXUS_SERVICE` | `duplicate nexus service definition: Foo` | Two `nexus service Foo` blocks | Remove or rename the duplicate |
| `DUPLICATE_ENDPOINT` | `duplicate nexus endpoint name "Foo": defined in namespace A and namespace B` | Same endpoint name in multiple namespaces | Use unique endpoint names |
| `CONDITION_RESULT_BINDING` | `condition "Foo" cannot have a result binding (-> identifier)` | `await Foo -> result` where `Foo` is a condition | Conditions are boolean — remove the `-> result` binding |
| `NEXUS_ASYNC_UNDEFINED_WORKFLOW` | `async operation Foo references undefined workflow: Bar` | Async nexus op points at a workflow that doesn't exist | Add the workflow or fix the name |
| `NEXUS_UNDEFINED_ENDPOINT` | `undefined nexus endpoint: Foo` | Endpoint referenced but not defined anywhere | Add a `nexus endpoint Foo:` in some namespace, or fix the name |
| `NEXUS_UNDEFINED_SERVICE` | `undefined nexus service: Foo` | Service referenced but not defined | Add a `nexus service Foo:` block or fix the name |
| `NEXUS_NO_OPERATION` | `nexus service Foo has no operation Bar` | Operation name not in the service | Add the operation or fix the name |
| `WORKER_UNDEFINED_WORKFLOW` / `WORKER_UNDEFINED_ACTIVITY` / `WORKER_UNDEFINED_NEXUS_SERVICE` | `worker X references undefined ...` | Worker lists a name that doesn't exist | Add the definition or fix the name |
| `NAMESPACE_UNDEFINED_WORKER` | `namespace X references undefined worker: Y` | Namespace uses unknown worker | Add worker block or fix name |

## Parse errors (kind: `parse`)

All parse failures share the single code `SYNTAX`. The message carries the
detail; pin programmatic dispatch to `kind=parse, code=SYNTAX` and match on
the message for now (categorical parse codes are future work).

| Message | Cause | Fix |
|---------|-------|-----|
| `<keyword> is not allowed in activity body` | Using a temporal primitive (`workflow`, `activity`, `timer`, `signal`, `await`, etc.) inside an activity definition or query handler | Move the temporal primitive to a workflow. Activities run outside the replay-safe workflow context as normal side-effecting code — temporal primitives require deterministic replay and cannot function in activities. |
| `expected ( after return type ->` | Return type not parenthesized: `-> Result` | Use `-> (Result)` — return types must be wrapped in parentheses |
| `expected ( after if` / `expected ( after for` | Missing parentheses around condition/iterator | Use `if (expr):` / `for (x in items):` |
| `unexpected token <tok> at top level` | Statement or keyword that doesn't start a workflow or activity definition | Ensure all top-level items are `workflow`, `activity`, `worker`, `namespace`, or `nexus service` definitions |
| `unexpected token <tok> in await one case` | Invalid case type inside `await one:` block | Cases must be `signal`, `update`, `timer`, `activity`, `workflow`, an identifier, or `await all` |

## Validation diagnostics (kind: `validate`)

| Code | Severity | Cause | Fix |
|------|----------|-------|-----|
| `MISSING_TASK_QUEUE` | error | Worker instantiation has no `task_queue` option | Add `options: task_queue: "..."` to the worker instantiation |
| `MISSING_ENDPOINT_TASK_QUEUE` | error | Nexus endpoint instantiation has no `task_queue` | Add the option to the endpoint instantiation |
| `EXPLICIT_ROUTING_MISMATCH` | error | An activity/workflow call's explicit `task_queue` doesn't match any worker registering it | Fix the queue name or register the target on a worker for that queue |
| `IMPLICIT_ROUTING_MISMATCH` | error | An activity/workflow is called without an explicit `task_queue` and no worker on the caller's queue registers it | Add the target to a worker on the same queue, or pass an explicit `task_queue` option |
| `ENDPOINT_SERVICE_LINKAGE` | error | Endpoint routes to a task queue but no worker on that queue registers the service | Register the service on a worker for the endpoint's queue |
| `TASK_QUEUE_MISMATCH` | error | Two workers share a queue but register different type sets | Make the type sets identical, or use distinct queues |
| `TASK_QUEUE_IDENTICAL` | warning | Two workers register identical type sets on the same queue (redundant) | Drop one of the workers |
| `UNCOVERED_WORKFLOW` / `UNCOVERED_ACTIVITY` / `UNCOVERED_SERVICE` | warning | Definition exists but no instantiated worker registers it | Register on a worker or remove the unused definition |
| `UNINSTANTIATED_WORKER` | warning | Worker defined but never instantiated in any namespace | Instantiate it in a namespace, or remove the worker |
| `EMPTY_WORKFLOW` / `EMPTY_ACTIVITY` / `EMPTY_WORKER` / `EMPTY_NAMESPACE` | warning | Block has no body / no registrations / no instantiations | Add content or remove the empty block |

The complete machine-readable schema for diagnostics lives at
`tools/lsp/cmd/twf/twf.schema.json`.
