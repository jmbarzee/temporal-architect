package parser

import (
	"fmt"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/token"
)

// parseSetStmt parses: SET IDENT NEWLINE
func parseSetStmt(p *Parser) (ast.Statement, error) {
	pos := ast.Pos{Line: p.current.Line, Column: p.current.Column}
	p.advance() // consume SET

	name, err := p.expect(token.IDENT)
	if err != nil {
		return nil, err
	}

	if p.current.Type == token.NEWLINE {
		p.advance()
	}

	return &ast.SetStmt{
		Pos:       pos,
		Condition: ast.Ref[*ast.ConditionDecl]{Pos: pos, Name: name.Literal},
	}, nil
}

// parseUnsetStmt parses: UNSET IDENT NEWLINE
func parseUnsetStmt(p *Parser) (ast.Statement, error) {
	pos := ast.Pos{Line: p.current.Line, Column: p.current.Column}
	p.advance() // consume UNSET

	name, err := p.expect(token.IDENT)
	if err != nil {
		return nil, err
	}

	if p.current.Type == token.NEWLINE {
		p.advance()
	}

	return &ast.UnsetStmt{
		Pos:       pos,
		Condition: ast.Ref[*ast.ConditionDecl]{Pos: pos, Name: name.Literal},
	}, nil
}

// parseReturnStmt parses: RETURN [ raw_expr ] NEWLINE
func parseReturnStmt(p *Parser) (ast.Statement, error) {
	pos := ast.Pos{Line: p.current.Line, Column: p.current.Column}
	p.advance() // consume RETURN

	var value string
	if p.current.Type != token.NEWLINE && p.current.Type != token.DEDENT && p.current.Type != token.EOF {
		value = p.collectRawUntil(token.NEWLINE)
	}

	if p.current.Type == token.NEWLINE {
		p.advance()
	}

	return &ast.ReturnStmt{
		Pos:   pos,
		Value: value,
	}, nil
}

// parseCloseStmt parses: CLOSE (COMPLETE | FAIL | CONTINUE_AS_NEW) [ARGS] NEWLINE
func parseCloseStmt(p *Parser) (ast.Statement, error) {
	pos := ast.Pos{Line: p.current.Line, Column: p.current.Column}
	p.advance() // consume CLOSE

	var reason ast.CloseReason
	switch p.current.Type {
	case token.COMPLETE:
		reason = ast.CloseComplete
		p.advance()
	case token.FAIL:
		reason = ast.CloseFailWorkflow
		p.advance()
	case token.CONTINUE_AS_NEW:
		reason = ast.CloseContinueAsNew
		p.advance()
	default:
		return nil, p.errorf("expected complete, fail, or continue_as_new after 'close', got %s", p.current.Type)
	}

	var args string
	if p.current.Type == token.ARGS {
		args = p.current.Literal
		p.advance()
	}

	if p.current.Type == token.NEWLINE {
		p.advance()
	}

	return &ast.CloseStmt{
		Pos:    pos,
		Reason: reason,
		Args:   args,
	}, nil
}

// parseBreakStmt parses: BREAK NEWLINE
func parseBreakStmt(p *Parser) (ast.Statement, error) {
	pos := ast.Pos{Line: p.current.Line, Column: p.current.Column}
	p.advance() // consume BREAK

	if p.current.Type == token.NEWLINE {
		p.advance()
	}

	return &ast.BreakStmt{Pos: pos}, nil
}

// parseContinueStmt parses: CONTINUE NEWLINE
func parseContinueStmt(p *Parser) (ast.Statement, error) {
	pos := ast.Pos{Line: p.current.Line, Column: p.current.Column}
	p.advance() // consume CONTINUE

	if p.current.Type == token.NEWLINE {
		p.advance()
	}

	return &ast.ContinueStmt{Pos: pos}, nil
}

// parseRawStmt captures the rest of the line as a raw statement.
func parseRawStmt(p *Parser) (ast.Statement, error) {
	pos := ast.Pos{Line: p.current.Line, Column: p.current.Column}
	text := p.collectRawUntil(token.NEWLINE)

	if p.current.Type == token.NEWLINE {
		p.advance()
	}

	return &ast.RawStmt{
		Pos:  pos,
		Text: text,
	}, nil
}

// bareUpdateError is the error for a bare `update Name` line at pos.
func (p *Parser) bareUpdateError(pos ast.Pos) error {
	msg := "update arrivals must be awaited: `await update Name`"
	if p.inSyncNexus {
		msg = "a sync nexus operation receives no updates; only a workflow awaits one"
	}
	return &ParseError{Msg: msg, Line: pos.Line, Column: pos.Column}
}

// lateHandlerError is the error for a handler declaration (`signal`, `query` or
// `update` Name followed by `(` or `:`) among the statements of a body, worded
// for that body. kw is the declaration's keyword.
func (p *Parser) lateHandlerError(kw, name token.Token) error {
	msg := fmt.Sprintf("%s handler %s is declared after the workflow body's first statement; declare handlers before it", kw.Literal, name.Literal)
	switch {
	case p.inSyncNexus:
		msg = fmt.Sprintf("a sync nexus operation declares no %s handlers; declare %s in a workflow", kw.Literal, name.Literal)
	case p.inHandler:
		msg = fmt.Sprintf("%s handler %s is declared inside a handler; declare handlers at the top of the workflow body", kw.Literal, name.Literal)
	}
	return &ParseError{Msg: msg, Line: kw.Line, Column: kw.Column}
}

// misplacedKeyword is the error for a body line led by a keyword that starts no
// statement in the body's context. It names the likely intent where there is
// one: a handler declared after the body began, or an arrival not awaited.
func (p *Parser) misplacedKeyword() error {
	kw := p.current
	errAt := func(format string, args ...any) error {
		return &ParseError{Msg: fmt.Sprintf(format, args...), Line: kw.Line, Column: kw.Column}
	}
	switch kw.Type {
	case token.UPDATE, token.QUERY:
		p.advance() // consume the keyword
		if p.current.Type == token.IDENT && (p.peek.Type == token.ARGS || p.peek.Type == token.COLON) {
			return p.lateHandlerError(kw, p.current)
		}
		if kw.Type == token.UPDATE {
			return p.bareUpdateError(ast.Pos{Line: kw.Line, Column: kw.Column})
		}
	case token.TIMER:
		return errAt("a timer must be awaited: `await timer(duration)`")
	}
	return errAt("%q cannot start a statement", kw.Literal)
}
