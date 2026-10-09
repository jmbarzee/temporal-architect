# Common Errors

Diagnostics from `twf check` and `twf parse`. Design-level mistakes are in [anti-patterns.md](./anti-patterns.md). Match programmatically on `kind` + `code`, which are stable across releases; messages are not.

## Resolve errors (kind: `resolve`)

| Code | Message | Cause | Fix |
|------|---------|-------|-----|
| `UNDEFINED_ACTIVITY` | `undefined activity: Foo` | Activity `Foo` is called but not defined | Add `activity Foo(...):` definition to the file |
| `UNDEFINED_WORKFLOW` | `undefined workflow: Foo` | Child workflow `Foo` is called but not defined | Add `workflow Foo(...):` definition to the file |
| `UNDEFINED_SIGNAL` | `undefined signal: Foo` | `await signal Foo` or `signal Foo:` case but no signal handler declared | Add `signal Foo(...):` declaration inside the workflow, before the body |
| `UNDEFINED_UPDATE` | `undefined update: Foo` | `await update Foo` or `update Foo:` case but no update handler declared | Add `update Foo(...) -> (Type):` declaration inside the workflow, before the body |
| `UNDEFINED_CONDITION` | `undefined condition: Foo` | `set Foo`, `unset Foo`, or `await Foo` but no condition declared | Add `condition Foo` inside the workflow's `state:` block |
| `UNDEFINED_PROMISE_OR_CONDITION` | `undefined promise or condition: Foo` | `await Foo` or `Foo:` case in `await one` but `Foo` is not a promise or condition | Add `promise Foo <- ...` in the workflow body or `condition Foo` in the `state:` block |
| `DUPLICATE_WORKFLOW` / `_ACTIVITY` / `_WORKER` / `_NAMESPACE` / `_NEXUS_SERVICE` | `duplicate workflow definition: Foo` (etc.) | Two definitions of the same kind and name (workflows/activities: within one file) | Remove or rename the duplicate |
| `DUPLICATE_ENDPOINT` | `duplicate nexus endpoint name "Foo": defined in namespace A and namespace B` | Same endpoint name in multiple namespaces | Use unique endpoint names |
| `CONDITION_RESULT_BINDING` | `condition "Foo" cannot have a result binding (-> identifier)` | `await Foo -> result` where `Foo` is a condition | Conditions are boolean — remove the `-> result` binding |
| `NEXUS_ASYNC_UNDEFINED_WORKFLOW` | `async operation Foo references undefined workflow: Bar` | Async nexus op points at a workflow that doesn't exist | Add the workflow or fix the name |
| `NEXUS_UNDEFINED_ENDPOINT` | `undefined nexus endpoint: Foo` | Endpoint referenced but not defined anywhere | Add a `nexus endpoint Foo:` in some namespace, or fix the name |
| `NEXUS_UNDEFINED_SERVICE` | `undefined nexus service: Foo` | Service referenced but not defined (in its package, following any qualifier + import) | Add a `nexus service Foo:` block, fix the name, or import the package that owns it |
| `NEXUS_NO_OPERATION` | `nexus service Foo has no operation Bar` | Operation name not in the service | Add the operation or fix the name |
| `WORKER_UNDEFINED_WORKFLOW` / `WORKER_UNDEFINED_ACTIVITY` / `WORKER_UNDEFINED_NEXUS_SERVICE` | `worker X references undefined ...` | Worker lists a name that doesn't exist | Add the definition or fix the name |
| `NAMESPACE_UNDEFINED_WORKER` | `namespace X references undefined worker: Y` | Namespace uses unknown worker | Add worker block or fix name |
| `ENDPOINT_PARAM_NOT_SUPERSET` | `nexus endpoint "X" must be parameterized by all of namespace N's template params; missing <param>` | An endpoint in a parameterized namespace omits one of its `{param}`s (e.g. static `BootstrapShard` inside `fabric-shard-{org}`), so its flat-global name would collide across the family | Add the missing `{param}`(s) to the endpoint name (e.g. `fabric-shard-{org}-BootstrapShard`) |
| `UNBOUND_TEMPLATE_PARAM` | `unbound template param {P} in endpoint E options: option "K" is not bound ...` / `... in worker options in namespace N: option "K" is not bound ...` | A `{param}` in a namespace-level worker or endpoint string option (e.g. `task_queue: "q-{region}-..."`) isn't bound — worker options bind from the namespace's template, endpoint options from the endpoint's ∪ the namespace's | Add the param to that template, or drop the hole. Holes in *workflow-body* options are runtime interpolation, not template holes ([task-queues.md](../topics/task-queues.md#template-holes-vs-runtime-interpolation)) |
| `QUALIFIED_REF_WITHOUT_IMPORT` | `qualified reference uses package "p" with no matching import in package "q"` | A `p.Name` reference names a package `p` the file never `import`ed | Add `import "…/p"` (or fix the qualifier / alias) |
| `UNRESOLVED_IMPORT` | `import "github.com/acme/shop/billing/v2" is unresolved (no package "billing" in the tree); treated as external` | An imported package isn't found in the tree — warning, exit 0. The message quotes the **full import path** first, then names the **derived (version-stripped) package** (`.../billing/v2` → `billing`) | None required — the package is treated as external (see below). Fix the path if it was a typo |
| `UNUSED_IMPORT` | `unused import: "p" is never referenced` | An import that resolved but is never used — warning, exit 0 | Remove the import, or add the qualified reference you intended |

### Packages, imports, and external references

A qualified reference resolves inside its imported package, so a missing symbol there raises the usual `UNDEFINED_*` / `NEXUS_*` error. Reach a genuinely external service by importing a package that isn't in the tree — never by local stubs.

## Parse errors (kind: `parse`)

All parse failures share the code `SYNTAX`; dispatch on the message until categorical parse codes land ([#32](https://github.com/jmbarzee/temporal-architect/issues/32)).

| Message | Cause | Fix |
|---------|-------|-----|
| `<keyword> is not allowed in activity body` | Using a temporal primitive (`workflow`, `activity`, `timer`, `signal`, `await`, etc.) inside an activity definition or query handler | Move it to a workflow — temporal primitives need deterministic replay, which activities lack |
| `expected ( after return type ->` | Return type not parenthesized: `-> Result` | Use `-> (Result)` — return types must be wrapped in parentheses |
| `expected ( after if` / `expected ( after for` | Missing parentheses around condition/iterator | Use `if (expr):` / `for (x in items):` |
| `unexpected token <tok> at top level` | Statement or keyword that doesn't start a workflow or activity definition | Ensure all top-level items are `workflow`, `activity`, `worker`, `namespace`, or `nexus service` definitions |
| `unexpected token <tok> in await one case` | Invalid case type inside `await one:` block | Cases must be `signal`, `update`, `timer`, `activity`, `workflow`, an identifier, or `await all` |
| `definition requires ':' and an indented body` | A bare declaration like `activity Foo(x) -> (R)` with nothing under it; `activity`/`workflow`/`sync` nexus op definitions always need a body. Often followed by a cascading `UNDEFINED_*`. Also raised by a dot in a namespace/endpoint name | Add `:` and an indented body; for a stub, one placeholder statement (`return Foo{}`, `log(...)`) |
| `unexpected OPTIONS in worker block` | `options:` on a worker definition | Move them to the worker's instantiation in a namespace — a worker is a reusable type set; the namespace deploys it |

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

`twf help` documents the JSON envelope that carries these diagnostics (`diagnostics[].code`).
