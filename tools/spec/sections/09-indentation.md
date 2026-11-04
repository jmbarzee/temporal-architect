# Indentation Rules

TWF uses **indentation-based scoping** (like Python):

1. **Tabs are canonical:** Indent with one tab per level. Spaces are also accepted
2. **One style per file:** The file's first indented line fixes its style, tabs or spaces
3. **Levels compare by prefix:** A line is deeper than its block when its indentation extends the block's, and closes blocks back to the one whose indentation it equals. A tab's display width never matters
4. **Block start:** A colon (`:`) followed by NEWLINE and INDENT starts a new block
5. **Block end:** DEDENT ends the current block
6. **Blank lines:** Blank lines, empty or holding any mix of spaces and tabs, are skipped
7. **No mixing:** Indentation that mixes tabs and spaces, within a line or across a file's lines, is a `LEX` error at the offending character, naming the file's style. Each such line is placed where an editor shows it (a tab stop at a spaces file's first indent width, or every four columns in a tab file), so a block written wholly in the other style keeps its structure. A stray character after a line's indentation is ignored when that indentation is already an open level, except on the first line under a block header, which must be deeper

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
