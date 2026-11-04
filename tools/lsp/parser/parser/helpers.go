package parser

import (
	"fmt"
	"slices"
	"strings"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/token"
)

// advance moves to the next token.
//
// Structural lexer errors arrive as token.ILLEGAL tokens (unterminated string,
// unterminated argument list, inconsistent indentation, unknown string escape).
// They carry the lexer's message as their literal and are positioned at the
// opening delimiter, or at the backslash of an unknown escape. We
// record each one and skip past it, so the recursive-descent parser never has to
// special-case ILLEGAL at every consumption site: the lexer already recovered to
// the next line/EOF, giving the parser a clean boundary to resume from.
func (p *Parser) advance() {
	switch p.current.Type {
	case token.INDENT:
		p.depth++
	case token.DEDENT:
		p.depth--
	}
	p.prev = p.current.Type
	p.current = p.peek
	p.peek = p.scan()
}

// recoverLine handles a failed line of a block at depth that began at start.
// Parsing strictly, it returns err. Collecting, it records err, skips the rest
// of the line and any block indented under it, and returns nil; the parser then
// stands on the block's next line, its DEDENT, or EOF, or past that DEDENT if
// the failed line consumed it (p.depth < depth). A failed `if` keeps its one
// `else:` clause, skipped with it; any further `else:` is the body's next line.
func (p *Parser) recoverLine(err error, start token.Token, depth int) error {
	pe, ok := err.(*ParseError)
	if !p.collecting || !ok {
		return err
	}
	p.addError(pe)
	elseLeft := start.Type == token.IF && p.elseAt < start.Offset // the failed if's else: is still ahead
	for p.current.Type != token.EOF && p.depth >= depth {
		if p.depth == depth {
			if p.current.Type == token.DEDENT {
				return nil
			}
			moved := p.current.Offset != start.Offset
			lineStart := p.prev == token.NEWLINE || p.prev == token.DEDENT
			if moved && lineStart && p.current.Type != token.INDENT && (p.current.Type != token.ELSE || !elseLeft) {
				return nil
			}
			if p.current.Type == token.ELSE {
				elseLeft = false
			}
		}
		p.advance()
	}
	return nil
}

// unexpectedIndent is the error for a line indented under a statement that
// opens no block.
const unexpectedIndent = "unexpected indent: the statement above opens no block"

// overIndent handles an INDENT at the start of a line under a statement that
// opens no block, ending the indented block as endIndented does.
func (p *Parser) overIndent(why func(token.Token) string) ([]ast.Statement, error) {
	depth := p.depth
	p.advance() // consume INDENT
	return p.endIndented(depth, why)
}

// indentedComments consumes comment lines, more deeply indented ones included,
// and returns them. It stops at any other token.
func (p *Parser) indentedComments() ([]ast.Statement, error) {
	var comments []ast.Statement
	for {
		switch p.current.Type {
		case token.NEWLINE:
			p.advance()
		case token.COMMENT:
			comments = append(comments, p.parseComment())
		case token.INDENT:
			more, err := p.overIndent(nil)
			comments = append(comments, more...)
			if err != nil {
				return comments, err
			}
		default:
			return comments, nil
		}
	}
}

// endIndented ends a block indented under a statement, whose INDENT took the
// parser past depth: comment lines are kept, up to the block's DEDENT. Any other
// line is an "unexpected indent" error, worded by why(its first token) when why
// is set. Collecting errors, it is recorded and the rest of the block skipped,
// so the statement above is kept and the parser stands on the body's next line.
func (p *Parser) endIndented(depth int, why func(token.Token) string) ([]ast.Statement, error) {
	comments, err := p.indentedComments()
	if err != nil {
		return comments, err
	}
	switch p.current.Type {
	case token.DEDENT:
		p.advance()
		return comments, nil
	case token.EOF:
		return comments, nil
	}
	msg := unexpectedIndent
	if why != nil {
		msg = why(p.current)
	}
	err = p.errorf("%s", msg)
	if !p.collecting {
		return comments, err
	}
	p.addError(err.(*ParseError))
	for p.current.Type != token.EOF && p.depth > depth {
		p.advance()
	}
	return comments, nil
}

