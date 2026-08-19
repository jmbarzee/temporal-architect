package lexer

import (
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/token"
)

func TestKeywords(t *testing.T) {
	input := "workflow activity signal query update detach nexus promise condition set unset state timer options await all one switch case if else for in close complete fail return continue_as_new break continue"
	expected := []token.TokenType{
		token.WORKFLOW, token.ACTIVITY, token.SIGNAL, token.QUERY, token.UPDATE,
		token.DETACH, token.NEXUS, token.PROMISE, token.CONDITION, token.SET, token.UNSET, token.STATE,
		token.TIMER, token.OPTIONS,
		token.AWAIT, token.ALL, token.ONE, token.SWITCH,
		token.CASE, token.IF, token.ELSE, token.FOR, token.IN,
		token.CLOSE, token.COMPLETE, token.FAIL,
		token.RETURN, token.CONTINUE_AS_NEW, token.BREAK, token.CONTINUE,
		token.NEWLINE, token.EOF,
	}
	l := New(input)
	for i, exp := range expected {
		tok := l.NextToken()
		if tok.Type != exp {
			t.Fatalf("token[%d]: expected %s, got %s (%q)", i, exp, tok.Type, tok.Literal)
		}
	}
}

func TestContinueVsContinueAsNew(t *testing.T) {
	input := "continue\ncontinue_as_new"
	l := New(input)
	tok := l.NextToken()
	if tok.Type != token.CONTINUE {
		t.Fatalf("expected CONTINUE, got %s", tok.Type)
	}
	l.NextToken() // NEWLINE
	tok = l.NextToken()
	if tok.Type != token.CONTINUE_AS_NEW {
		t.Fatalf("expected CONTINUE_AS_NEW, got %s", tok.Type)
	}
}

func TestIdentifier(t *testing.T) {
	input := "OrderFulfillment"
	l := New(input)
	tok := l.NextToken()
	if tok.Type != token.IDENT {
		t.Fatalf("expected IDENT, got %s", tok.Type)
	}
	if tok.Literal != "OrderFulfillment" {
		t.Fatalf("expected literal 'OrderFulfillment', got %q", tok.Literal)
	}
}

func TestSingleLevelIndent(t *testing.T) {
	input := "workflow:\n    body\n"
	expected := []token.TokenType{
		token.WORKFLOW, token.COLON, token.NEWLINE,
		token.INDENT, token.IDENT, token.NEWLINE,
		token.DEDENT, token.EOF,
	}
	l := New(input)
	for i, exp := range expected {
		tok := l.NextToken()
		if tok.Type != exp {
			t.Fatalf("token[%d]: expected %s, got %s (%q)", i, exp, tok.Type, tok.Literal)
		}
	}
}

func TestNestedIndent(t *testing.T) {
	input := "a:\n    b:\n        c\n"
	expected := []token.TokenType{
		token.IDENT, token.COLON, token.NEWLINE,
		token.INDENT, token.IDENT, token.COLON, token.NEWLINE,
		token.INDENT, token.IDENT, token.NEWLINE,
		token.DEDENT, token.DEDENT, token.EOF,
	}
	l := New(input)
	for i, exp := range expected {
		tok := l.NextToken()
		if tok.Type != exp {
			t.Fatalf("token[%d]: expected %s, got %s (%q)", i, exp, tok.Type, tok.Literal)
		}
	}
}

func TestMultiLevelDedent(t *testing.T) {
	input := "a:\n    b:\n        c\nd\n"
	expected := []token.TokenType{
		token.IDENT, token.COLON, token.NEWLINE,
		token.INDENT, token.IDENT, token.COLON, token.NEWLINE,
		token.INDENT, token.IDENT, token.NEWLINE,
		token.DEDENT, token.DEDENT,
		token.IDENT, token.NEWLINE,
		token.EOF,
	}
	l := New(input)
	for i, exp := range expected {
		tok := l.NextToken()
		if tok.Type != exp {
			t.Fatalf("token[%d]: expected %s, got %s (%q)", i, exp, tok.Type, tok.Literal)
		}
	}
}

