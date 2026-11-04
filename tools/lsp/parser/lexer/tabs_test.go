package lexer

import (
	"slices"
	"strings"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/token"
)

// tabify re-indents a four-space-indented src with one tab per level.
func tabify(t *testing.T, src string) string {
	t.Helper()
	lines := strings.Split(src, "\n")
	for i, line := range lines {
		body := strings.TrimLeft(line, " ")
		width := len(line) - len(body)
		if width%4 != 0 {
			t.Fatalf("line %d is indented %d spaces, not a multiple of four", i+1, width)
		}
		lines[i] = strings.Repeat("\t", width/4) + body
	}
	return strings.Join(lines, "\n")
}

// A tab-indented file lexes as its space-indented twin: the same tokens on the
// same lines, CRLF or not.
func TestTabsLexAsSpaces(t *testing.T) {
	for _, nl := range []string{"\n", "\r\n"} {
		spaces := strings.ReplaceAll(lineEndsSource, "\n", nl)
		tabs := strings.ReplaceAll(tabify(t, lineEndsSource), "\n", nl)
		want := New(spaces).AllTokens()
		got := New(tabs).AllTokens()
		if len(got) != len(want) {
			t.Fatalf("%q: tabs give %d tokens, spaces %d:\n%v\n%v", nl, len(got), len(want), got, want)
		}
		for i := range want {
			g, w := got[i], want[i]
			if g.Type == token.ILLEGAL {
				t.Errorf("%q: token %d: ILLEGAL %q at %d:%d", nl, i, g.Literal, g.Line, g.Column)
			}
			if g.Type != w.Type || g.Line != w.Line {
				t.Errorf("%q: token %d: tabs %s on line %d, spaces %s on line %d", nl, i, g.Type, g.Line, w.Type, w.Line)
			}
			// An argument list keeps its own whitespace; every other literal matches.
			if g.Type != token.ARGS && g.Literal != w.Literal {
				t.Errorf("%q: token %d: tabs %q, spaces %q", nl, i, g.Literal, w.Literal)
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

// A comment after a block header is a trailing comment under tabs, as under spaces.
func TestTabBlockHeaderTrailingComment(t *testing.T) {
	assertTypes(t, "workflow: # note\n\ta\n", []token.TokenType{
		token.WORKFLOW, token.COLON, token.TRAILING_COMMENT, token.NEWLINE, token.INDENT, token.IDENT, token.NEWLINE, token.DEDENT, token.EOF,
	})
}

// Mixing tabs and spaces in indentation, within a line or across lines, is one
// ILLEGAL at the offending character, naming the style the file's first
// indented line set. The line keeps the level its leading run of that style
// gives it, or the current level when it starts off-style, so its tokens still
// follow. Blank lines are never checked.
func TestMixedIndentationIsAnError(t *testing.T) {
	for _, tc := range []struct {
		name, src string
		line, col int
		msg       string
		want      []token.TokenType // the non-ILLEGAL tokens
	}{
		{
			name: "tab after spaces within a line",
			src:  "workflow:\n    a\n    \tclose\n",
			line: 3, col: 5,
			msg: "indentation mixes tabs and spaces; this file indents with spaces (set by line 2)",
			want: []token.TokenType{
				token.WORKFLOW, token.COLON, token.NEWLINE, token.INDENT, token.IDENT, token.NEWLINE,
				token.CLOSE, token.NEWLINE, token.DEDENT, token.EOF,
			},
		},
		{
			name: "spaces after a tab within a line",
			src:  "workflow:\n\ta\n\t  b\n",
			line: 3, col: 2,
			msg: "indentation mixes tabs and spaces; this file indents with tabs (set by line 2)",
			want: []token.TokenType{
				token.WORKFLOW, token.COLON, token.NEWLINE, token.INDENT, token.IDENT, token.NEWLINE,
				token.IDENT, token.NEWLINE, token.DEDENT, token.EOF,
			},
		},
		{
			name: "the first indented line mixes",
			src:  "workflow:\n\t    a\n",
			line: 2, col: 2,
			msg: "indentation mixes tabs and spaces; this file indents with tabs (set by line 2)",
			want: []token.TokenType{
				token.WORKFLOW, token.COLON, token.NEWLINE, token.INDENT, token.IDENT, token.NEWLINE, token.DEDENT, token.EOF,
			},
		},
		{
			name: "a tab line in a spaces file",
			src:  "workflow:\n    a\n\tb\n",
			line: 3, col: 1,
			msg: "indented with tabs, but this file indents with spaces (set by line 2)",
			want: []token.TokenType{
				token.WORKFLOW, token.COLON, token.NEWLINE, token.INDENT, token.IDENT, token.NEWLINE,
				token.IDENT, token.NEWLINE, token.DEDENT, token.EOF,
			},
		},
		{
			name: "a spaces line in a tab file, in a later definition",
			src:  "workflow:\n\ta\n\nactivity:\n\t\tb\n        c\n",
			line: 6, col: 1,
			msg: "indented with spaces, but this file indents with tabs (set by line 2)",
			want: []token.TokenType{
				token.WORKFLOW, token.COLON, token.NEWLINE, token.INDENT, token.IDENT, token.NEWLINE,
				token.DEDENT, token.ACTIVITY, token.COLON, token.NEWLINE, token.INDENT, token.IDENT, token.NEWLINE,
				token.IDENT, token.NEWLINE, token.DEDENT, token.EOF,
			},
		},
		{
			name: "a comment line is indentation too",
			src:  "workflow:\n\ta\n    # note\n",
			line: 3, col: 1,
			msg: "indented with spaces, but this file indents with tabs (set by line 2)",
			want: []token.TokenType{
				token.WORKFLOW, token.COLON, token.NEWLINE, token.INDENT, token.IDENT, token.NEWLINE,
				token.COMMENT, token.NEWLINE, token.DEDENT, token.EOF,
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

// Whitespace on a blank line is never indentation, in either style.
func TestBlankLinesIgnoreIndentStyle(t *testing.T) {
	want := []token.TokenType{
		token.WORKFLOW, token.COLON, token.NEWLINE, token.INDENT, token.IDENT, token.NEWLINE,
		token.IDENT, token.NEWLINE, token.DEDENT, token.EOF,
	}
	assertTypes(t, "workflow:\n\ta\n    \n \t \n\tb\n", want)
	assertTypes(t, "workflow:\n    a\n\t\n\t  \n    b\n", want)
}
