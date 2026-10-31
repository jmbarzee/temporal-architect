# Context Restrictions

## Temporal Keywords

Certain keywords are only valid in workflow context and produce errors in activity context:

- `activity` - Activity calls (activities cannot call other activities — not a Temporal primitive)
- `promise` - Non-blocking async operations
- `condition` - Named boolean awaitables
- `set`, `unset` - Condition mutation
- `state` - Workflow state block
- `detach`, `nexus` - Workflow/nexus calls
- `sync`, `async` - Nexus operation types
- `workflow` - Child workflow calls
- `timer` - Durable sleep (with `await`)
- `signal`, `query`, `update` - Handler declarations and await targets; `signal` additionally begins a cross-workflow send statement (`signal Head.Name(args)`)
- `await` - Async operation waiting
- `close` - Workflow termination (includes `complete`, `fail`, `continue_as_new`)

These keywords are **blocked in:**
- Activity definitions
- Query handler bodies

## Handler Body Contexts

- **Signal handlers:** Full workflow statement set (including cross-workflow signal send), but cannot call `close` (can only mutate state)
- **Update handlers:** Full workflow statement set (including cross-workflow signal send), but cannot call `close` (can only mutate state)
- **Query handlers:** Activity statement set (no temporal primitives, no signal send), use `return` for values

Cross-workflow signal send (`signal Head.Name(args)`) follows the same context surface as a `workflow` call: valid in a workflow body, signal handler, update handler, or sync nexus operation body; rejected in an activity body or query handler.

## Address Contexts

An `id:`/`run_id:` address is valid only under a signal send (`ADDRESS_MISPLACED` elsewhere; `ID_AT_START` under a start). `id: parent` is rejected in a sync nexus operation body, which has no parent workflow (`ADDRESS_MISPLACED`).
