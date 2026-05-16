# Tokens and Keywords

## Keywords

**Async workflow operations:**
- `promise` - Declare a non-blocking async operation (binds with `<-`)
- `detach` - Fire-and-forget child workflow or nexus call
- `nexus` - Nexus service definition (top-level) or nexus call (in workflow body)
- `await` - Wait for operations (`await timer`, `await signal`, `await all`, `await one`, `await <promise>`, `await <condition>`)
- `all` - Wait for all operations (used with `await`)
- `one` - Wait for first operation (used with `await`)

**Workflow primitives:**
- `workflow` - Workflow definition or child call
- `activity` - Activity definition or call
- `timer` - Durable sleep (used with `await`)
- `signal` - Signal declaration and await target
- `query` - Query declaration
- `update` - Update declaration and await target

**State and conditions:**
- `state` - Workflow state declaration block
- `condition` - Named boolean awaitable (declared in `state:` block)
- `set` - Set a condition to true
- `unset` - Set a condition to false

**Activity primitives:**
- `heartbeat` - Report activity progress (activity-only)

**Control flow:**
- `switch` - Multi-way conditional
- `case` - Switch case
- `if` - Conditional
- `else` - Alternative branch
- `for` - Loop
- `in` - Iteration operator

**Workflow termination:**
- `close` - Terminate workflow execution
- `complete` - Successful completion (used with `close`)
- `fail` - Failed completion (used with `close`)
- `continue_as_new` - Reset history and continue (used with `close`)

**Flow control:**
- `return` - Return from definition
- `break` - Exit loop
- `continue` - Next loop iteration

**Operators:**
- `and`, `or`, `not` - Logical operators

**Nexus operations:**
- `sync` - Synchronous nexus operation (in nexus service body)
- `async` - Asynchronous nexus operation (in nexus service body)

**Worker topology:**
- `worker` - Worker type set definition (at top level) or worker instantiation (in namespace block)
- `namespace` - Namespace definition (deployment topology)
- `task_queue` - Task queue option key (in options blocks)

**Soft keywords** (only special after `nexus`):
- `service` - Nexus service (in top-level definition or worker reference)
- `endpoint` - Nexus endpoint (in namespace block)

**Configuration:**
- `options` - Options block for activity/workflow/nexus calls

## Symbols

- `->` - Output binding (result assignment)
- `<-` - Promise binding (async declaration)
- `.` - Member access / nexus service.operation separator
- `:` - Block start
- `#` - Comment

## Identifiers

```
IDENT ::= [a-zA-Z_][a-zA-Z0-9_]*
```

Identifiers start with a letter or underscore, followed by any combination of letters, digits, or underscores.

## Literals

```
NUMBER ::= [0-9]+ ['.' [0-9]+]
DURATION ::= NUMBER ('ms' | 's' | 'm' | 'h' | 'd')
STRING ::= '"' [^"]* '"'
```

`NUMBER` and `DURATION` tokens are recognized everywhere. In raw expressions, digits that start a line or follow operators are consumed by the raw text scanner.

## Comments

```
comment ::= '#' .* NEWLINE
```

Comments start with `#` and continue to the end of the line. Comments can appear anywhere in the source and are captured in the AST but do not affect execution semantics.
