package lexer

import (
	"bytes"
	"fmt"
	"slices"
	"strings"
	"unicode/utf8"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/token"
)

// Lexer tokenizes .twf source input with indentation-aware INDENT/DEDENT emission.
type Lexer struct {
	input   []byte
	pos     int             // current position in input
	line    int             // 1-based line number
	col     int             // 1-based column number
	atBOL   bool            // at beginning of line (for indent processing)
	last    token.TokenType // last token emitted on this line; NEWLINE before the first
	pending []token.Token   // queued tokens (INDENT/DEDENT, or a literal behind its escape error)

	indentStack []int // stack of indent widths, starts at [0]
	afterHeader bool  // the line before this one ended in ':', so this one opens a block
	eofEmitted  bool  // true after first EOF has been emitted
}

// New creates a new Lexer for the given input.
func New(input string) *Lexer {
	return &Lexer{
		input:       []byte(input),
		pos:         0,
		line:        1,
		col:         1,
		atBOL:       true,
		last:        token.NEWLINE,
		indentStack: []int{0},
	}
}

// NextToken returns the next token from the input.
func (l *Lexer) NextToken() token.Token {
	for {
		// Return pending tokens first (INDENT/DEDENT).
		if len(l.pending) > 0 {
			tok := l.pending[0]
			l.pending = l.pending[1:]
			return tok
		}

		// At beginning of line, handle indentation.
		if l.atBOL {
			l.atBOL = false
			tok, hasTok := l.handleIndent()
			if hasTok {
				return tok
			}
			// handleIndent may have queued tokens or set atBOL again (blank line).
			if len(l.pending) > 0 || l.atBOL {
				continue
			}
		}

		// Skip spaces and tabs (not newlines) within a line.
		l.skipSpaces()

		if l.pos >= len(l.input) {
			return l.emitEOF()
		}

		ch := l.input[l.pos]

		var tok token.Token
		switch {
		case l.newlineAt(l.pos) > 0:
			l.afterHeader = l.last == token.COLON || l.last == token.TRAILING_COMMENT
			tok = l.makeToken(token.NEWLINE, "")
			l.pos += l.newlineAt(l.pos)
			l.line++
			l.col = 1
			l.atBOL = true

		case ch == '#':
			tok = l.scanComment()
			// A comment after a block header (a line ending in ':' or opening
			// an indented block) would sit between the header and its block.
			if l.last != token.NEWLINE && (l.last == token.COLON || l.opensBlock()) {
				tok.Type = token.TRAILING_COMMENT
			}

		case ch == '(':
			tok = l.scanArgs()

		case ch == '"':
			tok = l.scanString()

		case ch == ':':
			tok = l.makeToken(token.COLON, ":")
			l.advance()

		case ch == '-' && l.pos+1 < len(l.input) && l.input[l.pos+1] == '>':
			tok = l.makeToken(token.ARROW, "->")
			l.advance()
			l.advance()

		case ch == '<' && l.pos+1 < len(l.input) && l.input[l.pos+1] == '-':
			tok = l.makeToken(token.LEFT_ARROW, "<-")
			l.advance()
			l.advance()

		case ch == '.':
			tok = l.makeToken(token.DOT, ".")
			l.advance()

		case ch == '[':
			tok = l.makeToken(token.LBRACKET, "[")
			l.advance()

		case ch == ']':
			tok = l.makeToken(token.RBRACKET, "]")
			l.advance()

		case ch == ',':
			tok = l.makeToken(token.COMMA, ",")
			l.advance()

		case isDigit(ch):
			tok = l.scanNumber()

		case isIdentStart(ch):
			tok = l.scanIdentifier()

		default:
			tok = l.scanRawText()
		}

		tok.End = l.pos
		l.last = tok.Type
		return tok
	}
}

// AllTokens returns all tokens from the input.
func (l *Lexer) AllTokens() []token.Token {
	var tokens []token.Token
	for {
		tok := l.NextToken()
		tokens = append(tokens, tok)
		if tok.Type == token.EOF {
			break
		}
	}
	return tokens
}

