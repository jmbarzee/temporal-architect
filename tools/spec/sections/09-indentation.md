# Indentation Rules

TWF uses **indentation-based scoping** (like Python):

1. **Consistent indentation:** Use either tabs or spaces consistently throughout a file
2. **Block start:** A colon (`:`) followed by NEWLINE and INDENT starts a new block
3. **Block end:** DEDENT ends the current block
4. **Blank lines:** Blank lines (with or without whitespace) are skipped
5. **No mixing:** Do not mix tabs and spaces in the same file

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
