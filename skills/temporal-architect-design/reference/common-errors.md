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
| `NEXUS_UNDEFINED_SERVICE` | `undefined nexus service: Foo` | Service referenced but not defined (in its package, following any qualifier + import) | Add a `nexus service Foo:` block, fix the name, or import the package that owns it |
| `NEXUS_NO_OPERATION` | `nexus service Foo has no operation Bar` | Operation name not in the service | Add the operation or fix the name |
| `WORKER_UNDEFINED_WORKFLOW` / `WORKER_UNDEFINED_ACTIVITY` / `WORKER_UNDEFINED_NEXUS_SERVICE` | `worker X references undefined ...` | Worker lists a name that doesn't exist | Add the definition or fix the name |
| `NAMESPACE_UNDEFINED_WORKER` | `namespace X references undefined worker: Y` | Namespace uses unknown worker | Add worker block or fix name |
| `ENDPOINT_PARAM_NOT_SUPERSET` | `nexus endpoint "X" must be parameterized by all of namespace N's template params; missing <param>` | An endpoint in a parameterized namespace omits one of the namespace's `{param}`s, so its flat-global name would collide across the family (e.g. a static `BootstrapShard` inside `fabric-shard-{org}`). The endpoint's `{param}` set must be a **superset** of its namespace's | Add the missing `{param}`(s) to the endpoint name (e.g. `fabric-shard-{org}-BootstrapShard`) |
| `UNBOUND_TEMPLATE_PARAM` | `unbound template param {P} in endpoint E options: option "K" is not bound ...` / `... in worker options in namespace N: option "K" is not bound ...` | A `{param}` hole in a **namespace-level worker or endpoint STRING option value** (e.g. `task_queue: "q-{region}-..."`) is not bound by the enclosing template — worker options are bound by the owning namespace's template; endpoint options by the endpoint's own template ∪ its namespace's | Add the param to the enclosing namespace/endpoint template, or drop the hole. (Holes in *workflow-body* option values are runtime interpolation, not template holes — see [task-queues.md](../topics/task-queues.md#template-holes-vs-runtime-interpolation)) |
| `QUALIFIED_REF_WITHOUT_IMPORT` | `qualified reference uses package "p" with no matching import in package "q"` | A `p.Name` reference names a package `p` the file never `import`ed | Add `import "…/p"` (or fix the qualifier / alias) |
| `UNRESOLVED_IMPORT` | `import "github.com/acme/shop/billing/v2" is unresolved (no package "billing" in the tree); treated as external` | An imported package isn't found in the tree — warning, exit 0. The message quotes the **full import path** first, then names the **derived (version-stripped) package** (`.../billing/v2` → `billing`) | None required — the package is treated as external (see below). Fix the path if it was a typo |
| `UNUSED_IMPORT` | `unused import: "p" is never referenced` | An import that resolved but is never used — warning, exit 0 | Remove the import, or add the qualified reference you intended |

### Packages, imports, and external references

Cross-package references are qualified by the package leaf name and require an `import` of the
package that owns the symbol (see [`.twf` Conventions](./twf-conventions.md#package-per-domain-directory)
and the [packages topic](../topics/packages.md)). Resolution follows the import:

- **Bare or same-package** references resolve exactly as they always have.
- A **qualified reference with a matching import that resolves** binds to the symbol in that
  package. If the package is present but has no such symbol, the usual `UNDEFINED_*` /
  `NEXUS_UNDEFINED_*` / `NEXUS_NO_OPERATION` error fires — resolution is now per-package.
- A **qualified reference with no matching import** is a hard `QUALIFIED_REF_WITHOUT_IMPORT` error.
- An **unresolved import** (a path with no package in the tree) is a `UNRESOLVED_IMPORT` **warning**
  and is **treated as external**: qualified references through it resolve as external and emit **no**
  `UNDEFINED_*` error. This is how packages subsume the old "declared elsewhere" workaround — external
  is now something you *declare* (by importing a package that isn't in the tree), not something the
  tool infers globally.

**The nexus per-category cliff is gone.** Nexus endpoints and services no longer flip between a
"may be external" warning and a hard error based on whether *any* endpoint/service is defined in the
file set. Endpoints are flat-global and services are package-scoped, so an unresolved endpoint or
service is simply `NEXUS_UNDEFINED_ENDPOINT` / `NEXUS_UNDEFINED_SERVICE` (a hard error), while a
genuinely external service is reached through an unresolved import (`UNRESOLVED_IMPORT`) — no local
stub definitions and no "define none to dodge the error" workaround. The retired
`NEXUS_UNRESOLVED_ENDPOINT` / `NEXUS_UNRESOLVED_SERVICE` codes are no longer emitted.

## Parse errors (kind: `parse`)

All parse failures share the single code `SYNTAX`. The message carries the
detail; pin programmatic dispatch to `kind=parse, code=SYNTAX` and match on
the message for now (categorical parse codes are future work — [#32](https://github.com/jmbarzee/temporal-architect/issues/32)).

| Message | Cause | Fix |
|---------|-------|-----|
| `<keyword> is not allowed in activity body` | Using a temporal primitive (`workflow`, `activity`, `timer`, `signal`, `await`, etc.) inside an activity definition or query handler | Move the temporal primitive to a workflow. Activities run outside the replay-safe workflow context as normal side-effecting code — temporal primitives require deterministic replay and cannot function in activities. |
| `expected ( after return type ->` | Return type not parenthesized: `-> Result` | Use `-> (Result)` — return types must be wrapped in parentheses |
| `expected ( after if` / `expected ( after for` | Missing parentheses around condition/iterator | Use `if (expr):` / `for (x in items):` |
| `unexpected token <tok> at top level` | Statement or keyword that doesn't start a workflow or activity definition | Ensure all top-level items are `workflow`, `activity`, `worker`, `namespace`, or `nexus service` definitions |
| `unexpected token <tok> in await one case` | Invalid case type inside `await one:` block | Cases must be `signal`, `update`, `timer`, `activity`, `workflow`, an identifier, or `await all` |
| `definition requires ':' and an indented body` | A definition is missing its `:` and indented body — a bare declaration like `activity Foo(x) -> (R)` with nothing under it. `activity`/`workflow`/`sync` nexus op definitions always require a body. (Often followed by a cascading `UNDEFINED_*` because the malformed definition didn't register.) | Add `:` and an indented body. For a not-yet-implemented stub, use a placeholder statement (e.g. `return Foo{}` or a single `log(...)`); a definition cannot be body-less. |

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

The diagnostic shape is the `envelope.Diagnostic` Go struct
(`tools/lsp/cmd/twf/internal/envelope/model.go`); run any `twf --json`
subcommand to see it live, or read its TypeScript projection in
`tools/wire-types`.