// handleIndent processes whitespace at the beginning of a line.
// Returns a token and true if a single token should be returned immediately,
// or zero-value and false if tokens were queued into pending (or blank line skipped).
func (l *Lexer) handleIndent() (token.Token, bool) {
	start := l.pos
	end := l.indentEnd(start)
	l.col += end - start
	l.pos = end

	// Check for blank line (only spaces and tabs, then newline or EOF).
	if end >= len(l.input) {
		// EOF after whitespace — emit dedents to 0 (handled by emitEOF).
		l.emitDedentsTo(0)
		return token.Token{}, false
	}
	if n := l.newlineAt(end); n > 0 {
		// Blank line — skip entirely.
		l.pos = end + n
		l.line++
		l.col = 1
		l.atBOL = true
		return token.Token{}, false
	}

	run := l.input[start:end]
	indent, bad := l.measureIndent(run, l.afterHeader)
	if bad >= 0 {
		l.pending = append(l.pending, l.indentSpaceError(run, start, bad))
	}

	top := l.indentStack[len(l.indentStack)-1]

	if indent > top {
		l.indentStack = append(l.indentStack, indent)
		return l.makeToken(token.INDENT, ""), true
	}

	if indent < top {
		l.emitDedentsTo(indent)
		return token.Token{}, false
	}

	// indent == top: no change
	return token.Token{}, false
}

// indentEnd returns the end of the run of spaces and tabs starting at i.
func (l *Lexer) indentEnd(i int) int {
	for i < len(l.input) && isSpace(l.input[i]) {
		i++
	}
	return i
}

// tabStop is the display width of a tab where spaces stand in indentation,
// used only to place such a line for recovery.
const tabStop = 4

// measureIndent returns the width of a line's indentation run, in tabs, and
// the index of the run's first space, or -1. TWF indents with tabs, one per
// level; a space in indentation is an error.
//
// A run holding spaces is placed for recovery, so the rest of the file still
// parses: at its leading tabs when they are an open level (a stray space after
// a line's indentation) and the line does not follow a block header
// (afterHeader), which needs a deeper one; otherwise where an editor shows it,
// with a tab stop every four columns. Shown past the current level, it opens
// one level; otherwise it sits at the deepest open level it reaches.
func (l *Lexer) measureIndent(run []byte, afterHeader bool) (width, bad int) {
	bad = bytes.IndexByte(run, ' ')
	if bad < 0 {
		return len(run), -1
	}
	tabs := bytes.Count(run[:bad], []byte{'\t'})
	if bad == tabs && bad > 0 && !afterHeader && slices.Contains(l.indentStack, bad) {
		return bad, bad
	}
	shown := 0
	for _, ch := range run {
		if ch == '\t' {
			shown += tabStop - shown%tabStop
		} else {
			shown++
		}
	}
	shown /= tabStop
	top := l.indentStack[len(l.indentStack)-1]
	if shown > top {
		return top + 1, bad
	}
	for i := len(l.indentStack) - 1; ; i-- {
		if l.indentStack[i] <= shown {
			return l.indentStack[i], bad
		}
	}
}

// indentSpaceError returns the ILLEGAL for the indentation run starting at
// offset start, positioned at run[bad], its first space.
func (l *Lexer) indentSpaceError(run []byte, start, bad int) token.Token {
	msg := "indented with spaces; .twf indents with tabs, one per level"
	if bytes.IndexByte(run, '\t') >= 0 {
		msg = "indentation mixes tabs and spaces; .twf indents with tabs, one per level"
	}
	return token.Token{
		Type:    token.ILLEGAL,
		Literal: msg,
		Line:    l.line,
		Column:  1 + bad,
		Offset:  start + bad,
		End:     start + bad + 1,
	}
}

// emitDedentsTo emits DEDENT tokens until the stack top matches the target level.
func (l *Lexer) emitDedentsTo(target int) {
	for len(l.indentStack) > 1 && l.indentStack[len(l.indentStack)-1] > target {
		l.indentStack = l.indentStack[:len(l.indentStack)-1]
		l.pending = append(l.pending, l.makeToken(token.DEDENT, ""))
	}
	if l.indentStack[len(l.indentStack)-1] != target {
		l.pending = append(l.pending, l.makeToken(token.ILLEGAL, "inconsistent indentation"))
	}
}

