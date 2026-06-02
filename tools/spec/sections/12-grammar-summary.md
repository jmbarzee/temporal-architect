# Grammar Summary

```
file ::= definition*
definition ::= workflow_def | activity_def | worker_def | namespace_def | nexus_service_def

workflow_def ::= 'workflow' IDENT params ['->' return_type] ':'
                 NEWLINE INDENT
                 [state_block]
                 [signal_decl*] [query_decl*] [update_decl*]
                 statement*
                 DEDENT

activity_def ::= 'activity' IDENT params ['->' return_type] ':'
                 NEWLINE INDENT statement* DEDENT

worker_def ::= 'worker' IDENT ':' NEWLINE
               INDENT worker_entry* DEDENT
worker_entry ::= 'workflow' IDENT NEWLINE
               | 'activity' IDENT NEWLINE
               | 'nexus' 'service' IDENT NEWLINE

namespace_def ::= 'namespace' IDENT ':' NEWLINE
                  INDENT namespace_entry* DEDENT
namespace_entry ::= 'worker' IDENT NEWLINE [options_line]
                  | 'nexus' 'endpoint' IDENT NEWLINE [options_line]

nexus_service_def ::= 'nexus' 'service' IDENT ':' NEWLINE
                      INDENT nexus_operation* DEDENT
nexus_operation ::= 'async' IDENT 'workflow' IDENT NEWLINE
                  | 'sync' IDENT params '->' return_type ':' NEWLINE
                    INDENT statement* DEDENT

nexus_call ::= ['detach'] 'nexus' IDENT IDENT '.' IDENT args ['->' result] [NEWLINE options_line]

options_block ::= 'options' ':' NEWLINE INDENT option_entry+ DEDENT
option_entry  ::= IDENT ':' value NEWLINE
                | IDENT ':' NEWLINE INDENT option_entry+ DEDENT
value ::= STRING | DURATION | NUMBER | IDENT
DURATION ::= NUMBER ('ms' | 's' | 'm' | 'h' | 'd')

state_block ::= 'state' ':' NEWLINE INDENT state_stmt* DEDENT
state_stmt ::= condition_decl | raw_stmt
condition_decl ::= 'condition' IDENT NEWLINE

signal_decl ::= 'signal' IDENT params ':' NEWLINE INDENT statement* DEDENT
query_decl ::= 'query' IDENT params '->' return_type ':' NEWLINE INDENT statement* DEDENT
update_decl ::= 'update' IDENT params '->' return_type ':' NEWLINE INDENT statement* DEDENT

statement ::= activity_call | workflow_call | nexus_call | signal_send_stmt | promise_stmt
            | set_stmt | unset_stmt
            | await_stmt | await_all_block | await_one_block | switch_block
            | if_stmt | for_stmt | close_stmt | return_stmt
            | break_stmt | continue_stmt | assignment

signal_send_stmt ::= 'signal' send_target args NEWLINE
send_target ::= ident_handle_target
ident_handle_target ::= IDENT '.' IDENT

promise_stmt ::= 'promise' IDENT '<-' async_target NEWLINE
set_stmt ::= 'set' IDENT NEWLINE
unset_stmt ::= 'unset' IDENT NEWLINE

await_stmt ::= 'await' (timer_target | signal_target | update_target | activity_target | workflow_target | nexus_target | ident_target) NEWLINE
nexus_target ::= ['detach'] 'nexus' IDENT IDENT '.' IDENT args ['->' result]
ident_target ::= IDENT ['->' result]

await_one_case ::= signal_case | update_case | timer_case | activity_case | workflow_case | nexus_case | await_all_case | ident_case

signal_case ::= 'signal' IDENT ['->' params] ':' NEWLINE [INDENT statement+ DEDENT]

update_case ::= 'update' IDENT ['->' params] ':' NEWLINE [INDENT statement+ DEDENT]

timer_case ::= 'timer' '(' duration ')' ':' NEWLINE [INDENT statement+ DEDENT]

activity_case ::= 'activity' IDENT args ['->' result] ':' NEWLINE [INDENT statement+ DEDENT]

workflow_case ::= ['detach'] 'workflow' IDENT args ['->' result] ':' NEWLINE [INDENT statement+ DEDENT]

nexus_case ::= ['detach'] 'nexus' IDENT IDENT '.' IDENT args ['->' result] ':' NEWLINE [INDENT statement+ DEDENT]

ident_case ::= IDENT ['->' result] ':' NEWLINE [INDENT statement+ DEDENT]

close_stmt ::= 'close' ('complete' | 'fail' | 'continue_as_new') ['(' args ')'] NEWLINE
```
