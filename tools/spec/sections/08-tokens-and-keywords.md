# Tokens and Keywords

## Keywords

**Async workflow operations:**
- `promise` - Declare a non-blocking async operation (binds with `<-`)
- `detach` - Fire-and-forget workflow start or nexus call
- `nexus` - Nexus service definition (top-level) or nexus call (in workflow body)
- `await` - Wait for operations (`await timer`, `await signal`, `await all`, `await one`, `await <promise>`, `await <condition>`)
- `all` - Wait for all operations (used with `await`)
- `one` - Wait for first operation (used with `await`)

**Workflow primitives:**
- `workflow` - Workflow definition or child call
- `activity` - Activity definition or call
- `timer` - Durable sleep (used with `await`)
- `signal` - Three uses, disambiguated by syntactic context: (a) handler declaration at the top of a workflow, (b) arrival target in `await`/`promise`/`await one` (`await signal Name`), (c) cross-workflow send statement (`signal Head.Name(args)`). After `signal IDENT`, a `.` means a send; `(` or `:` means a handler declaration. A send may therefore be the first body statement; a handler declaration after the first body statement is a targeted parse error.
- `query` - Query declaration
- `update` - Update declaration and await target
- `id_scheme` - Workflow ID scheme, the first element of a workflow body (hard keyword; see [Workflow Definitions — ID Scheme](./01-workflows.md#id-scheme))

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
- `import` - Declares a dependency on another package: `import "<full/module/path>"` (reference the package by its leaf name — the last path segment, with a trailing `/vN` version segment stripped, per Go's rule) or `import alias "<full/module/path>"` (bind an explicit alias as the local reference name; the target package is still the version-stripped leaf). See [Packages and Imports](./14-packages-and-imports.md).
- `as` - Reserved hard keyword registered with `package`/`import` in this slice. It has no grammar role yet — the aliased-import surface this slice freezes is the leading-identifier form `import alias "path"` — so `as` is reserved (it cannot be used as an identifier) pending future use.

**Soft keywords** (only special after `nexus`):
- `service` - Nexus service (in top-level definition or worker reference)
- `endpoint` - Nexus endpoint (in namespace block)

**Signal-send address** (contextual — special only as address keys on the lines under a send; see [Cross-Workflow Signals](./13-cross-workflow-signals.md)):
- `id` - Target workflow ID
- `run_id` - Target run ID (optional)

**Reserved names:**
- `parent` - The only unquoted `id:` value, naming the sender's parent execution. Reserved as any name the resolver sees — a param, `->` binding, promise, or condition named `parent` is `RESERVED_NAME` — so `id: parent` has one meaning.

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

## Deployment Names

Namespace names, nexus endpoint names, and the endpoint reference in a `nexus` call use a distinct
**deployment-name** form rather than plain `IDENT`. It admits hyphens — real Temporal namespace and
endpoint strings use them, and plain `IDENT` cannot spell `fabric-shard` — and inline `{param}`
template parameters, so a per-tenant family (`fabric-shard-{org}`) is expressible as one name:

```
template_param ::= '{' IDENT '}'
deploy_char    ::= [a-zA-Z0-9_-]
deploy_name    ::= (letter | '_') deploy_char* (template_param deploy_char*)*
```

A deployment name starts with a letter or underscore, ranges over the character class
`[a-zA-Z0-9_-]`, and may interleave `{param}` template parameters. Hyphens are admitted but a name may
**not** start with a hyphen; dots are **not** admitted (they collide with the package-leaf
qualifier and the `service.operation` separator). A static, hyphen-free deployment name is a lexical
subset of `IDENT`, so existing names tokenize and format byte-identically.

`deploy_name` is used in exactly three positions — `namespace <name>`, `nexus endpoint <name>`, and
the endpoint reference in a `nexus` call. **All other identifiers** (workflow, activity, worker,
package, service, operation) remain plain `IDENT`; they are code symbols, not runtime deployment
strings. See [Worker and Namespace Definitions](./03-workers-and-namespaces.md) for the templating
semantics.

## Literals

```
NUMBER ::= [0-9]+ ['.' [0-9]+]
DURATION ::= NUMBER ('ms' | 's' | 'm' | 'h' | 'd')
STRING ::= '"' ( [^"\\\n] | '\"' | '\\' )* '"'
```

A `STRING` is single-line. `\"` and `\\` are its only escapes, standing for `"` and `\`; any other
backslash escape is an error. A string's value is its unescaped content. The same rule holds for
strings inside an argument list, so an escaped quote there does not end the string.

`NUMBER` and `DURATION` tokens are recognized everywhere. In raw expressions, digits that start a line or follow operators are consumed by the raw text scanner.

A `list_value` (`'[' [ STRING (',' STRING)* ] ']'`, defined in [Statement Syntax](./06-statement-syntax.md)) is a compound option value rather than a single token: a bracketed, comma-separated inline list of `STRING` elements, empty list allowed, no trailing comma, no `NEWLINE` inside the brackets.

A name parameter reaches no `STRING` option value. Inside a worker `task_queue`, a `{param}` is an
instance parameter declaring a per-instance worker family; an endpoint `task_queue` is static; in
`worker_identity` it is free text. See [Worker and Namespace Definitions](./03-workers-and-namespaces.md#per-instance-worker-families).
A `{param}` in an element of an endpoint's `allowed_caller_namespaces` list correlates by spelling
with a parameter of the endpoint's or its namespace's name, and otherwise ranges over the whole
family; see [Endpoint Options](./03-workers-and-namespaces.md#endpoint-options).

## Comments

```
comment ::= '#' .* NEWLINE
```

Comments start with `#` and continue to the end of the line. Comments can appear anywhere in the source and do not affect execution semantics. A comment on a line of its own is captured in the AST; a trailing comment, one that follows code on its line, is not.
