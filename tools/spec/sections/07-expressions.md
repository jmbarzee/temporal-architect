# Expressions

```
expr ::= IDENT
       | NUMBER
       | STRING
       | 'true' | 'false'
       | 'null'
       | binary_expr
       | unary_expr
       | call_expr
       | index_expr
       | field_expr
       | constructor_expr

binary_expr ::= expr binary_op expr
binary_op ::= '+' | '-' | '*' | '/' | '%'
            | '==' | '!=' | '<' | '<=' | '>' | '>='
            | 'and' | 'or'

unary_expr ::= unary_op expr
unary_op ::= '-' | 'not'

call_expr ::= IDENT '(' [arg_list] ')'
index_expr ::= expr '[' expr ']'
field_expr ::= expr '.' IDENT
constructor_expr ::= IDENT '{' [field_list] '}'
field_list ::= field (',' field)*
field ::= IDENT ':' expr
```
