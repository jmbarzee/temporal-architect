package lexer

import (
	"strings"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/token"
)

// lineEndsSource exercises every token kind that meets a line end: a comment,
// a trailing comment after a block header, a string, a multi-line argument
// list, a raw text run, blank lines, indentation and dedentation.
const lineEndsSource = `# header
workflow W(x): # trailing
    s = "done"

    activity A(a,
        b) -> r
    x = y + 1
        z = 2

activity A(x):
    return x
`

// A CRLF file lexes as its LF twin: the same tokens on the same lines and
// columns, with no "\r" in any literal and offsets that index the CRLF source.
func TestCRLFLexesAsLF(t *testing.T) {
	for _, tc := range []struct{ name, lf string }{
		{"ends with a newline", lineEndsSource},
		{"ends without a newline", strings.TrimSuffix(lineEndsSource, "\n")},
	} {
		t.Run(tc.name, func(t *testing.T) {
			crlf := strings.ReplaceAll(tc.lf, "\n", "\r\n")
			want := New(tc.lf).AllTokens()
			got := New(crlf).AllTokens()
			if len(got) != len(want) {
				t.Fatalf("CRLF gives %d tokens, LF %d:\n%v\n%v", len(got), len(want), got, want)
			}
			for i := range want {
				g, w := got[i], want[i]
				if g.Type != w.Type || g.Literal != w.Literal || g.Line != w.Line || g.Column != w.Column {
					t.Errorf("token %d: CRLF %s %q at %d:%d, LF %s %q at %d:%d",
						i, g.Type, g.Literal, g.Line, g.Column, w.Type, w.Literal, w.Line, w.Column)
				}
				if strings.Contains(g.Literal, "\r") {
					t.Errorf("token %d: %s literal %q holds a \\r", i, g.Type, g.Literal)
				}
				span := crlf[g.Offset:g.End]
				switch g.Type {
				case token.NEWLINE:
					if span != "\r\n" && span != "" {
						t.Errorf("token %d: NEWLINE spans %q, want \"\\r\\n\"", i, span)
					}
				case token.IDENT, token.STRING, token.COMMENT, token.TRAILING_COMMENT, token.RAW_TEXT:
					if strings.Contains(span, "\r") {
						t.Errorf("token %d: %s spans %q, holding a \\r", i, g.Type, span)
					}
				}
			}
		})
	}
}

// A lone "\r" ending the input ends its last line.
func TestTrailingCarriageReturnEndsTheLine(t *testing.T) {
	assertTypes(t, "x\r", []token.TokenType{token.IDENT, token.NEWLINE, token.EOF})
	assertTypes(t, "workflow:\n    x\r", []token.TokenType{
		token.WORKFLOW, token.COLON, token.NEWLINE, token.INDENT, token.IDENT, token.NEWLINE, token.DEDENT, token.EOF,
	})
	assertTypes(t, "x # note\r", []token.TokenType{token.IDENT, token.COMMENT, token.NEWLINE, token.EOF})
}

// A string literal or a comment stops at a CRLF line end without taking the
// "\r": a string left open there is unterminated at its opening quote.
func TestCRLFEndsStringsAndComments(t *testing.T) {
	l := New("x # note\r\n\"open\r\ny")
	l.NextToken() // x
	if tok := l.NextToken(); tok.Type != token.COMMENT || tok.Literal != " note" {
		t.Errorf("got %s %q, want COMMENT \" note\"", tok.Type, tok.Literal)
	}
	l.NextToken() // NEWLINE
	if tok := l.NextToken(); tok.Type != token.ILLEGAL || tok.Literal != "unterminated string literal" || tok.Line != 2 || tok.Column != 1 {
		t.Errorf("got %s %q at %d:%d, want the unterminated string at 2:1", tok.Type, tok.Literal, tok.Line, tok.Column)
	}
	if tok := l.NextToken(); tok.Type != token.NEWLINE {
		t.Errorf("got %s %q, want NEWLINE", tok.Type, tok.Literal)
	}
	if tok := l.NextToken(); tok.Type != token.IDENT || tok.Line != 3 || tok.Column != 1 {
		t.Errorf("got %s %q at %d:%d, want IDENT at 3:1", tok.Type, tok.Literal, tok.Line, tok.Column)
	}
}

// A line of spaces and tabs in any mix is blank, wherever it stands; a space-only
// line already was.
func TestWhitespaceOnlyLinesAreBlank(t *testing.T) {
	block := []token.TokenType{
		token.WORKFLOW, token.COLON, token.NEWLINE,
		token.INDENT, token.IDENT, token.NEWLINE,
		token.IDENT, token.NEWLINE,
		token.DEDENT, token.ACTIVITY, token.NEWLINE, token.EOF,
	}
	for _, blank := range []string{"", " ", "\t", "\t\t", " \t", "\t ", "    \t  "} {
		for _, nl := range []string{"\n", "\r\n"} {
			src := strings.Join([]string{
				blank, "workflow:", blank, "    a", blank, "    b", blank, "activity", blank, "",
			}, nl)
			t.Run(strings.NewReplacer("\t", `\t`, "\r", `\r`).Replace(blank+nl), func(t *testing.T) {
				assertTypes(t, src, block)
			})
		}
	}
	// A whitespace line at the end of the input, with no line end after it,
	// lexes as a space-only one does.
	var spaceTail []token.TokenType
	for _, tok := range New("workflow:\n    a\n ").AllTokens() {
		spaceTail = append(spaceTail, tok.Type)
	}
	for _, tail := range []string{"\t", " \t", "\t "} {
		assertTypes(t, "workflow:\n    a\n"+tail, spaceTail)
	}
}

// A blank line of tabs between a block header and its block leaves the
// header's trailing comment discarded, as a blank line of spaces does.
func TestTabBlankLineUnderBlockHeader(t *testing.T) {
	assertTypes(t, "workflow: # note\n\t\n    a\n", []token.TokenType{
		token.WORKFLOW, token.COLON, token.TRAILING_COMMENT, token.NEWLINE, token.INDENT, token.IDENT, token.NEWLINE, token.DEDENT, token.EOF,
	})
}

// A tab after a line's first token is whitespace between tokens.
func TestTabBetweenTokensIsWhitespace(t *testing.T) {
	assertTypes(t, "break\t\n", []token.TokenType{token.BREAK, token.NEWLINE, token.EOF})
	assertTypes(t, "set\tReady \t# note\n", []token.TokenType{token.SET, token.IDENT, token.COMMENT, token.NEWLINE, token.EOF})
	assertTypes(t, "workflow:\t# note\n    a\n", []token.TokenType{
		token.WORKFLOW, token.COLON, token.TRAILING_COMMENT, token.NEWLINE, token.INDENT, token.IDENT, token.NEWLINE, token.DEDENT, token.EOF,
	})
}

// assertTypes checks the token types src lexes to.
func assertTypes(t *testing.T, src string, want []token.TokenType) {
	t.Helper()
	var got []token.TokenType
	for _, tok := range New(src).AllTokens() {
		got = append(got, tok.Type)
	}
	if len(got) != len(want) {
		t.Errorf("%q lexes to %v, want %v", src, got, want)
		return
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("%q lexes to %v, want %v", src, got, want)
			return
		}
	}
}