// endLine ends a statement's line after what: it consumes the NEWLINE, or stops
// at a trailing comment (kept by the body), a DEDENT, or EOF. Any other token
// left on the line is an error. Collecting errors, the error is recorded and
// the rest of the line skipped, so the complete statement before it is kept.
func (p *Parser) endLine(what string) error {
	switch p.current.Type {
	case token.NEWLINE:
		p.advance()
	case token.COMMENT, token.DEDENT, token.EOF:
	default:
		err := p.errorf("expected the end of the line after %s, got %s (%q)", what, p.current.Type, p.current.Literal)
		if !p.collecting {
			return err
		}
		p.addError(err.(*ParseError))
		for p.current.Type != token.NEWLINE && p.current.Type != token.COMMENT && p.current.Type != token.EOF {
			p.advance()
		}
		return p.endLine(what)
	}
	return nil
}

// scan reads the next token from the lexer, recording and skipping any
// structural token.ILLEGAL tokens (see advance) and skipping any
// token.TRAILING_COMMENT, which would otherwise stand between a block-opening
// line and its INDENT. Centralizing the skip here lets both advance and the
// deploy-name re-sync path share it.
func (p *Parser) scan() token.Token {
	tok := p.lex.NextToken()
	for tok.Type == token.ILLEGAL || tok.Type == token.TRAILING_COMMENT {
		if tok.Type == token.ILLEGAL {
			p.recordLexError(tok)
		}
		tok = p.lex.NextToken()
	}
	return tok
}

// expectDeployName consumes a deploy_name at the current position — a
// hyphen- and {param}-permitting deployment name used in exactly the namespace
// name, nexus endpoint name, and nexus endpoint-reference positions. It rewinds
// the lexer to the current token's start and re-scans the run as one name (the
// context-free lexer otherwise fragments `fabric-shard-{org}` into IDENT/RAW_TEXT
// pieces), then re-syncs current/peek from the lexer's new position.
//
// It returns the assembled name token (Literal = full name, Line/Column at the
// name's start) and the distinct {param} template parameters in order of first
// appearance (empty for a static name). On a malformed name it returns a
// ParseError positioned at the name's start.
func (p *Parser) expectDeployName() (token.Token, []string, error) {
	start := p.current
	if start.Type != token.IDENT {
		return token.Token{}, nil, p.errorf("expected a name, got %s (%q)", start.Type, start.Literal)
	}
	nameTok, err := p.lex.RescanDeployName(start)
	if err != nil {
		return token.Token{}, nil, &ParseError{Msg: err.Error(), Line: start.Line, Column: start.Column}
	}
	// The lexer is now positioned immediately after the deploy_name; re-fill the
	// two-token lookahead from there.
	p.current = p.scan()
	p.peek = p.scan()
	return nameTok, ast.ExtractTemplateParams(nameTok.Literal), nil
}

// recordLexError converts a token.ILLEGAL into a ParseError carrying the lexer's
// message and the offending delimiter's position.
func (p *Parser) recordLexError(tok token.Token) {
	p.lexErrors = append(p.lexErrors, &ParseError{
		Msg:    tok.Literal,
		Line:   tok.Line,
		Column: tok.Column,
		code:   CodeLexical,
	})
}

// expect consumes the current token if it matches the expected type.
// Returns the consumed token or an error.
func (p *Parser) expect(tt token.TokenType) (token.Token, error) {
	if p.current.Type != tt {
		return token.Token{}, p.errorf("expected %s, got %s (%q)", tt, p.current.Type, p.current.Literal)
	}
	tok := p.current
	p.advance()
	return tok, nil
}

// errorf creates a ParseError at the current token position.
func (p *Parser) errorf(format string, args ...interface{}) error {
	return &ParseError{
		Msg:    fmt.Sprintf(format, args...),
		Line:   p.current.Line,
		Column: p.current.Column,
	}
}

// addError appends a parse error to the accumulated error list.
func (p *Parser) addError(err *ParseError) {
	p.errors = append(p.errors, err)
}