// emitEOF emits a synthetic NEWLINE (if needed), remaining DEDENTs, then EOF.
func (l *Lexer) emitEOF() token.Token {
	if l.eofEmitted {
		return l.makeToken(token.EOF, "")
	}
	l.eofEmitted = true

	// If the input doesn't end with a newline, emit a synthetic one so
	// the parser always sees NEWLINE before DEDENT/EOF.
	if n := len(l.input); n > 0 && l.newlineAt(n-1) == 0 {
		nl := l.makeToken(token.NEWLINE, "")
		l.emitPendingDedents()
		l.pending = append(l.pending, l.makeToken(token.EOF, ""))
		return nl
	}

	if len(l.indentStack) > 1 {
		l.emitPendingDedents()
		l.pending = append(l.pending, l.makeToken(token.EOF, ""))
		tok := l.pending[0]
		l.pending = l.pending[1:]
		return tok
	}
	return l.makeToken(token.EOF, "")
}

// emitPendingDedents queues DEDENT tokens for all remaining indent levels.
func (l *Lexer) emitPendingDedents() {
	for len(l.indentStack) > 1 {
		l.indentStack = l.indentStack[:len(l.indentStack)-1]
		l.pending = append(l.pending, l.makeToken(token.DEDENT, ""))
	}
}

func (l *Lexer) scanComment() token.Token {
	tok := l.makeToken(token.COMMENT, "")
	l.advance() // consume '#'
	start := l.pos
	for l.pos < len(l.input) && l.newlineAt(l.pos) == 0 {
		l.advance()
	}
	tok.Literal = string(l.input[start:l.pos])
	return tok
}

// opensBlock reports whether the line ending at l.pos is followed, past any
// blank lines, by a more indented line: whether an INDENT follows its NEWLINE.
func (l *Lexer) opensBlock() bool {
	top := l.indentStack[len(l.indentStack)-1]
	for i := l.pos; i < len(l.input); {
		i += l.newlineAt(i) // skip the newline ending the previous line
		end := l.indentEnd(i)
		if end >= len(l.input) {
			return false
		}
		if l.newlineAt(end) > 0 {
			i = end
			continue // blank line
		}
		indent, _ := l.measureIndent(l.input[i:end], false)
		return indent > top
	}
	return false
}

// scanArgs consumes an argument group delimited by the opening '(' up to its
// matching ')'. The scan is balanced and string-aware: it maintains a delimiter
// stack (pushing on '(' '{' '[', popping on ')' '}' ']') so nested groups don't
// terminate the token early, and it skips over "..." string spans entirely so a
// paren inside a string never affects depth. The content between the delimiters
// stays opaque — this only finds where the argument group ends. Multi-line
// argument groups are allowed.
//
// Reaching EOF with the stack still open is a loud error: it returns a
// token.ILLEGAL positioned at the opening '(', rather than silently swallowing
// the rest of the input as valid ARGS content. An unterminated string span
// inside the group is likewise a loud error at that string's opening '"'. An
// unknown escape inside a string span is returned ahead of the ARGS token (see
// scanString).
func (l *Lexer) scanArgs() token.Token {
	// openTok captures the opening '(' position; reused for ARGS or ILLEGAL.
	openTok := l.makeToken(token.ARGS, "")
	l.advance() // consume '('
	start := l.pos

	var bad *token.Token
	stack := []byte{'('}
	for l.pos < len(l.input) {
		ch := l.input[l.pos]
		switch ch {
		case '\n':
			l.line++
			l.col = 0 // advance will set to 1
			l.advance()
		case '"':
			// Skip the whole string span so delimiters inside a string never
			// affect depth. An unterminated string is a loud error.
			strTok := l.makeToken(token.ILLEGAL, "unterminated string literal")
			_, strBad, ok := l.scanStringSpan()
			if !ok {
				return strTok
			}
			if bad == nil {
				bad = strBad
			}
		case '(', '{', '[':
			stack = append(stack, ch)
			l.advance()
		case ')', '}', ']':
			stack = stack[:len(stack)-1]
			if len(stack) == 0 {
				// Matched the opening '('; the argument group ends here.
				tok := openTok
				tok.Literal = strings.ReplaceAll(string(l.input[start:l.pos]), "\r\n", "\n")
				l.advance() // consume the matching ')'
				return l.withEscapeError(tok, bad)
			}
			l.advance()
		default:
			l.advance()
		}
	}

	// EOF with the stack still open: loud error at the opening '('.
	openTok.Type = token.ILLEGAL
	openTok.Literal = "unterminated argument list"
	return openTok
}

