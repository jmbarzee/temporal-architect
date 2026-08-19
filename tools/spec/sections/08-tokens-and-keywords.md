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
- `signal` - Three uses, disambiguated by syntactic context: (a) handler declaration at the top of a workflow, (b) arrival target in `await`/`promise`/`await one` (`await signal Name`), (c) cross-workflow send statement with a dot-qualified handle target (`signal handle.Name(args)`). A `.` after the name marks a send; otherwise it is an arrival.
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

**Packages and imports:**
- `package` - Optional leading clause declaring the file's package (compile-time, directory-scoped symbol grouping; distinct from `namespace`). At most one per file, and it must be the first clause. See [Packages and Imports](./14-packages-and-imports.md).
- `import` - Declares a dependency on another package: `import "<full/module/path>"` (reference the package by its leaf name) or `import alias "<full/module/path>"` (bind an explicit alias for the leaf name).
- `as` - Reserved hard keyword registered with `package`/`import` in this slice. It has no grammar role yet — the aliased-import surface this slice freezes is the leading-identifier form `import alias "path"` — so `as` is reserved (it cannot be used as an identifier) pending future use.

**Soft keywords** (only special after `nexus`):
- `service` - Nexus service (in top-level definition or worker reference)
- `endpoint` - Nexus endpoint (in namespace block)

**Configuration:**
- `options` - Options block for activity/workflow/nexus calls
- `default_options` - Definition-level call-option defaults block, at the head of an `activity`/`workflow` definition body (soft/contextual keyword; call sites override per key with `options:`)

## Symbols

- `->` - Output binding (result assignment)
- `<-` - Promise binding (async declaration)
- `.` - Member access / nexus service.operation separator / package-leaf qualifier separator in a qualified name (`pkg.Name`, in keyword-led call positions only)
- `:` - Block start
- `[` - Opens a `list_value` in an option value
- `]` - Closes a `list_value` in an option value
- `,` - Separates elements within a `list_value` (and arguments within `arg_list`)
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

A `list_value` (`'[' [ STRING (',' STRING)* ] ']'`, defined in [Statement Syntax](./06-statement-syntax.md)) is a compound option value rather than a single token: a bracketed, comma-separated inline list of `STRING` elements, empty list allowed, no trailing comma, no `NEWLINE` inside the brackets.

## Comments

```
comment ::= '#' .* NEWLINE
```

Comments start with `#` and continue to the end of the line. Comments can appear anywhere in the source and are captured in the AST but do not affect execution semantics.
