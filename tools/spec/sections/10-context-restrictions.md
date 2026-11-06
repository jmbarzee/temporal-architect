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
- Sync nexus operation bodies, all but the client forms (below)

## Handler Body Contexts

- **Signal handlers:** Full workflow statement set (including cross-workflow signal send), but cannot call `close` (can only mutate state)
- **Update handlers:** Full workflow statement set (including cross-workflow signal send), but cannot call `close` (can only mutate state)
- **Query handlers:** Activity statement set (no temporal primitives, no signal send), use `return` for values
- **Sync nexus operation bodies:** Client forms only — a `workflow` start (`detach workflow` included), a `signal` send, `close` — with control flow and raw lines. The handler runs as a Temporal client, with no workflow context, so `activity`, `nexus` (`detach nexus` included), `await`, `timer`, `promise`, `condition`, `state`, `set` and `unset` are each `<keyword> is not allowed in a sync nexus operation body`

Cross-workflow signal send (`signal Head.Name(args)`) follows the same context surface as a `workflow` call: valid in a workflow body, signal handler, update handler, or sync nexus operation body; rejected in an activity body or query handler.

## Address Contexts

An `id:`/`run_id:` address is valid only under a signal send (`ADDRESS_MISPLACED` elsewhere; `ID_AT_START` under a start). `id: parent` is rejected in a sync nexus operation body, which has no parent workflow (`ADDRESS_MISPLACED`).

## Start Contexts

A `workflow` start is a **child start** in a workflow body or a signal or update handler, and a
**client start** in a sync nexus operation body. The kind decides its options
([Statement Syntax — Workflow Call](./06-statement-syntax.md#workflow-call)).
