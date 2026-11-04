package lexer

import (
	"slices"
	"strings"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/token"
)

// spaced re-indents a tab-indented src with four spaces per leading tab.
func spaced(src string) string {
	lines := strings.Split(src, "\n")
	for i, line := range lines {
		body := strings.TrimLeft(line, "\t")
		lines[i] = strings.Repeat("    ", len(line)-len(body)) + body
	}
	return strings.Join(lines, "\n")
}

// A space-indented file is one ILLEGAL per indented line, at its first space,
// and otherwise lexes as its tab-indented twin: the same tokens on the same
// lines, CRLF or not.
func TestSpacesAreRejectedButKeepStructure(t *testing.T) {
	const msg = "indented with spaces; .twf indents with tabs, one per level"
	for _, nl := range []string{"\n", "\r\n"} {
		tabs := strings.ReplaceAll(lineEndsSource, "\n", nl)
		want := New(tabs).AllTokens()
		got := New(strings.ReplaceAll(spaced(lineEndsSource), "\n", nl)).AllTokens()

		// The lines an indented token starts, where the twin must report.
		var indented []int
		lineStart := true
		for _, tok := range want {
			switch tok.Type {
			case token.NEWLINE:
				lineStart = true
				continue
			case token.INDENT, token.DEDENT:
				continue
			case token.ILLEGAL:
				t.Fatalf("%q: tab source holds ILLEGAL %q at %d:%d", nl, tok.Literal, tok.Line, tok.Column)
			}
			if lineStart && tok.Column > 1 {
				indented = append(indented, tok.Line)
			}
			lineStart = false
		}

		var reported []int
		var rest []token.Token
		for _, tok := range got {
			if tok.Type != token.ILLEGAL {
				rest = append(rest, tok)
				continue
			}
			if tok.Literal != msg || tok.Column != 1 {
				t.Errorf("%q: got %q at %d:%d, want %q at column 1", nl, tok.Literal, tok.Line, tok.Column, msg)
			}
			reported = append(reported, tok.Line)
		}
		if !slices.Equal(reported, indented) {
			t.Errorf("%q: errors on lines %v, want one on each indented line %v", nl, reported, indented)
		}
		if len(rest) != len(want) {
			t.Fatalf("%q: spaces give %d tokens, tabs %d:\n%v\n%v", nl, len(rest), len(want), rest, want)
		}
		for i := range want {
			g, w := rest[i], want[i]
			if g.Type != w.Type || g.Line != w.Line {
				t.Errorf("%q: token %d: spaces %s on line %d, tabs %s on line %d", nl, i, g.Type, g.Line, w.Type, w.Line)
			}
			// An argument list keeps its own whitespace; every other literal matches.
			if g.Type != token.ARGS && g.Literal != w.Literal {
				t.Errorf("%q: token %d: spaces %q, tabs %q", nl, i, g.Literal, w.Literal)
			}
		}
	}
}

// Each tab is one indent level and one column, at any depth.
func TestTabsNestBlocks(t *testing.T) {
	l := New("workflow:\n\tif:\n\t\tfor:\n\t\t\tx\n\ty\nz\n")
	var types []token.TokenType
	for _, tok := range l.AllTokens() {
		types = append(types, tok.Type)
		if tok.Type == token.IDENT && tok.Literal == "x" && tok.Column != 4 {
			t.Errorf("x at column %d, want 4", tok.Column)
		}
	}
	want := []token.TokenType{
		token.WORKFLOW, token.COLON, token.NEWLINE,
		token.INDENT, token.IF, token.COLON, token.NEWLINE,
		token.INDENT, token.FOR, token.COLON, token.NEWLINE,
		token.INDENT, token.IDENT, token.NEWLINE,
		token.DEDENT, token.DEDENT, token.IDENT, token.NEWLINE,
		token.DEDENT, token.IDENT, token.NEWLINE, token.EOF,
	}
	if !slices.Equal(types, want) {
		t.Errorf("lexes to %v, want %v", types, want)
	}
}

// A comment after a block header is a trailing comment under tabs.
func TestTabBlockHeaderTrailingComment(t *testing.T) {
	assertTypes(t, "workflow: # note\n\ta\n", []token.TokenType{
		token.WORKFLOW, token.COLON, token.TRAILING_COMMENT, token.NEWLINE, token.INDENT, token.IDENT, token.NEWLINE, token.DEDENT, token.EOF,
	})
}