func TestBlankLineSkipping(t *testing.T) {
	input := "a:\n    b\n\n    c\n"
	expected := []token.TokenType{
		token.IDENT, token.COLON, token.NEWLINE,
		token.INDENT, token.IDENT, token.NEWLINE,
		// blank line skipped
		token.IDENT, token.NEWLINE,
		token.DEDENT, token.EOF,
	}
	l := New(input)
	for i, exp := range expected {
		tok := l.NextToken()
		if tok.Type != exp {
			t.Fatalf("token[%d]: expected %s, got %s (%q)", i, exp, tok.Type, tok.Literal)
		}
	}
}

func TestBlankLineWithSpacesSkipping(t *testing.T) {
	input := "a:\n    b\n    \n    c\n"
	expected := []token.TokenType{
		token.IDENT, token.COLON, token.NEWLINE,
		token.INDENT, token.IDENT, token.NEWLINE,
		// blank line (spaces only) skipped
		token.IDENT, token.NEWLINE,
		token.DEDENT, token.EOF,
	}
	l := New(input)
	for i, exp := range expected {
		tok := l.NextToken()
		if tok.Type != exp {
			t.Fatalf("token[%d]: expected %s, got %s (%q)", i, exp, tok.Type, tok.Literal)
		}
	}
}

func TestArgs(t *testing.T) {
	input := "foo(bar, baz)"
	l := New(input)
	tok := l.NextToken() // IDENT "foo"
	if tok.Type != token.IDENT {
		t.Fatalf("expected IDENT, got %s", tok.Type)
	}
	tok = l.NextToken() // ARGS
	if tok.Type != token.ARGS {
		t.Fatalf("expected ARGS, got %s", tok.Type)
	}
	if tok.Literal != "bar, baz" {
		t.Fatalf("expected args literal 'bar, baz', got %q", tok.Literal)
	}
}

func TestArgsTracksNestedParens(t *testing.T) {
	// Nested parens are now balanced: the ARGS token ends at the ')' that
	// matches the opening '(', not at the first ')'.
	//
	// "(a(b))" — the inner ')' closes the inner '(', the outer ')' closes the
	// group: content is "a(b)".
	l := New("(a(b))")
	tok := l.NextToken()
	if tok.Type != token.ARGS {
		t.Fatalf("expected ARGS, got %s (%q)", tok.Type, tok.Literal)
	}
	if tok.Literal != "a(b)" {
		t.Fatalf("expected 'a(b)', got %q", tok.Literal)
	}

	// "(a(b)" — the outer '(' is never matched, so the group is unterminated: a
	// loud error at the opening '(', not a silent close at the first ')'.
	l = New("(a(b)")
	tok = l.NextToken()
	if tok.Type != token.ILLEGAL {
		t.Fatalf("expected ILLEGAL for unbalanced parens, got %s (%q)", tok.Type, tok.Literal)
	}
	if tok.Literal != "unterminated argument list" {
		t.Fatalf("expected 'unterminated argument list', got %q", tok.Literal)
	}
}

func TestString(t *testing.T) {
	input := `"payments"`
	l := New(input)
	tok := l.NextToken()
	if tok.Type != token.STRING {
		t.Fatalf("expected STRING, got %s", tok.Type)
	}
	if tok.Literal != "payments" {
		t.Fatalf("expected 'payments', got %q", tok.Literal)
	}
}

func TestArrow(t *testing.T) {
	input := "a -> b"
	expected := []token.TokenType{
		token.IDENT, token.ARROW, token.IDENT, token.NEWLINE, token.EOF,
	}
	l := New(input)
	for i, exp := range expected {
		tok := l.NextToken()
		if tok.Type != exp {
			t.Fatalf("token[%d]: expected %s, got %s (%q)", i, exp, tok.Type, tok.Literal)
		}
	}
}

func TestComment(t *testing.T) {
	input := "# this is a comment\n"
	l := New(input)
	tok := l.NextToken()
	if tok.Type != token.COMMENT {
		t.Fatalf("expected COMMENT, got %s", tok.Type)
	}
	if tok.Literal != " this is a comment" {
		t.Fatalf("expected ' this is a comment', got %q", tok.Literal)
	}
}