// recoverTopLevel skips tokens until the parser reaches a top-level keyword at
// column 1 (a definition, `package` or `import`), an annotation's '@' there,
// or EOF. start is where the failed construct began: if the parser is
// still there (it failed on its first token, as a top-level `nexus` call does),
// that token is skipped first, so recovery always makes progress (#263).
func (p *Parser) recoverTopLevel(start token.Token) {
	if p.current.Type != token.EOF && p.current.Line == start.Line && p.current.Column == start.Column {
		p.advance()
	}
	for p.current.Type != token.EOF {
		if (p.current.Type == token.WORKFLOW || p.current.Type == token.ACTIVITY ||
			p.current.Type == token.WORKER || p.current.Type == token.NAMESPACE ||
			p.current.Type == token.NEXUS || p.current.Type == token.PACKAGE ||
			p.current.Type == token.IMPORT || p.current.Type == token.AT) && p.current.Column == 1 {
			return
		}
		p.advance()
	}
}

// collectRawUntil consumes tokens up to one of the terminator types, a comment,
// or the end of the line, none of which it consumes, and returns the source the
// consumed tokens span, verbatim and trimmed of surrounding whitespace. A
// comment that ends the text is left for the caller's body to keep.
func (p *Parser) collectRawUntil(terminators ...token.TokenType) string {
	start, end := p.current.Offset, p.current.Offset
	for !slices.Contains(terminators, p.current.Type) {
		switch p.current.Type {
		case token.NEWLINE, token.COMMENT, token.EOF:
			return sourceText(p.src[start:end])
		}
		end = p.current.End
		p.advance()
	}
	return sourceText(p.src[start:end])
}

// sourceText is a span of source as text: trimmed, with CRLF line ends as "\n".
func sourceText(span string) string {
	return strings.ReplaceAll(strings.TrimSpace(span), "\r\n", "\n")
}

// expectBlock consumes the COLON NEWLINE INDENT sequence that opens an
// indented block.
func (p *Parser) expectBlock() error {
	if p.current.Type != token.COLON {
		// Name the author's actual mistake rather than the awaited token: a
		// definition/declaration header must be followed by ':' and an indented
		// body. Error position stays at the token where ':' was expected.
		return p.errorf("definition requires ':' and an indented body")
	}
	if _, err := p.expect(token.COLON); err != nil {
		return err
	}
	if _, err := p.expect(token.NEWLINE); err != nil {
		return err
	}
	_, err := p.expect(token.INDENT)
	return err
}

// parseBodyAs sets the body context, parses the body, then restores the
// previous context. Use instead of manual save/restore around parseBody().
func (p *Parser) parseBodyAs(ctx bodyContext) ([]ast.Statement, error) {
	prev := p.bodyCtx
	p.bodyCtx = ctx
	body, err := p.parseBody()
	p.bodyCtx = prev
	return body, err
}

// parseHandlerBody parses a handler body as ctx, marking it as a handler's.
func (p *Parser) parseHandlerBody(ctx bodyContext) ([]ast.Statement, error) {
	p.inHandler = true
	body, err := p.parseBodyAs(ctx)
	p.inHandler = false
	return body, err
}

// parseComment consumes a COMMENT and the NEWLINE ending its line, returning it
// as a comment statement.
func (p *Parser) parseComment() *ast.Comment {
	c := &ast.Comment{Pos: ast.Pos{Line: p.current.Line, Column: p.current.Column}, Text: p.current.Literal}
	p.advance()
	if p.current.Type == token.NEWLINE {
		p.advance()
	}
	return c
}

// skipBlankLinesAndComments consumes any NEWLINE and COMMENT tokens at the current position.
// This allows comments to appear between declarations without breaking parsing.
func (p *Parser) skipBlankLinesAndComments() {
	for p.current.Type == token.NEWLINE || p.current.Type == token.COMMENT {
		p.advance()
	}
}

