// Package format rewrites .twf source into its canonical form. Today that is
// indentation only, one tab per level; #337 extends it.
package format

import (
	"fmt"
	"strings"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/lexer"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/token"
)

// tabStop is the column width of a tab when indentation mixes tabs and spaces.
const tabStop = 4

// Indent returns src with each line's indentation rewritten to one tab per
// level. Levels are read as a reader sees them: by column, a tab every four,
// each deeper statement line opening a level and a shallower one closing back
// to the level at its column. A comment line takes the level at its column
// without opening one. A space-indented file's lines inside a multi-line
// argument list keep their offset, converted at the file's space unit; a
// whitespace-only line becomes empty. Nothing but leading whitespace changes,
// and Indent of its own output is that output.
//
// A statement line that closes to a column no open level has cannot be read,
// so Indent returns src unchanged and an error naming the line.
func Indent(src string) (string, error) {
	lines := strings.Split(src, "\n")
	starts := lineStarts(src)
	levels := map[int]int{}
	stack := []int{0}
	for i, line := range lines {
		comment, ok := starts[i+1]
		if !ok {
			continue
		}
		col := column(line)
		top := stack[len(stack)-1]
		switch {
		case comment && col > top:
			levels[i] = len(stack)
		case comment:
			levels[i] = deepest(stack, col)
		case col > top:
			stack = append(stack, col)
			levels[i] = len(stack) - 1
		default:
			for col < stack[len(stack)-1] {
				stack = stack[:len(stack)-1]
			}
			if col != stack[len(stack)-1] {
				return src, fmt.Errorf("line %d: its indentation matches no open block, so its level is unclear; indent it with tabs by hand", i+1)
			}
			levels[i] = len(stack) - 1
		}
	}
	unit := spaceUnit(lines, starts)
	for i, line := range lines {
		body := strings.TrimLeft(line, " \t")
		if strings.TrimSuffix(body, "\r") == "" {
			lines[i] = body
			continue
		}
		run := line[:len(line)-len(body)]
		if level, ok := levels[i]; ok {
			lines[i] = strings.Repeat("\t", level) + body
		} else if unit > 0 && run != "" {
			// A continuation line of an argument list: same offset, in tabs.
			shown := width(run, unit)
			lines[i] = strings.Repeat("\t", shown/unit) + strings.Repeat(" ", shown%unit) + body
		}
	}
	return strings.Join(lines, "\n"), nil
}

// lineStarts maps each line that starts a statement or comment (1-based) to
// whether it is a comment line. Lines inside a multi-line argument list start
// nothing.
func lineStarts(src string) map[int]bool {
	starts := map[int]bool{}
	at := true // the next token starts a line
	for _, tok := range lexer.New(src).AllTokens() {
		switch tok.Type {
		case token.NEWLINE:
			at = true
		case token.INDENT, token.DEDENT, token.EOF:
		case token.ILLEGAL:
			// An indentation error stands before its line's first token.
		default:
			if at {
				starts[tok.Line] = tok.Type == token.COMMENT
			}
			at = false
		}
	}
	return starts
}

// column is the display column of line's first character, a tab every four.
func column(line string) int {
	return width(line[:len(line)-len(strings.TrimLeft(line, " \t"))], tabStop)
}

// width is the display width of an indentation run, a tab every stop columns.
func width(run string, stop int) int {
	w := 0
	for _, ch := range run {
		if ch == '\t' {
			w += stop - w%stop
		} else {
			w++
		}
	}
	return w
}

// deepest returns the deepest level in stack whose column is at most col.
func deepest(stack []int, col int) int {
	for i := len(stack) - 1; i > 0; i-- {
		if stack[i] <= col {
			return i
		}
	}
	return 0
}

// spaceUnit returns the width of a space-indented file's first indented
// statement line, the unit its argument-list continuation lines are converted
// at, or 0 when that line holds a tab (the file is tab-indented; continuations
// stay as written).
func spaceUnit(lines []string, starts map[int]bool) int {
	for i, line := range lines {
		if comment, ok := starts[i+1]; !ok || comment {
			continue
		}
		run := line[:len(line)-len(strings.TrimLeft(line, " \t"))]
		switch {
		case run == "":
			continue
		case strings.Trim(run, " ") == "":
			return len(run)
		default:
			return 0
		}
	}
	return 0
}
