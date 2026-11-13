# Statements

A body context has one statement set, assigned in [Context Restrictions](./10-context-restrictions.md#handler-body-contexts). A statement outside its context's set is an error.

## Workflow Statements

Available in workflow definitions and signal and update handlers. `signal_send_stmt` (cross-workflow signal send, addressed by handle or by workflow type + ID) is a workflow-context statement; it is not available in the activity statement set below. It may be the first body statement.

```
statement ::= activity_call
            | workflow_call
            | nexus_call
            | signal_send_stmt
            | promise_stmt
            | set_stmt
            | unset_stmt
            | await_stmt
            | await_all_block
            | await_one_block
            | switch_block
            | if_stmt
            | for_stmt
            | close_stmt
            | return_stmt
            | break_stmt
            | continue_stmt
            | assignment
```

## Client Statements

Available in a sync nexus operation body, which runs as a Temporal client with no workflow context. A `workflow_call` is a client start (`detach` included) and `close_stmt` takes `complete` or `fail`, as a client run has no run to continue as new.

```
statement ::= workflow_call
            | signal_send_stmt
            | close_stmt
            | switch_block
            | if_stmt
            | for_stmt
            | return_stmt
            | break_stmt
            | continue_stmt
            | assignment
```

## Activity Statements

Available in activity definitions and query handlers:

```
statement ::= heartbeat_stmt
            | switch_block
            | if_stmt
            | for_stmt
            | return_stmt
            | break_stmt
            | continue_stmt
            | assignment
```

For the syntax of each statement form, see [Statement Syntax](./06-statement-syntax.md).

## Statement Lines

A statement ends with its line. Only a comment may follow it there: `break Missing` or
`set Ready later` is a syntax error, not a statement followed by a raw line. This holds for every
statement of a fixed form (calls, sends, `await`, `promise`, `set`, `unset`, `close`, `break`,
`continue`) and for the `condition`, `id_scheme:` and nexus `async` operation lines.

A tool that reports every error at once (`twf check`, the language server) leaves a failed statement
out and keeps parsing the rest of its body: the line, any block indented under it, and, for an `if`,
its one `else:` clause are skipped, and the definition holding them stays in the result. A failed
line among a workflow's handler declarations or `state:` conditions is left out the same way. A
complete statement followed by stray tokens is kept; only the stray tokens are skipped. A line
indented under a statement that opens no block is `unexpected indent` (see [Indentation
Rules](./09-indentation.md)); the indented block is skipped and the body around it keeps parsing.
