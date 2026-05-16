# Context Restrictions

## Temporal Keywords

Certain keywords are only valid in workflow context and produce errors in activity context:

- `promise` - Non-blocking async operations
- `condition` - Named boolean awaitables
- `set`, `unset` - Condition mutation
- `state` - Workflow state block
- `detach`, `nexus` - Workflow/nexus calls
- `sync`, `async` - Nexus operation types
- `workflow` - Child workflow calls
- `timer` - Durable sleep (with `await`)
- `signal`, `query`, `update` - Handler declarations and await targets
- `await` - Async operation waiting
- `close` - Workflow termination (includes `complete`, `fail`, `continue_as_new`)

These keywords are **blocked in:**
- Activity definitions
- Query handler bodies

## Handler Body Contexts

- **Signal handlers:** Full workflow statement set, but cannot call `close` (can only mutate state)
- **Update handlers:** Full workflow statement set, but cannot call `close` (can only mutate state)
- **Query handlers:** Activity statement set (no temporal primitives), use `return` for values
