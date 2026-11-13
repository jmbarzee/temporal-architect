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

Each body context takes one [statement set](./05-statements.md):

| Context | Statement set |
|---------|---------------|
| Workflow body | Workflow |
| Signal handler, update handler | Workflow, without `close` (a handler only mutates state) |
| Query handler | Activity, using `return` for values |
| Activity body | Activity |
| Sync nexus operation body | Client |

A sync nexus operation body rejects `activity`, `nexus` (`detach nexus` included), `await`, `timer`, `promise`, `condition`, `set`, `unset` and `state`, each as `<keyword> is not allowed in a sync nexus operation body`.

## Address Contexts

An `id:`/`run_id:` address is valid only under a signal send (`ADDRESS_MISPLACED` elsewhere; `ID_AT_START` under a start). `id: parent` is rejected in a sync nexus operation body, which has no parent workflow (`ADDRESS_MISPLACED`).

## Start Contexts

A `workflow` start is a **child start** in a workflow body or a signal or update handler, and a
**client start** in a sync nexus operation body. The kind decides its options
([Statement Syntax — Workflow Call](./06-statement-syntax.md#workflow-call)).