func TestColon(t *testing.T) {
	input := "workflow:"
	l := New(input)
	l.NextToken() // WORKFLOW
	tok := l.NextToken()
	if tok.Type != token.COLON {
		t.Fatalf("expected COLON, got %s", tok.Type)
	}
}

func TestEOFDedentEmission(t *testing.T) {
	input := "a:\n    b:\n        c"
	expected := []token.TokenType{
		token.IDENT, token.COLON, token.NEWLINE,
		token.INDENT, token.IDENT, token.COLON, token.NEWLINE,
		token.INDENT, token.IDENT,
		// no trailing newline, but should still get dedents + EOF
		token.NEWLINE, token.DEDENT, token.DEDENT, token.EOF,
	}
	l := New(input)
	for i, exp := range expected {
		tok := l.NextToken()
		if tok.Type != exp {
			t.Fatalf("token[%d]: expected %s, got %s (%q)", i, exp, tok.Type, tok.Literal)
		}
	}
}

func TestWorkflowHeaderTokenStream(t *testing.T) {
	input := `workflow OrderFulfillment(orderId: string) -> (OrderResult):
    activity GetOrder(orderId) -> order
`
	expected := []struct {
		typ token.TokenType
		lit string
	}{
		{token.WORKFLOW, "workflow"},
		{token.IDENT, "OrderFulfillment"},
		{token.ARGS, "orderId: string"},
		{token.ARROW, "->"},
		{token.ARGS, "OrderResult"},
		{token.COLON, ":"},
		{token.NEWLINE, ""},
		{token.INDENT, ""},
		{token.ACTIVITY, "activity"},
		{token.IDENT, "GetOrder"},
		{token.ARGS, "orderId"},
		{token.ARROW, "->"},
		{token.IDENT, "order"},
		{token.NEWLINE, ""},
		{token.DEDENT, ""},
		{token.EOF, ""},
	}
	l := New(input)
	for i, exp := range expected {
		tok := l.NextToken()
		if tok.Type != exp.typ {
			t.Fatalf("token[%d]: expected type %s, got %s (%q)", i, exp.typ, tok.Type, tok.Literal)
		}
		if exp.lit != "" && tok.Literal != exp.lit {
			t.Fatalf("token[%d]: expected literal %q, got %q", i, exp.lit, tok.Literal)
		}
	}
}

func TestRawText(t *testing.T) {
	input := "= +"
	l := New(input)
	tok := l.NextToken()
	if tok.Type != token.RAW_TEXT {
		t.Fatalf("expected RAW_TEXT, got %s", tok.Type)
	}
	if tok.Literal != "=" {
		t.Fatalf("expected '=', got %q", tok.Literal)
	}
}

func TestLineNumbers(t *testing.T) {
	input := "a\nb\nc\n"
	l := New(input)

	tok := l.NextToken() // a
	if tok.Line != 1 {
		t.Fatalf("expected line 1, got %d", tok.Line)
	}
	l.NextToken() // NEWLINE

	tok = l.NextToken() // b
	if tok.Line != 2 {
		t.Fatalf("expected line 2, got %d", tok.Line)
	}
	l.NextToken() // NEWLINE

	tok = l.NextToken() // c
	if tok.Line != 3 {
		t.Fatalf("expected line 3, got %d", tok.Line)
	}
}

func TestLeftArrow(t *testing.T) {
	input := "promise p <- activity Foo(x)"
	expected := []token.TokenType{
		token.PROMISE, token.IDENT, token.LEFT_ARROW, token.ACTIVITY, token.IDENT, token.ARGS,
		token.NEWLINE, token.EOF,
	}
	l := New(input)
	for i, exp := range expected {
		tok := l.NextToken()
		if tok.Type != exp {
			t.Fatalf("token[%d]: expected %s, got %s (%q)", i, exp, tok.Type, tok.Literal)
		}
	}
}

