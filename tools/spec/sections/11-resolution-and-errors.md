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
   - Resolve cross-workflow signal sends: the handle must resolve to a workflow-bound `promise`, and the target workflow must declare the named signal
   - Walk signal/query/update handler bodies and resolve references
3. **Report errors:** Undefined references, duplicate definitions, etc.

## Error Handling

The parser and resolver collect multiple errors before failing, allowing users to fix multiple issues in one pass.

Common error types:
- Undefined activity/workflow/signal/update/condition/promise
- Duplicate definitions
- Temporal keywords in activity context
- Invalid await targets (e.g., awaiting a query)
- Signal-send handle is not a workflow-bound promise (the handle must come from `promise h <- workflow X(args)`)
- Signal name not declared by the target workflow (cross-workflow signal send)
- Condition with result binding (conditions cannot have `-> result`)
- `set`/`unset` on undefined condition
- Worker references undefined workflow, activity, or nexus service
- Duplicate worker, namespace, or nexus service definitions
- Duplicate nexus endpoint names across namespaces
- Namespace references undefined worker
- Worker instantiation missing `task_queue` option
- Nexus endpoint instantiation missing `task_queue` option
- Workers on same task queue with different type sets
- Undefined nexus endpoint (when endpoints exist locally)
- Undefined nexus service (when services exist locally)
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
- Unresolved nexus endpoint when no endpoints defined (warning, may be external)
- Unresolved nexus service when no services defined (warning, may be external)
- Unknown option key in `options:` block (including handler `options:` blocks — e.g. `unfinished_policy` on a query handler, where only `description` is allowed)
- Wrong value type for option key (e.g., number where duration expected)
- Invalid enum value for option key (e.g., a value other than `abandon` / `warn_and_abandon` for `unfinished_policy`)

## Examples

See the `skills/temporal-architect-design/topics/` directory for complete working examples of all language features.
