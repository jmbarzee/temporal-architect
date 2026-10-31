# Resolution and Errors

## Resolution

After parsing, the resolver performs symbol resolution:

1. **Build symbol table:** Collect all workflow and activity definitions
2. **Per-workflow resolution:**
   - Build signal/query/update maps for the workflow
   - Build condition map from `state:` block declarations
   - Build promise set from `promise` statements in the workflow body
   - Resolve activity calls to activity definitions
   - Resolve workflow calls to workflow definitions
   - Resolve await targets to signal/update/activity/workflow/promise/condition declarations
   - Resolve `set`/`unset` targets to condition declarations
   - Resolve cross-workflow signal sends: a handle head must resolve to a workflow-bound `promise`; a type head resolves like a workflow call (`UNDEFINED_WORKFLOW`), and a head through an unresolved import is carried unchecked (`Unresolved{Reason: "external"}`). The target workflow must declare the named signal (`UNDEFINED_SIGNAL` for a type head, `SIGNAL_SEND_UNDEFINED_SIGNAL` for a handle head)
   - Walk signal/query/update handler bodies and resolve references
3. **Report errors:** Undefined references, duplicate definitions, etc.

## Packages and Imports

The [`package`/`import`](./14-packages-and-imports.md) surface resolves **per package**: a reference
is looked up in the package it names, and same-named symbols in different packages are distinct.

- A clause-less file belongs to the **implicit default package**, which is **elided from all
  formatting** — node-IDs, keys, `--json` output, and diagnostic messages for existing files stay
  byte-identical.
- A **bare or same-package** reference resolves exactly as it does today.
- A package **qualifier** on a reference (`pkg.Name`) resolves against the imported package that
  owns the symbol. A qualifier with **no matching import** is a `QUALIFIED_REF_WITHOUT_IMPORT`
  error; an import whose package is **absent from the tree** is an `UNRESOLVED_IMPORT` warning and
  is **treated as external**, so qualified references through it resolve as external with no
  `UNDEFINED_*` error; an import that resolves but is never referenced is an `UNUSED_IMPORT` warning.

## Error Handling

The parser and resolver collect multiple errors before failing, allowing users to fix multiple issues in one pass.

Common error types:
- Undefined activity/workflow/signal/update/condition/promise
- Duplicate definitions
- Malformed `import` declaration (parse error — an `import` without a valid string path, e.g. `import foo` with no quoted path)
- Duplicate or misplaced `package` clause (parse error — more than one `package` clause in a file, or a `package` clause that is not the first clause)
- Temporal keywords in activity context
- Invalid await targets (e.g., awaiting a query)
- Signal-send handle is not a workflow-bound promise (the handle must come from `promise h <- workflow X(args)`)
- Signal name not declared by the target workflow (cross-workflow signal send)
- Workflow-ID and addressed-send errors — see [Workflow IDs and Addressed Sends](#workflow-ids-and-addressed-sends)
- Condition with result binding (conditions cannot have `-> result`)
- `set`/`unset` on undefined condition
- Worker references undefined workflow, activity, or nexus service
- Duplicate worker, namespace, or nexus service definitions
- Duplicate nexus endpoint names across namespaces
- Namespace references undefined worker
- Worker instantiation missing `task_queue` option
- Nexus endpoint instantiation missing `task_queue` option
- Workers on same task queue with different type sets
- Undefined nexus endpoint (hard error — endpoints are flat-global; a templated reference resolves by full templated name, so a mismatch or a static reference to a templated endpoint lands here)
- Endpoint template param set not a superset of its owning namespace's (`ENDPOINT_PARAM_NOT_SUPERSET` — otherwise the endpoint's flat-global name collides across the family)
- Unbound template param in a string option value (`UNBOUND_TEMPLATE_PARAM` — a `{param}` in a `STRING` option value must be bound by the enclosing namespace/endpoint identifier template, or its owning namespace's)
- Undefined nexus service (hard error — resolved per package, following any qualifier + import)
- Nexus service has no matching operation
- Detach nexus call with result binding
- Async nexus operation references undefined workflow
- Nexus endpoint routes to task queue with no worker registering the service
- Explicit `task_queue` routing: target activity/workflow not on any worker polling that queue
- Implicit task queue routing: called activity/workflow not on any worker polling the calling workflow's task queue
- Workflow/activity not registered on any instantiated worker (warning)
- Nexus service not referenced by any worker (warning)
- Worker not instantiated in any namespace (warning)
- Empty worker with no registrations (warning)
- Empty namespace with no worker or endpoint instantiations (warning)
- Empty workflow body (warning)
- Empty activity body (warning)
- Qualified reference with no matching import (`QUALIFIED_REF_WITHOUT_IMPORT`)
- Unresolved import — imported package absent from the tree, treated as external (warning)
- Unused import — a resolved import never referenced (warning)
- Unknown option key in `options:` block (including handler `options:` blocks — e.g. `unfinished_policy` on a query handler, where only `description` is allowed)
- Call-site-only option key in a definition `default_options:` block (e.g. `parent_close_policy` in a workflow `default_options:` block — it describes a particular parent↔child invocation, not the workflow type, and is valid only at a call site)
- Wrong value type for option key (e.g., number where duration expected)
- Invalid enum value for option key (e.g., a value other than `abandon` / `warn_and_abandon` for `unfinished_policy`)

### Workflow IDs and Addressed Sends

Diagnostics for [`id_scheme:`](./01-workflows.md#id-scheme) and [addressed signal sends](./13-cross-workflow-signals.md).

| Code | Trigger | Severity |
|---|---|---|
| `ID_SCHEME_MISPLACED` | `id_scheme` not at the head of a workflow body, or repeated | error |
| `ID_SCHEME_MALFORMED` | hole root not a param; touching holes; no fixed text; stray brace | error |
| `ID_VALUE_MALFORMED` | `id:` not one `STRING`, `parent`, or one path | error |
| `ID_MIRROR_MISMATCH` | literal's fixed text or hole count differs from the scheme | error |
| `NO_ID_SCHEME` | literal `id:` on a type with no scheme | error |
| `TYPE_NEEDS_ID` | type head with no `id:` | error |
| `HANDLE_TAKES_NO_ID` | address under a handle | error |
| `ID_AT_START` | `id:`/`run_id:` under a start, or `workflow_id:` in a start's `options:` | error |
| `ADDRESS_MISPLACED` | address under a non-send; `options:` under a send; `run_id:` without `id:` or under `id: parent`; `id: parent` in a sync nexus body; wrong order; quoted run ID | error |
| `RESERVED_NAME` | `parent` as a param, binding, promise, or condition | error |
| `NOT_A_PARENT` | `id: parent` type never starts the sender in the model | warning |
| `STARTER_LACKS_SIGNAL` | another in-model starter of the sender lacks the handler sent via `id: parent` | warning |
| `MIRROR_COPIED_FROM_SCHEME` | holes byte-equal to the scheme's and none rooted in the sender's params | hint |
| `ID_SCHEME_OVERLAP` | two schemes in one namespace could produce the same ID | hint |

An address on the send's own line (`signal X.Y() id: w`) is also `ADDRESS_MISPLACED`. A handler
declaration after the first body statement is a targeted syntax error.

## Examples

See the `skills/temporal-architect-design/topics/` directory for complete working examples of all language features.