func TestNewKeywords(t *testing.T) {
	input := "promise condition set unset state"
	expected := []token.TokenType{
		token.PROMISE, token.CONDITION, token.SET, token.UNSET, token.STATE,
		token.NEWLINE, token.EOF,
	}
	l := New(input)
	for i, exp := range expected {
		tok := l.NextToken()
		if tok.Type != exp {
			t.Fatalf("token[%d]: expected %s, got %s (%q)", i, exp, tok.Type, tok.Literal)
		}
	}
}

func TestOptionsKeyword(t *testing.T) {
	input := "options:"
	l := New(input)
	tok := l.NextToken()
	if tok.Type != token.OPTIONS {
		t.Fatalf("expected OPTIONS, got %s", tok.Type)
	}
	tok = l.NextToken()
	if tok.Type != token.COLON {
		t.Fatalf("expected COLON, got %s", tok.Type)
	}
}

func TestDurationToken(t *testing.T) {
	tests := []struct {
		input string
		lit   string
	}{
		{"60s", "60s"},
		{"5m", "5m"},
		{"1h", "1h"},
		{"500ms", "500ms"},
		{"7d", "7d"},
	}
	for _, tt := range tests {
		l := New(tt.input)
		tok := l.NextToken()
		if tok.Type != token.DURATION {
			t.Errorf("input %q: expected DURATION, got %s", tt.input, tok.Type)
		}
		if tok.Literal != tt.lit {
			t.Errorf("input %q: expected literal %q, got %q", tt.input, tt.lit, tok.Literal)
		}
	}
}

func TestNumberToken(t *testing.T) {
	tests := []struct {
		input string
		lit   string
	}{
		{"3", "3"},
		{"2.0", "2.0"},
		{"100", "100"},
		{"1.5", "1.5"},
	}
	for _, tt := range tests {
		l := New(tt.input)
		tok := l.NextToken()
		if tok.Type != token.NUMBER {
			t.Errorf("input %q: expected NUMBER, got %s", tt.input, tok.Type)
		}
		if tok.Literal != tt.lit {
			t.Errorf("input %q: expected literal %q, got %q", tt.input, tt.lit, tok.Literal)
		}
	}
}

func TestEmitEOFIdempotent(t *testing.T) {
	input := "a:\n    b"
	l := New(input)
	_ = l.AllTokens()

	// Calling NextToken after AllTokens should return EOF, not panic or garbage.
	tok := l.NextToken()
	if tok.Type != token.EOF {
		t.Fatalf("expected EOF after AllTokens, got %s (%q)", tok.Type, tok.Literal)
	}
	// And again.
	tok = l.NextToken()
	if tok.Type != token.EOF {
		t.Fatalf("expected EOF on third call, got %s (%q)", tok.Type, tok.Literal)
	}
}

func TestInconsistentDedent(t *testing.T) {
	// Indent stack will be [0, 4] after the indent. Dedenting to column 3
	// doesn't match any stack level, so an ILLEGAL token should appear.
	input := "a:\n    b\n   c\n"
	l := New(input)
	tokens := l.AllTokens()

	foundIllegal := false
	for _, tok := range tokens {
		if tok.Type == token.ILLEGAL {
			foundIllegal = true
			if tok.Literal != "inconsistent indentation" {
				t.Fatalf("expected ILLEGAL literal 'inconsistent indentation', got %q", tok.Literal)
			}
			break
		}
	}
	if !foundIllegal {
		t.Fatalf("expected ILLEGAL token for inconsistent dedent, got tokens: %v", tokens)
	}
}

func TestUnclosedArgs(t *testing.T) {
	// An argument group that runs to EOF with the '(' still open is a loud
	// error at the opening '(', not a silent run-to-EOF captured as ARGS.
	input := "(foo bar"
	l := New(input)
	tok := l.NextToken()
	if tok.Type != token.ILLEGAL {
		t.Fatalf("expected ILLEGAL, got %s (%q)", tok.Type, tok.Literal)
	}
	if tok.Literal != "unterminated argument list" {
		t.Fatalf("expected 'unterminated argument list', got %q", tok.Literal)
	}
	if tok.Line != 1 || tok.Column != 1 {
		t.Fatalf("expected error at opening '(' (1:1), got %d:%d", tok.Line, tok.Column)
	}
}

