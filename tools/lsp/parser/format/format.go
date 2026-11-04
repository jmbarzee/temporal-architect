// Package format rewrites .twf source into its canonical form. Today that is
// indentation only, one tab per level; #337 extends it.
package format

import (
	"strings"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/lexer"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/token"
)

// Indent returns src with each line's indentation rewritten to one tab per
// level, at the level the lexer places the line, so the result parses as src
// does, with no space-indentation errors. A space-indented file's lines inside
// a multi-line argument list keep their offset, converted at the file's space
// unit; a whitespace-only line becomes empty. Nothing but leading whitespace
// changes, and Indent of its own output is that output.
func Indent(src string) string {
	lines := strings.Split(src, "\n")
	levels := lineLevels(src)
	unit := spaceUnit(lines, levels)
	for i, line := range lines {
		body := strings.TrimLeft(line, " \t")
		if strings.TrimSuffix(body, "\r") == "" {
			lines[i] = body
			continue
		}
		run := line[:len(line)-len(body)]
		if level, ok := levels[i+1]; ok {
			lines[i] = strings.Repeat("\t", level) + body
		} else if unit > 0 && run != "" {
			// A continuation line of an argument list: same offset, in tabs.
			shown := 0
			for _, ch := range run {
				if ch == '\t' {
					shown += unit - shown%unit
				} else {
					shown++
				}
			}
			lines[i] = strings.Repeat("\t", shown/unit) + strings.Repeat(" ", shown%unit) + body
		}
	}
	return strings.Join(lines, "\n")
}

// lineLevels maps each line that starts a statement or comment (1-based) to
// its indent level: the lexer's depth when that line ends.
func lineLevels(src string) map[int]int {
	levels := map[int]int{}
	depth, start := 0, 0 // start: the line of the first token since the last NEWLINE
	for _, tok := range lexer.New(src).AllTokens() {
		switch tok.Type {
		case token.INDENT:
			depth++
		case token.DEDENT:
			depth--
		case token.NEWLINE:
			if start > 0 {
				levels[start] = depth
			}
			start = 0
		case token.EOF:
		default:
			if start == 0 {
				start = tok.Line
			}
		}
	}
	return levels
}

// spaceUnit returns the width of a space-indented file's first indented line,
// the unit its argument-list continuation lines are converted at, or 0 when
// that line holds a tab (the file is tab-indented; continuations stay).
func spaceUnit(lines []string, levels map[int]int) int {
	for i, line := range lines {
		if _, ok := levels[i+1]; !ok {
			continue
		}
		body := strings.TrimLeft(line, " \t")
		run := line[:len(line)-len(body)]
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
