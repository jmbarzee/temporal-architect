# Workflow Definitions

```
workflow_def ::= 'workflow' IDENT params ['->' return_type] ':' NEWLINE
                 INDENT
                 [default_options_block]
                 [state_block]
                 [signal_decl*]
                 [query_decl*]
                 [update_decl*]
                 statement*
                 DEDENT

params ::= '(' [param_list] ')'
param_list ::= param (',' param)*
param ::= IDENT ':' type
return_type ::= '(' type_list ')'  # Always parenthesized
type_list ::= type (',' type)*
type ::= IDENT | type '[' type ']' | type '{' ... '}'
```

**Important:** An optional `default_options:` block (if present) appears **first** of all — before the state block — followed by the state block, then signal/query/update declarations, then body statements. Each signal/query/update can only be declared once per workflow.

An optional `default_options:` block (see [Statement Syntax — Definition Default Options](./06-statement-syntax.md)) leads the workflow body, before the `state:` block. It supplies the call-option defaults (timeouts, id-reuse policy, retry policy, task queue, priority) for every call that starts this workflow; a call site's `options:` block overrides them per key. It appears above `state:` because a definition's defaults are its external invocation contract, which reads above its internal state.

**Cross-package references.** In a workflow *call* (`workflow Name(args)`, and its `detach` /
`promise` / `await` / `await one` variants), the callee name is a
[`qualified_ref`](./14-packages-and-imports.md) — it may carry an optional `pkg.` package
qualifier (`workflow orders.ProcessOrder(order)`) to name a workflow declared in another package.
The qualifier is bare for same-package workflows; a qualified callee resolves against the imported
package that declares it, and if that import is unresolved (external) the qualified call resolves as
external. A cross-workflow signal send target
(`signal handle.Name(args)`) is *not* package-qualified — its dot separates a handle from a signal
name, not a package from a symbol.

## State Block

The state block declares workflow state including named conditions and variable initializations. It must appear before signal/query/update declarations:

```
state_block ::= 'state' ':' NEWLINE
                INDENT
                state_stmt*
                DEDENT

state_stmt ::= condition_decl | raw_stmt

condition_decl ::= 'condition' IDENT NEWLINE
```

**Restrictions:** No temporal primitives inside `state:` block. It is purely declarative.

## Signal Declarations

Signal handlers are defined at the beginning of workflows with handler body blocks:

```
signal_decl ::= 'signal' IDENT params ':' NEWLINE
                INDENT
                [options_block]
                statement*
                DEDENT
```

Signal handler bodies execute when the signal arrives. Handlers have access to the full workflow statement set (activities, child workflows, timers, etc.).

An optional `options:` block (see [Statement Syntax — Options Block](./06-statement-syntax.md)) may lead the handler body, before any statements — the same placement as a `state:` block at the top of a workflow. Signal handler options: `unfinished_policy`, `description`.

For sending a signal to another workflow, see [Cross-Workflow Signals](./13-cross-workflow-signals.md).

## Query Declarations

Query handlers are defined at the beginning of workflows with handler body blocks:

```
query_decl ::= 'query' IDENT params '->' return_type ':' NEWLINE
               INDENT
               [options_block]
               statement*
               DEDENT
```

**Return type is required for queries** (always parenthesized, e.g., `-> (Status)`).

Query handler bodies are restricted to the activity statement set (no temporal primitives like timers, signals, or child workflows). Queries must not modify workflow state.

An optional `options:` block may lead the handler body. Query handler options: `description` (queries are synchronous and read-only, so `unfinished_policy` does not apply).

## Update Declarations

Update handlers are defined at the beginning of workflows with handler body blocks:

```
update_decl ::= 'update' IDENT params '->' return_type ':' NEWLINE
                INDENT
                [options_block]
                statement*
                DEDENT
```

**Return type is required for updates** (always parenthesized, e.g., `-> (Result)`).

Update handler bodies execute when the update is received. Handlers have access to the full workflow statement set and can return values to the caller.

An optional `options:` block may lead the handler body. Update handler options: `unfinished_policy`, `description`.
