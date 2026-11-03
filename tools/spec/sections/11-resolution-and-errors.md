# Resolution and Errors

## Resolution

After parsing, the resolver performs symbol resolution:

1. **Build symbol table:** Collect all workflow and activity definitions
2. **Per-workflow resolution:**
   - Build signal/query/update maps for the workflow
   - Build condition map from `state:` block declarations
   - Scope `promise` bindings lexically (see [Statement Syntax — Promise Statement](./06-statement-syntax.md#promise-statement)); a name out of scope is `UNDEFINED_PROMISE_OR_CONDITION`
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
  error — except on a worker `nexus service Svc.Op` entry whose qualifier is a same-package service
  with that operation, which is `WORKER_REGISTERS_OPERATION` instead; an import whose package is **absent from the tree** is an `UNRESOLVED_IMPORT` warning and
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
- Workers on same task queue (same deploy key, within a namespace) with different workflow or activity sets, or — among workers that register nexus services — different service sets
- Worker `nexus service` entry naming an operation (`WORKER_REGISTERS_OPERATION` — a worker registers whole services)
- Worker registering two types of one kind with one name from different packages (`WORKER_DUPLICATE_TYPE_NAME` — Temporal registers types by name, not package)
- Nexus call originating in a namespace its endpoint's `allowed_caller_namespaces` omits (`NEXUS_CALLER_NOT_ALLOWED`)
- Undefined nexus endpoint (hard error — endpoints are flat-global; a templated reference resolves by full templated name, so a mismatch or a static reference to a templated endpoint lands here)
- Endpoint template param set not a superset of its owning namespace's (`ENDPOINT_PARAM_NOT_SUPERSET` — otherwise the endpoint's flat-global name collides across the family)
- Undefined nexus service (hard error — resolved per package, following any qualifier + import)
- Nexus service has no matching operation
- Detach nexus call with result binding
- Async nexus operation references undefined workflow
- Nexus endpoint routes to task queue with no worker in the endpoint's namespace registering the service (queues compared by spelling, so an endpoint never fronts a family)
- Explicit `task_queue` routing (call site, else the target's `default_options:`): target activity/workflow not on any worker polling a queue that [matches](./03-workers-and-namespaces.md#queue-matching) it in the caller's namespace(s)
- Implicit task queue routing: for some (namespace, task queue) the calling workflow is hosted on, the called activity/workflow is not on any worker polling a queue with that deploy key in that namespace
- Per-instance family and templated queue errors and hazards — see [Per-instance Worker Families](#per-instance-worker-families)
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
- Misplaced option key (`OPTION_MISPLACED`): a key its context cannot carry — `parent_close_policy` in a workflow `default_options:` block (it describes one parent↔child invocation, not the workflow type) or at a client start (no parent), and `workflow_id_conflict_policy` at a child start (a child start carries no conflict policy)
- Duplicate option key (`DUPLICATE_OPTION_KEY`): a key repeated in one options block, nested blocks included
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
| `ID_AT_START` | `id:`/`run_id:` under a start, or `workflow_id:` in a start's `options:` or a workflow's `default_options:` | error |
| `ADDRESS_MISPLACED` | address under a non-send; `options:` under a send; `run_id:` without `id:` or under `id: parent`; `id: parent` in a sync nexus body; wrong order; quoted run ID | error |
| `RESERVED_NAME` | `parent` as a param, binding, promise, or condition | error |
| `NOT_A_PARENT` | `id: parent` type never starts the sender in the model | warning |
| `STARTER_LACKS_SIGNAL` | another in-model starter of the sender lacks the handler sent via `id: parent` | warning |
| `MIRROR_COPIED_FROM_SCHEME` | holes byte-equal to the scheme's and none rooted in the sender's params | hint |
| `ID_SCHEME_OVERLAP` | two schemes in one namespace could produce the same ID | hint |
| `ID_POLICY_INCOMPATIBLE` | a client start would send `workflow_id_conflict_policy: TERMINATE_EXISTING` with `workflow_id_reuse_policy: REJECT_DUPLICATE` (rejected by Temporal server 1.27+, default config): from a workflow's `default_options:`, or a sync-nexus start's options merged over them | error |
| `ID_POLICY_WITHOUT_ID_SCHEME` | a reuse or conflict policy for a workflow with no `id_scheme:` | hint |
| `CHILD_START_CONFLICT_MISMATCH` | a child start of a schemed workflow whose default conflict policy is `USE_EXISTING` or `TERMINATE_EXISTING`, which a child start cannot carry | hint |
| `NEXUS_RUN_WITHOUT_ID_SCHEME` | an `async` nexus operation's backing workflow has no `id_scheme:` | warning |

An address on the send's own line (`signal X.Y() id: w`) is also `ADDRESS_MISPLACED`. A handler
declaration after the first body statement is a targeted syntax error.

### Per-instance Worker Families

Diagnostics for [per-instance worker families](./03-workers-and-namespaces.md#per-instance-worker-families) and [queue matching](./03-workers-and-namespaces.md#queue-matching).

| Code | Trigger | Severity |
|---|---|---|
| `QUEUE_TEMPLATE_MALFORMED` | a worker `task_queue` with an IDENT parameter: a brace group not a name; touching parameters; stray brace; reserved prefix; fixed text plus one byte per parameter over 1000 bytes | error |
| `ENDPOINT_TASK_QUEUE_TEMPLATED` | an IDENT parameter in an endpoint `task_queue` | error |
| `TASK_QUEUE_OVERLAP` | two placements in one namespace with different deploy keys, at least one a family, could name the same queue | hint |
| `INSTANCE_QUEUE_NO_START_TIMEOUT` | an activity call that names its queue reaches a family with neither `schedule_to_start_timeout` nor `schedule_to_close_timeout` | hint |
| `INSTANCE_FAMILY_HOSTS_WORKFLOW` | a family worker registers a workflow | hint |
| `INSTANCE_FAMILY_VERSIONED` | a family with `versioning: build_id` or `deployment` | hint |
| `INSTANCE_FAMILY_HOSTS_NEXUS_SERVICE` | a family worker registers a Nexus service, which no endpoint can reach | warning |

## Examples

See the `skills/temporal-architect-design/topics/` directory for complete working examples of all language features.