func TestUnclosedString(t *testing.T) {
	// A string that reaches EOF with no closing quote is a loud error at the
	// opening '"', not a silent capture of the remainder.
	input := `"hello world`
	l := New(input)
	tok := l.NextToken()
	if tok.Type != token.ILLEGAL {
		t.Fatalf("expected ILLEGAL, got %s (%q)", tok.Type, tok.Literal)
	}
	if tok.Literal != "unterminated string literal" {
		t.Fatalf("expected 'unterminated string literal', got %q", tok.Literal)
	}
	if tok.Line != 1 || tok.Column != 1 {
		t.Fatalf("expected error at opening '\"' (1:1), got %d:%d", tok.Line, tok.Column)
	}
}

func TestColumnAccuracy(t *testing.T) {
	input := "workflow Foo(x) -> (R):\n"
	l := New(input)

	tests := []struct {
		typ token.TokenType
		col int
	}{
		{token.WORKFLOW, 1},  // "workflow" starts at col 1
		{token.IDENT, 10},   // "Foo" starts at col 10
		{token.ARGS, 13},    // "(x)" starts at col 13
		{token.ARROW, 17},   // "->" starts at col 17
		{token.ARGS, 20},    // "(R)" starts at col 20
		{token.COLON, 23},   // ":" at col 23
		{token.NEWLINE, 24}, // newline at col 24
	}
	for i, tt := range tests {
		tok := l.NextToken()
		if tok.Type != tt.typ {
			t.Fatalf("token[%d]: expected %s, got %s (%q)", i, tt.typ, tok.Type, tok.Literal)
		}
		if tok.Column != tt.col {
			t.Errorf("token[%d] (%s): expected column %d, got %d", i, tt.typ, tt.col, tok.Column)
		}
	}
}

func TestNumberWithNonDurationSuffix(t *testing.T) {
	// "1x" should be NUMBER "1" followed by IDENT "x", not a duration.
	input := "1x"
	l := New(input)
	tok := l.NextToken()
	if tok.Type != token.NUMBER {
		t.Fatalf("expected NUMBER, got %s (%q)", tok.Type, tok.Literal)
	}
	if tok.Literal != "1" {
		t.Fatalf("expected literal '1', got %q", tok.Literal)
	}
	tok = l.NextToken()
	if tok.Type != token.IDENT {
		t.Fatalf("expected IDENT, got %s (%q)", tok.Type, tok.Literal)
	}
	if tok.Literal != "x" {
		t.Fatalf("expected literal 'x', got %q", tok.Literal)
	}
}

func TestDotToken(t *testing.T) {
	input := "Service.Operation"
	l := New(input)
	tok := l.NextToken()
	if tok.Type != token.IDENT || tok.Literal != "Service" {
		t.Fatalf("expected IDENT 'Service', got %s %q", tok.Type, tok.Literal)
	}
	tok = l.NextToken()
	if tok.Type != token.DOT {
		t.Fatalf("expected DOT, got %s", tok.Type)
	}
	tok = l.NextToken()
	if tok.Type != token.IDENT || tok.Literal != "Operation" {
		t.Fatalf("expected IDENT 'Operation', got %s %q", tok.Type, tok.Literal)
	}
}

func TestMultiLineArgs(t *testing.T) {
	input := "(foo,\nbar)"
	l := New(input)
	tok := l.NextToken()
	if tok.Type != token.ARGS {
		t.Fatalf("expected ARGS, got %s", tok.Type)
	}
	if tok.Literal != "foo,\nbar" {
		t.Fatalf("expected literal with newline, got %q", tok.Literal)
	}
}