// scanStringSpan consumes a "..." string literal, starting on its opening '"',
// and returns its unescaped value. Strings are single-line, and \" and \\ are
// the only escapes. ok is false when a newline or EOF comes before the closing
// '"'; the position is then left there for error recovery. An unknown escape
// does not stop the scan: the literal is consumed whole, keeping that backslash
// in the value, and the first one is returned as bad, an ILLEGAL at its '\'.
func (l *Lexer) scanStringSpan() (val string, bad *token.Token, ok bool) {
	l.advance() // consume opening '"'
	var b []byte
	for l.pos < len(l.input) {
		ch := l.input[l.pos]
		if ch == '"' {
			l.advance() // consume closing '"'
			return string(b), bad, true
		}
		if l.newlineAt(l.pos) > 0 {
			return "", nil, false
		}
		if ch == '\\' && l.pos+1 < len(l.input) {
			switch next := l.input[l.pos+1]; next {
			case '"', '\\':
				l.advance() // consume '\'
				ch = next
			default:
				if bad == nil {
					r, _ := utf8.DecodeRune(l.input[l.pos+1:])
					tok := l.makeToken(token.ILLEGAL, fmt.Sprintf(`unknown escape \%c in string literal (only \" and \\ are escapes)`, r))
					bad = &tok
				}
			}
		}
		b = append(b, ch)
		l.advance()
	}
	return "", nil, false // EOF before closing quote
}

// scanString consumes a "..." string literal into a STRING whose Literal is the
// unescaped value. An unterminated string is a loud error, a token.ILLEGAL
// positioned at the opening '"', instead of running forward and swallowing the
// rest of the file into one STRING token. An unknown escape is returned as an
// ILLEGAL with the STRING queued behind it, so the parser records the error and
// still sees the literal.
func (l *Lexer) scanString() token.Token {
	tok := l.makeToken(token.STRING, "")
	val, bad, ok := l.scanStringSpan()
	if !ok {
		tok.Type, tok.Literal = token.ILLEGAL, "unterminated string literal"
		return tok
	}
	tok.Literal = val
	return l.withEscapeError(tok, bad)
}

// withEscapeError returns tok, or, when bad is set, returns bad and queues tok
// to follow it.
func (l *Lexer) withEscapeError(tok token.Token, bad *token.Token) token.Token {
	if bad == nil {
		return tok
	}
	tok.End = l.pos
	l.pending = append(l.pending, tok)
	return *bad
}

func (l *Lexer) scanIdentifier() token.Token {
	tok := l.makeToken(token.IDENT, "")
	start := l.pos
	for l.pos < len(l.input) && isIdentContinue(l.input[l.pos]) {
		l.advance()
	}
	literal := string(l.input[start:l.pos])
	tok.Literal = literal
	tok.Type = token.LookupIdent(literal)
	return tok
}

// RescanDeployName rewinds the lexer to the byte offset of an already-scanned
// token and re-reads the source from there as a single deploy_name, returning
// the assembled name token (Type IDENT, Literal = the full name including any
// {param} parameters). On return the lexer is positioned immediately after the name,
// so the parser can resume normal tokenization from that point.
//
// This exists because the lexer is context-free: it cannot know it is standing
// in a namespace/endpoint name position, so `fabric-shard-{org}` tokenizes as a
// jumble of IDENT / RAW_TEXT fragments in the default path. The parser calls
// this at exactly the three deploy_name positions to re-scan the run as one
// name. The default NextToken path is untouched, so every other construct —
// including struct literals like `Result{ok: true}` — tokenizes exactly as
// before.
//
// deploy_name grammar:
//
//	(letter | '_') [a-zA-Z0-9_-]* ( '{' IDENT '}' [a-zA-Z0-9_-]* )*
//
// No leading hyphen (guaranteed by the letter/underscore start) and no dots (a
// '.' terminates the scan, leaving it for the parser to reject in a name
// position). A malformed or unterminated `{...}` parameter is a loud error.
func (l *Lexer) RescanDeployName(tok token.Token) (token.Token, error) {
	l.pos = tok.Offset
	l.line = tok.Line
	l.col = tok.Column
	l.atBOL = false
	l.last = token.IDENT // the name re-scanned below
	l.pending = nil
	l.eofEmitted = false
	return l.scanDeployName()
}

