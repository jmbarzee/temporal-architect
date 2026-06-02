package parser

import (
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/token"
)

// parseSignalSendStmt parses a cross-workflow signal send:
//
//	signal_send_stmt ::= 'signal' send_target args NEWLINE
//	send_target      ::= ident_handle_target
//	ident_handle_target ::= IDENT '.' IDENT
//
// A bare `signal` at statement start is unambiguously a send — arrivals only
// ever appear under await / promise / await one, never as a leading statement.
// One-token lookahead on the dot distinguishes a send from a mistakenly
// statement-positioned arrival and yields a targeted error.
func parseSignalSendStmt(p *Parser) (ast.Statement, error) {
	pos := ast.Pos{Line: p.current.Line, Column: p.current.Column}
	p.advance() // consume SIGNAL

	handle, err := p.expect(token.IDENT)
	if err != nil {
		return nil, err
	}

	if p.current.Type != token.DOT {
		return nil, p.errorf("signal arrivals must be awaited; a send requires `handle.Name(args)`")
	}
	p.advance() // consume DOT

	name, err := p.expect(token.IDENT)
	if err != nil {
		return nil, err
	}

	args, err := p.expect(token.ARGS)
	if err != nil {
		return nil, err
	}

	if p.current.Type == token.NEWLINE {
		p.advance()
	}

	return &ast.SignalSendStmt{
		Pos: pos,
		Handle: ast.Ref[*ast.PromiseStmt]{
			Pos:  ast.Pos{Line: handle.Line, Column: handle.Column},
			Name: handle.Literal,
		},
		Signal: name.Literal,
		Args:   args.Literal,
	}, nil
}
