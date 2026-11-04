package main

import (
	"fmt"
	"regexp"
	"strings"
)

// Tabify re-indents .twf source with one tab per indent level, the lexer's
// way: a line deeper than its block opens a level, and a shallower one closes
// levels back to the block it matches, so the space unit (two, four, or a mix)
// never has to be guessed. A continuation line inside a multi-line argument
// list is not a level; it gets one tab per unit of the file's first indent
// level, then spaces for what is left, keeping its alignment. Blank lines
// become empty. Source already indented with tabs comes back unchanged, so a
// second run changes nothing. Source that mixes tabs and spaces, or dedents to
// a width no open block has, is an error.
func Tabify(src string) (string, error) {
	lines := strings.Split(src, "\n")
	if done, err := tabbed(lines); done || err != nil {
		return src, err
	}
	stack := []int{0}
	unit := 0
	depth := 0 // open delimiters of an argument list at the line's start
	for i, line := range lines {
		body := strings.TrimLeft(line, " ")
		width := len(line) - len(body)
		switch {
		case strings.TrimLeft(body, "\t") == "":
			lines[i] = ""
			continue
		case depth > 0:
			u := unit
			if u == 0 {
				u = 4
			}
			lines[i] = strings.Repeat("\t", width/u) + strings.Repeat(" ", width%u) + body
		default:
			if width > stack[len(stack)-1] {
				stack = append(stack, width)
			}
			for width < stack[len(stack)-1] {
				stack = stack[:len(stack)-1]
			}
			if width != stack[len(stack)-1] {
				return src, fmt.Errorf("line %d: dedents to %d spaces, which no open block is indented at", i+1, width)
			}
			if unit == 0 && width > 0 {
				unit = width
			}
			lines[i] = strings.Repeat("\t", len(stack)-1) + body
		}
		depth = argDepth(body, depth)
	}
	return strings.Join(lines, "\n"), nil
}

// tabbed reports whether every indented line outside an argument list is
// indented with tabs only, and errors when some are and others are not.
func tabbed(lines []string) (bool, error) {
	tabs, spaces := 0, 0
	depth := 0
	for i, line := range lines {
		body := strings.TrimLeft(line, " \t")
		run := line[:len(line)-len(body)]
		if body != "" && depth == 0 && run != "" {
			switch {
			case strings.Trim(run, "\t") == "":
				tabs++
			case strings.Trim(run, " ") == "":
				spaces++
			default:
				return false, fmt.Errorf("line %d: indentation mixes tabs and spaces", i+1)
			}
			if tabs > 0 && spaces > 0 {
				return false, fmt.Errorf("line %d: indented differently from the lines before it", i+1)
			}
		}
		depth = argDepth(body, depth)
	}
	return tabs > 0, nil
}

// argDepth returns how many delimiters of an argument list are open after
// body, given depth open before it. It scans as the lexer does: an argument
// list opens at '(' and nests '(' '{' '['; strings are skipped whole; outside
// an argument list, '#' starts a comment.
func argDepth(body string, depth int) int {
	for i := 0; i < len(body); i++ {
		switch ch := body[i]; {
		case ch == '"':
			for i++; i < len(body) && body[i] != '"'; i++ {
				if body[i] == '\\' {
					i++
				}
			}
		case depth == 0 && ch == '#':
			return 0
		case depth == 0 && ch == '(':
			depth = 1
		case depth > 0 && strings.IndexByte("({[", ch) >= 0:
			depth++
		case depth > 0 && strings.IndexByte(")}]", ch) >= 0:
			depth--
		}
	}
	return depth
}

// fence matches the opening line of a twf code block in Markdown.
var fence = regexp.MustCompile("^([ \t]*)(```+|~~~+)twf[ \t]*$")

// TabifyMarkdown re-indents the body of every ```twf fenced block in md with
// Tabify, below the indentation the fence itself carries. The error names the
// block's first line.
func TabifyMarkdown(md string) (string, error) {
	lines := strings.Split(md, "\n")
	for i := 0; i < len(lines); i++ {
		m := fence.FindStringSubmatch(lines[i])
		if m == nil {
			continue
		}
		prefix, marker := m[1], m[2]
		start := i + 1
		end := start
		for end < len(lines) && !isClose(lines[end], marker) {
			end++
		}
		body := make([]string, end-start)
		for j, line := range lines[start:end] {
			body[j] = strings.TrimPrefix(line, prefix)
		}
		out, err := Tabify(strings.Join(body, "\n"))
		if err != nil {
			return md, fmt.Errorf("block at line %d: %w", i+1, err)
		}
		for j, line := range strings.Split(out, "\n") {
			if line != "" {
				line = prefix + line
			}
			lines[start+j] = line
		}
		i = end
	}
	return strings.Join(lines, "\n"), nil
}

// isClose reports whether line closes a fenced block opened by marker.
func isClose(line, marker string) bool {
	t := strings.TrimSpace(line)
	return strings.HasPrefix(t, marker) && strings.Trim(t, marker[:1]) == ""
}