func TestOptionsBlockTokenStream(t *testing.T) {
	input := "activity Foo(x) -> y\n    options:\n        task_queue: \"workers\"\n        start_to_close: 60s\n"
	expected := []struct {
		typ token.TokenType
		lit string
	}{
		{token.ACTIVITY, "activity"},
		{token.IDENT, "Foo"},
		{token.ARGS, "x"},
		{token.ARROW, "->"},
		{token.IDENT, "y"},
		{token.NEWLINE, ""},
		{token.INDENT, ""},
		{token.OPTIONS, "options"},
		{token.COLON, ":"},
		{token.NEWLINE, ""},
		{token.INDENT, ""},
		{token.TASK_QUEUE, "task_queue"},
		{token.COLON, ":"},
		{token.STRING, "workers"},
		{token.NEWLINE, ""},
		{token.IDENT, "start_to_close"},
		{token.COLON, ":"},
		{token.DURATION, "60s"},
		{token.NEWLINE, ""},
		{token.DEDENT, ""},
		{token.DEDENT, ""},
		{token.EOF, ""},
	}
	l := New(input)
	for i, exp := range expected {
		tok := l.NextToken()
		if tok.Type != exp.typ {
			t.Fatalf("token[%d]: expected type %s, got %s (%q)", i, exp.typ, tok.Type, tok.Literal)
		}
		if exp.lit != "" && tok.Literal != exp.lit {
			t.Fatalf("token[%d]: expected literal %q, got %q", i, exp.lit, tok.Literal)
		}
	}
}

// firstOf returns the first token of the wanted type, stopping early on ILLEGAL
// or EOF, so args/string tests can assert on the interesting token regardless of
// the leading identifier/structural tokens.
func firstOf(l *Lexer, want token.TokenType) token.Token {
	for {
		tok := l.NextToken()
		if tok.Type == want || tok.Type == token.ILLEGAL || tok.Type == token.EOF {
			return tok
		}
	}
}

func TestArgsBalancedParenInString(t *testing.T) {
	// A ')' inside a string must not terminate the argument group early. The
	// ARGS token spans to the real outer ')'.
	input := `foo("org is required (bootstrap)")`
	l := New(input)
	tok := firstOf(l, token.ARGS)
	if tok.Type != token.ARGS {
		t.Fatalf("expected ARGS, got %s (%q)", tok.Type, tok.Literal)
	}
	if tok.Literal != `"org is required (bootstrap)"` {
		t.Fatalf("ARGS ended at the wrong ')': got %q", tok.Literal)
	}
	// After the outer ')' a stray STRING would mean the old truncation bug is back.
	if next := l.NextToken(); next.Type == token.STRING {
		t.Fatalf("unexpected trailing STRING %q — args terminated at the wrong ')'", next.Literal)
	}
}

func TestArgsUnbalancedParenIsLoud(t *testing.T) {
	// A genuinely unbalanced '(' (an extra opener that never closes) is a loud
	// error at the opening delimiter — never a silent run to EOF. The string
	// span in between is skipped and does not paper over the imbalance.
	input := `foo("bar" (baz`
	l := New(input)
	tok := firstOf(l, token.ARGS)
	if tok.Type != token.ILLEGAL {
		t.Fatalf("expected ILLEGAL, got %s (%q)", tok.Type, tok.Literal)
	}
	if tok.Literal != "unterminated argument list" {
		t.Fatalf("expected 'unterminated argument list', got %q", tok.Literal)
	}
}

func TestArgsNestedCalls(t *testing.T) {
	// Nested calls: ARGS spans to the matching outer ')'.
	input := `f(g(x))`
	l := New(input)
	tok := firstOf(l, token.ARGS)
	if tok.Type != token.ARGS {
		t.Fatalf("expected ARGS, got %s (%q)", tok.Type, tok.Literal)
	}
	if tok.Literal != "g(x)" {
		t.Fatalf("expected ARGS 'g(x)', got %q", tok.Literal)
	}
}

func TestArgsUnterminatedAtEOF(t *testing.T) {
	// Unterminated argument list at EOF: loud error at the opening '('.
	input := "foo(a, b"
	l := New(input)
	tok := firstOf(l, token.ARGS)
	if tok.Type != token.ILLEGAL {
		t.Fatalf("expected ILLEGAL, got %s (%q)", tok.Type, tok.Literal)
	}
	if tok.Literal != "unterminated argument list" {
		t.Fatalf("expected 'unterminated argument list', got %q", tok.Literal)
	}
	if tok.Column != 4 {
		t.Fatalf("expected error at the opening '(' (col 4), got col %d", tok.Column)
	}
}