// A space in a line's indentation, alone or mixed with tabs, is one ILLEGAL at
// the first space. The line's tokens still follow, at the level measureIndent
// places it. Blank lines are never checked.
func TestSpaceInIndentationIsAnError(t *testing.T) {
	const (
		spaces = "indented with spaces; .twf indents with tabs, one per level"
		mixes  = "indentation mixes tabs and spaces; .twf indents with tabs, one per level"
	)
	for _, tc := range []struct {
		name, src string
		line, col int
		msg       string
		want      []token.TokenType // the non-ILLEGAL tokens
	}{
		{
			name: "spaces",
			src:  "workflow:\n    a\n",
			line: 2, col: 1, msg: spaces,
			want: []token.TokenType{
				token.WORKFLOW, token.COLON, token.NEWLINE, token.INDENT, token.IDENT, token.NEWLINE, token.DEDENT, token.EOF,
			},
		},
		{
			name: "a tab after spaces shows a level deeper",
			src:  "workflow:\n\ta\n    \tclose\n",
			line: 3, col: 1, msg: mixes,
			want: []token.TokenType{
				token.WORKFLOW, token.COLON, token.NEWLINE, token.INDENT, token.IDENT, token.NEWLINE,
				token.INDENT, token.CLOSE, token.NEWLINE, token.DEDENT, token.DEDENT, token.EOF,
			},
		},
		{
			name: "spaces after a tab stay at the tab's level",
			src:  "workflow:\n\ta\n\t  b\n",
			line: 3, col: 2, msg: mixes,
			want: []token.TokenType{
				token.WORKFLOW, token.COLON, token.NEWLINE, token.INDENT, token.IDENT, token.NEWLINE,
				token.IDENT, token.NEWLINE, token.DEDENT, token.EOF,
			},
		},
		{
			name: "the first line under a header opens its block",
			src:  "workflow:\n\t    a\n",
			line: 2, col: 2, msg: mixes,
			want: []token.TokenType{
				token.WORKFLOW, token.COLON, token.NEWLINE, token.INDENT, token.IDENT, token.NEWLINE, token.DEDENT, token.EOF,
			},
		},
		{
			name: "a comment line is indentation too",
			src:  "workflow:\n\ta\n    # note\n",
			line: 3, col: 1, msg: spaces,
			want: []token.TokenType{
				token.WORKFLOW, token.COLON, token.NEWLINE, token.INDENT, token.IDENT, token.NEWLINE,
				token.COMMENT, token.NEWLINE, token.DEDENT, token.EOF,
			},
		},
		{
			name: "eight spaces sit at two tabs",
			src:  "workflow:\n\ta\n\nactivity:\n\t\tb\n        c\n",
			line: 6, col: 1, msg: spaces,
			want: []token.TokenType{
				token.WORKFLOW, token.COLON, token.NEWLINE, token.INDENT, token.IDENT, token.NEWLINE,
				token.DEDENT, token.ACTIVITY, token.COLON, token.NEWLINE, token.INDENT, token.IDENT, token.NEWLINE,
				token.IDENT, token.NEWLINE, token.DEDENT, token.EOF,
			},
		},
	} {
		for _, nl := range []string{"\n", "\r\n"} {
			t.Run(tc.name+strings.ReplaceAll(nl, "\r", `\r`), func(t *testing.T) {
				var illegal []token.Token
				var types []token.TokenType
				for _, tok := range New(strings.ReplaceAll(tc.src, "\n", nl)).AllTokens() {
					if tok.Type == token.ILLEGAL {
						illegal = append(illegal, tok)
						continue
					}
					types = append(types, tok.Type)
				}
				if len(illegal) != 1 {
					t.Fatalf("got %d ILLEGAL tokens %v, want 1", len(illegal), illegal)
				}
				if bad := illegal[0]; bad.Literal != tc.msg || bad.Line != tc.line || bad.Column != tc.col {
					t.Errorf("got %q at %d:%d, want %q at %d:%d", bad.Literal, bad.Line, bad.Column, tc.msg, tc.line, tc.col)
				}
				if !slices.Equal(types, tc.want) {
					t.Errorf("lexes to %v, want %v", types, tc.want)
				}
			})
		}
	}
}

// Whitespace on a blank line is never indentation.
func TestBlankLinesHoldAnyWhitespace(t *testing.T) {
	assertTypes(t, "workflow:\n\ta\n    \n \t \n\tb\n", []token.TokenType{
		token.WORKFLOW, token.COLON, token.NEWLINE, token.INDENT, token.IDENT, token.NEWLINE,
		token.IDENT, token.NEWLINE, token.DEDENT, token.EOF,
	})
}