// parseDotQualifiedIdent consumes an IDENT and any following DOT IDENT pairs,
// returning the full dot-qualified name (e.g., "item.result", "a.b.c").
func (p *Parser) parseDotQualifiedIdent() (string, error) {
	tok, err := p.expect(token.IDENT)
	if err != nil {
		return "", err
	}
	result := tok.Literal
	for p.current.Type == token.DOT {
		p.advance() // consume DOT
		field, err := p.expect(token.IDENT)
		if err != nil {
			return "", err
		}
		result += "." + field.Literal
	}
	return result, nil
}

// parseRefNameWithPackage parses a referenced name in a keyword-led call or
// registration position, with an optional leading `IDENT.` package qualifier.
// It returns the qualifier and name tokens: for `Foo` a zero qualifier and
// Foo; for `pkg.Foo`, pkg and Foo. Because these positions are
// keyword-led, an `IDENT DOT IDENT` prefix here is unambiguously a
// package-qualified name and does not collide with `signal handle.Name` or the
// `nexus Ep Svc.Op` triple.
func (p *Parser) parseRefNameWithPackage() (pkg, name token.Token, err error) {
	first, err := p.expect(token.IDENT)
	if err != nil {
		return token.Token{}, token.Token{}, err
	}
	if p.current.Type == token.DOT {
		p.advance() // consume DOT
		second, err := p.expect(token.IDENT)
		if err != nil {
			return token.Token{}, token.Token{}, err
		}
		return first, second, nil
	}
	return token.Token{}, first, nil
}

// posOf returns tok's position.
func posOf(tok token.Token) ast.Pos {
	return ast.Pos{Line: tok.Line, Column: tok.Column}
}

// refTo builds a reference from its qualifier (zero when unqualified) and
// name tokens.
func refTo[T any](pkg, name token.Token) ast.Ref[T] {
	return ast.Ref[T]{Pos: posOf(name), Package: pkg.Literal, PackagePos: posOf(pkg), Name: name.Literal}
}

// nameRef builds an unqualified reference.
func nameRef[T any](name token.Token) ast.Ref[T] {
	return refTo[T](token.Token{}, name)
}

// parseOptionalOptionsLine checks for an options block after a call:
// INDENT { comment } [ OPTIONS COLON NEWLINE INDENT entries DEDENT ]
// { comment } DEDENT
// Comments may sit above or below the block, as they may inside it, and alone
// under the call; they are discarded. Any other line under the call is an
// unexpected indent (see endIndented), and the call is kept. Returns the
// options block (nil if no options found).
func (p *Parser) parseOptionalOptionsLine(ctx OptionsContext) (*ast.OptionsBlock, error) {
	if p.current.Type != token.INDENT {
		return nil, nil
	}
	switch p.peek.Type {
	case token.OPTIONS, token.COMMENT:
	default:
		return nil, nil // the body reports the indented line
	}
	depth := p.depth
	p.advance() // consume INDENT
	if _, err := p.indentedComments(); err != nil {
		return nil, err
	}
	var opts *ast.OptionsBlock
	if p.current.Type == token.OPTIONS {
		p.advance() // consume OPTIONS
		var err error
		// Parse the options block (expects COLON, NEWLINE, INDENT, entries, DEDENT)
		if opts, err = p.parseOptionsBlock(ctx); err != nil {
			return nil, err
		}
		if _, err := p.indentedComments(); err != nil {
			return nil, err
		}
	}
	if isAddressKey(p.current) {
		switch ctx {
		case OptionsContextChildStart, OptionsContextDetachedChildStart, OptionsContextClientStart:
			return nil, p.codedErrorf(CodeIDAtStart, "a workflow start takes no %s:; the ID derives from the started type's id_scheme", p.current.Literal)
		}
		return nil, p.codedErrorf(CodeAddressMisplaced, "%s: is an address key, valid only under a signal send", p.current.Literal)
	}
	if _, err := p.endIndented(depth, underCall); err != nil {
		return nil, err
	}
	return opts, nil
}

// underCall words the error for a line under a call that is neither a comment
// nor its options: block.
func underCall(token.Token) string {
	return "unexpected indent: only comments and one options: block sit under a call"
}