func TestArgsUnterminatedStringInside(t *testing.T) {
	// A string that never closes inside an argument group is a loud error at
	// that string's opening '"'.
	input := "foo(\"bar)\n"
	l := New(input)
	tok := firstOf(l, token.ARGS)
	if tok.Type != token.ILLEGAL {
		t.Fatalf("expected ILLEGAL, got %s (%q)", tok.Type, tok.Literal)
	}
	if tok.Literal != "unterminated string literal" {
		t.Fatalf("expected 'unterminated string literal', got %q", tok.Literal)
	}
	if tok.Column != 5 {
		t.Fatalf("expected error at the opening '\"' (col 5), got col %d", tok.Column)
	}
}

func TestStringUnterminatedNewline(t *testing.T) {
	// A newline before the closing quote is a loud error at the opening '"'.
	input := "\"hello\nworld"
	l := New(input)
	tok := l.NextToken()
	if tok.Type != token.ILLEGAL {
		t.Fatalf("expected ILLEGAL, got %s (%q)", tok.Type, tok.Literal)
	}
	if tok.Literal != "unterminated string literal" {
		t.Fatalf("expected 'unterminated string literal', got %q", tok.Literal)
	}
	if tok.Line != 1 || tok.Column != 1 {
		t.Fatalf("expected error at opening '\"' (1:1), got %d:%d", tok.Line, tok.Column)
	}
}

func TestStringUnterminatedEOF(t *testing.T) {
	// EOF before the closing quote is a loud error at the opening '"'.
	input := `x "tail`
	l := New(input)
	tok := firstOf(l, token.STRING)
	if tok.Type != token.ILLEGAL {
		t.Fatalf("expected ILLEGAL, got %s (%q)", tok.Type, tok.Literal)
	}
	if tok.Literal != "unterminated string literal" {
		t.Fatalf("expected 'unterminated string literal', got %q", tok.Literal)
	}
	if tok.Column != 3 {
		t.Fatalf("expected error at the opening '\"' (col 3), got col %d", tok.Column)
	}
}

func TestTwoStringsOneLine(t *testing.T) {
	// Two string literals on one line are scanned independently.
	input := `"first" "second"`
	l := New(input)
	tok := l.NextToken()
	if tok.Type != token.STRING || tok.Literal != "first" {
		t.Fatalf("expected STRING 'first', got %s (%q)", tok.Type, tok.Literal)
	}
	tok = l.NextToken()
	if tok.Type != token.STRING || tok.Literal != "second" {
		t.Fatalf("expected STRING 'second', got %s (%q)", tok.Type, tok.Literal)
	}
}

func TestListLiteralTokens(t *testing.T) {
	// A bracketed inline list of string elements tokenizes into the new
	// LBRACKET / COMMA / RBRACKET delimiters around STRING literals.
	input := `["InvalidInput", "NotFound"]`
	expected := []token.TokenType{
		token.LBRACKET,
		token.STRING, token.COMMA,
		token.STRING,
		token.RBRACKET,
		token.NEWLINE, token.EOF,
	}
	l := New(input)
	for i, exp := range expected {
		tok := l.NextToken()
		if tok.Type != exp {
			t.Fatalf("token[%d]: expected %s, got %s (%q)", i, exp, tok.Type, tok.Literal)
		}
	}
}

func TestEmptyListLiteralTokens(t *testing.T) {
	// An empty list is just the two delimiters back to back.
	input := `[]`
	expected := []token.TokenType{
		token.LBRACKET, token.RBRACKET,
		token.NEWLINE, token.EOF,
	}
	l := New(input)
	for i, exp := range expected {
		tok := l.NextToken()
		if tok.Type != exp {
			t.Fatalf("token[%d]: expected %s, got %s (%q)", i, exp, tok.Type, tok.Literal)
		}
	}
}
