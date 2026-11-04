# Indentation Rules

TWF uses **indentation-based scoping** (like Python):

1. **Consistent indentation:** Use either tabs or spaces consistently throughout a file
2. **Block start:** A colon (`:`) followed by NEWLINE and INDENT starts a new block
3. **Block end:** DEDENT ends the current block
4. **Nothing else indents:** Only a block header ending in `:`, a call with its `options:` block
   and a signal send with its address take lines indented under them. A line indented under any other statement
   (a call with no `options:`, `close`, `set`, a raw line) is `unexpected indent`, in every body,
   an activity's included: raw pseudocode does not continue onto an indented line. Comment lines
   alone may sit indented under any statement, and the lines of a multi-line `( … )` argument list
   may be indented freely
5. **Blank lines:** Blank lines, empty or holding any mix of spaces and tabs, are skipped
6. **No mixing:** Do not mix tabs and spaces in the same file

## Example

```
workflow Example(x: int) -> (Result):
    signal Done():
        status = "done"

    if (x > 0):
        activity DoWork(x)
    else:
        await timer(1h)

    return Result{status: status}
```
