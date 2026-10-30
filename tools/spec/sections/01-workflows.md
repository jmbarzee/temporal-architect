# Workflow Definitions

```
workflow_def ::= 'workflow' IDENT params ['->' return_type] ':' NEWLINE
                 INDENT
                 [id_scheme]
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

**Important:** The body opens in a fixed order: an optional `id_scheme:` line, an optional `default_options:` block, the state block, then signal/query/update declarations, then body statements. Each signal/query/update can only be declared once per workflow. Handler declarations end at the first body statement: a `signal`/`query`/`update` declaration after it is a targeted parse error. (A cross-workflow signal *send* may be the first body statement — see [Tokens and Keywords](./08-tokens-and-keywords.md) for how `signal` is disambiguated.)

An optional `default_options:` block (see [Statement Syntax — Definition Default Options](./06-statement-syntax.md)) leads the workflow body (after any `id_scheme:` line), before the `state:` block. It supplies the call-option defaults (timeouts, id-reuse policy, retry policy, task queue, priority) for every call that starts this workflow; a call site's `options:` block overrides them per key. It appears above `state:` because a definition's defaults are its external invocation contract, which reads above its internal state.

**Cross-package references.** In a workflow *call* (`workflow Name(args)`, and its `detach` /
`promise` / `await` / `await one` variants), the callee name is a
[`qualified_ref`](./14-packages-and-imports.md) — it may carry an optional `pkg.` package
qualifier (`workflow orders.ProcessOrder(order)`) to name a workflow declared in another package.
The qualifier is bare for same-package workflows; a qualified callee resolves against the imported
package that declares it, and if that import is unresolved (external) the qualified call resolves as
external. The same holds for the workflow-type head of a cross-workflow signal send
(`signal orders.ShipItem.Shipped(t)`); a handle head is never qualified.

## ID Scheme

An optional `id_scheme:` declares how the workflow's ID derives from its inputs. Declare one only
for a workflow whose ID must be **reconstructed later** — by a sender that did not start it, a
retrying starter, or a client. Most workflows have none; a handle or the parent reconstructs
nothing.

```
id_scheme ::= 'id_scheme' ':' STRING NEWLINE
              # STRING ::= [fixed] ( '{' path '}' fixed )* [ '{' path '}' ]
              # path   ::= IDENT ('.' IDENT)*   — root is a declared param
```

```twf
workflow ShipItem(order: Order, item: Item) -> (Shipment):
    id_scheme: "ship-{order.id}-{item.id}"
    signal Shipped(trackingId: string):
        ...

workflow RateLimiter():
    id_scheme: "rate-limiter"          # constant: no holes
```

- `id_scheme` is a hard keyword and the **first** body element, at most once
  (`ID_SCHEME_MISPLACED`).
- Every hole is a path rooted at one of the workflow's own params. Fixed text is required between
  holes and the scheme must contain some; `{` and `}` are reserved for holes
  (`ID_SCHEME_MALFORMED`). A scheme with no holes is a constant — a singleton.
- **The ID derives from the inputs.** Starts never write an ID: every start form is unchanged and
  its ID follows from its args. Nothing overrides a scheme — it is not an option because options
  are overridable per call site, and `id:`/`run_id:` under a start or `workflow_id:` in a start's
  `options:` is `ID_AT_START`.
- A type whose ID needs data its input lacks gets no scheme; the fix is adding the key to the input.
- `close continue_as_new(...)` must pass the same values for the scheme's roots. The args are
  opaque, so this is a design rule, not a check.

Senders address a schemed workflow as described in
[Cross-Workflow Signals](./13-cross-workflow-signals.md).

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
