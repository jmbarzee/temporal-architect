# Statements

## Workflow Statements

Available in workflow context (workflow definitions, signal/update handlers, and sync nexus operation bodies). `signal_send_stmt` (cross-workflow signal send) is a workflow-context statement; it is not available in the activity statement set below.

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

## Activity Statements

Available in activity context (activity definitions and query handlers):

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