// scanDeployName scans a deploy_name from the current position. See
// RescanDeployName for the grammar and rationale.
func (l *Lexer) scanDeployName() (token.Token, error) {
	tok := l.makeToken(token.IDENT, "")
	start := l.pos

	if l.pos >= len(l.input) || !isIdentStart(l.input[l.pos]) {
		return tok, fmt.Errorf("deployment name must start with a letter or underscore")
	}

	for l.pos < len(l.input) {
		ch := l.input[l.pos]
		switch {
		case isIdentContinue(ch) || ch == '-':
			l.advance()
		case ch == '{':
			l.advance() // consume '{'
			if l.pos >= len(l.input) || !isIdentStart(l.input[l.pos]) {
				return tok, fmt.Errorf("template parameter must contain an identifier")
			}
			for l.pos < len(l.input) && isIdentContinue(l.input[l.pos]) {
				l.advance()
			}
			if l.pos >= len(l.input) || l.input[l.pos] != '}' {
				return tok, fmt.Errorf("unterminated template parameter: expected '}'")
			}
			l.advance() // consume '}'
		default:
			// '.', ':', whitespace, '(', newline, EOF, etc. terminate the name.
			tok.Literal, tok.End = string(l.input[start:l.pos]), l.pos
			return tok, nil
		}
	}

	tok.Literal, tok.End = string(l.input[start:l.pos]), l.pos
	return tok, nil
}

func (l *Lexer) scanNumber() token.Token {
	tok := l.makeToken(token.NUMBER, "")
	start := l.pos
	// Consume digits.
	for l.pos < len(l.input) && isDigit(l.input[l.pos]) {
		l.advance()
	}
	// Optional decimal part.
	if l.pos < len(l.input) && l.input[l.pos] == '.' && l.pos+1 < len(l.input) && isDigit(l.input[l.pos+1]) {
		l.advance() // consume '.'
		for l.pos < len(l.input) && isDigit(l.input[l.pos]) {
			l.advance()
		}
	}
	// Check for duration suffix: ms, s, m, h, d.
	if l.pos < len(l.input) {
		ch := l.input[l.pos]
		if ch == 'm' && l.pos+1 < len(l.input) && l.input[l.pos+1] == 's' {
			l.advance()
			l.advance()
			tok.Type = token.DURATION
		} else if ch == 's' || ch == 'm' || ch == 'h' || ch == 'd' {
			l.advance()
			tok.Type = token.DURATION
		}
	}
	tok.Literal = string(l.input[start:l.pos])
	return tok
}

func (l *Lexer) scanRawText() token.Token {
	tok := l.makeToken(token.RAW_TEXT, "")
	start := l.pos
	l.advance()
	tok.Literal = string(l.input[start:l.pos])
	return tok
}

func (l *Lexer) makeToken(tt token.TokenType, literal string) token.Token {
	return token.Token{
		Type:    tt,
		Literal: literal,
		Line:    l.line,
		Column:  l.col,
		Offset:  l.pos,
		End:     l.pos,
	}
}

func (l *Lexer) advance() {
	l.pos++
	l.col++
}

// skipSpaces skips spaces and tabs.
func (l *Lexer) skipSpaces() {
	for l.pos < len(l.input) && isSpace(l.input[l.pos]) {
		l.advance()
	}
}

// newlineAt returns the length of the line ending at offset i: 1 for "\n", 2
// for "\r\n", 1 for a "\r" that ends the input, and 0 where no line ends.
func (l *Lexer) newlineAt(i int) int {
	switch {
	case i >= len(l.input):
		return 0
	case l.input[i] == '\n':
		return 1
	case l.input[i] != '\r':
		return 0
	case i+1 == len(l.input):
		return 1
	case l.input[i+1] == '\n':
		return 2
	}
	return 0
}

// isSpace reports whether ch is a space or a tab.
func isSpace(ch byte) bool {
	return ch == ' ' || ch == '\t'
}

func isIdentStart(ch byte) bool {
	return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch == '_'
}

func isIdentContinue(ch byte) bool {
	return isIdentStart(ch) || (ch >= '0' && ch <= '9')
}

func isDigit(ch byte) bool {
	return ch >= '0' && ch <= '9'
}
