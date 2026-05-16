# Statements

## Workflow Statements

Available in workflow context (workflow definitions and signal/update handlers):

```
statement ::= activity_call
            | workflow_call
            | nexus_call
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
