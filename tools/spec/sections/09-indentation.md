# Indentation Rules

TWF uses **indentation-based scoping** (like Python):

1. **Tabs only:** Indent with one tab per level. A space in a line's indentation is a `LEX` error
2. **Levels count tabs:** A line is deeper than its block when it has more tabs, and closes blocks back to the one with as many. A tab's display width never matters
3. **Block start:** A colon (`:`) followed by NEWLINE and INDENT starts a new block
4. **Block end:** DEDENT ends the current block
5. **Nothing else indents:** Only a block header ending in `:`, a call with its `options:` block and a signal send with its address take lines indented under them. A line indented under any other statement (a call with no `options:`, `close`, `set`, a raw line) is `unexpected indent`, in every body, an activity's included: raw pseudocode does not continue onto an indented line. Comment lines alone may sit indented under any statement, and the lines of a multi-line `( … )` argument list may be indented freely
6. **Blank lines:** Blank lines, empty or holding any mix of spaces and tabs, are skipped
7. **Spaces are errors:** A line whose indentation holds a space, alone or mixed with tabs, is one `LEX` error at its first space. For recovery the line is placed where an editor shows it, with a tab stop every four columns, so a block indented with spaces keeps its structure. A stray space after a line's tabs is ignored when those tabs are already an open level, except on the first line under a block header, which must be deeper

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
