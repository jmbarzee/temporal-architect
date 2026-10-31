package parser

import (
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/token"
)

// parseSignalSendStmt parses a cross-workflow signal send in a body:
//
//	signal_send_stmt ::= 'signal' send_head '.' IDENT args NEWLINE [address]
//
// A bare `signal` at statement start is a send — arrivals only ever appear under
// await / promise / await one. `signal Name(` or `signal Name:` here is a handler
// declaration that came after the body's first statement.
func parseSignalSendStmt(p *Parser) (ast.Statement, error) {
	pos := ast.Pos{Line: p.current.Line, Column: p.current.Column}
	p.advance() // consume SIGNAL

	first, err := p.expect(token.IDENT)
	if err != nil {
		return nil, err
	}
	if p.current.Type != token.DOT {
		if p.current.Type == token.ARGS || p.current.Type == token.COLON {
			return nil, p.errorf("signal handler %s is declared after the workflow body's first statement; declare handlers before it", first.Literal)
		}
		return nil, p.errorf("signal arrivals must be awaited; a send requires `Head.Name(args)`")
	}
	return parseSignalSendRest(p, pos, first)
}

// parseSignalSendRest parses a send after its `signal` keyword and first head
// identifier, with the current token on the DOT that follows it.
//
//	send_head ::= qualified_ref | IDENT
func parseSignalSendRest(p *Parser, pos ast.Pos, first token.Token) (ast.Statement, error) {
	segs := []token.Token{first}
	for p.current.Type == token.DOT {
		p.advance() // consume DOT
		seg, err := p.expect(token.IDENT)
		if err != nil {
			return nil, err
		}
		segs = append(segs, seg)
	}
	if len(segs) > 3 {
		return nil, &ParseError{
			Msg:    "a send head is a workflow type, a qualified pkg.Type, or a handle",
			Line:   first.Line,
			Column: first.Column,
		}
	}

	args, err := p.expect(token.ARGS)
	if err != nil {
		return nil, err
	}

	if p.current.Type == token.COMMENT {
		p.advance()
	}
	switch p.current.Type {
	case token.NEWLINE:
		p.advance()
	case token.DEDENT, token.EOF:
	default:
		if isAddressKey(p.current) {
			return nil, p.codedErrorf(CodeAddressMisplaced, "an address goes on its own indented line below the send")
		}
		return nil, p.errorf("expected NEWLINE after a signal send, got %s (%q)", p.current.Type, p.current.Literal)
	}

	address, err := p.parseOptionalAddress()
	if err != nil {
		return nil, err
	}

	head := ast.SendHead{
		Pos:     ast.Pos{Line: first.Line, Column: first.Column},
		Address: address,
	}
	headPos := head.Pos
	switch {
	case len(segs) == 3:
		head.Kind = ast.SendHeadType
		head.Type = ast.Ref[*ast.WorkflowDef]{Pos: headPos, Package: segs[0].Literal, Name: segs[1].Literal}
	case address != nil:
		head.Kind = ast.SendHeadType
		head.Type = ast.Ref[*ast.WorkflowDef]{Pos: headPos, Name: segs[0].Literal}
	default:
		head.Kind = ast.SendHeadHandle
		head.Handle = ast.Ref[*ast.PromiseStmt]{Pos: headPos, Name: segs[0].Literal}
	}

	return &ast.SignalSendStmt{
		Pos:    pos,
		Head:   head,
		Signal: segs[len(segs)-1].Literal,
		Args:   args.Literal,
	}, nil
}

// parseOptionalAddress parses the indented address block under a send, if one
// follows:
//
//	address  ::= INDENT 'id' ':' id_value NEWLINE [ 'run_id' ':' path NEWLINE ] DEDENT
//	id_value ::= STRING | 'parent' | path
func (p *Parser) parseOptionalAddress() (*ast.Address, error) {
	if p.current.Type != token.INDENT {
		return nil, nil
	}
	switch {
	case p.peek.Type == token.COMMENT:
		// Comments may sit above the address; nothing else is indented under a send.
		p.advance() // consume INDENT
		p.skipBlankLinesAndComments()
		if p.current.Type == token.DEDENT {
			p.advance()
			return nil, nil
		}
	case p.peek.Type == token.OPTIONS || isAddressKey(p.peek):
		p.advance() // consume INDENT
	default:
		return nil, nil
	}
	switch {
	case p.current.Type == token.OPTIONS:
		return nil, p.codedErrorf(CodeAddressMisplaced, "a signal send takes no options:")
	case p.current.Type == token.IDENT && p.current.Literal == "run_id":
		return nil, p.codedErrorf(CodeAddressMisplaced, "run_id: follows an id: line")
	case p.current.Type != token.IDENT || p.current.Literal != "id":
		return nil, p.errorf("unexpected %q indented under a signal send", p.current.Literal)
	}

	addr := &ast.Address{Pos: ast.Pos{Line: p.current.Line, Column: p.current.Column}}
	p.advance() // consume `id`
	if _, err := p.expect(token.COLON); err != nil {
		return nil, err
	}

	id := ast.IDValue{Pos: ast.Pos{Line: p.current.Line, Column: p.current.Column}}
	switch {
	case p.current.Type == token.STRING:
		_, holes, msg := ast.ParseIDTemplate(p.current.Literal)
		if msg != "" {
			return nil, p.codedErrorf(CodeIDValueMalformed, "id literal %q is malformed: %s", p.current.Literal, msg)
		}
		id.Kind, id.Literal, id.Parts = ast.IDLiteral, p.current.Literal, holes
		p.advance()
	case p.current.Type == token.IDENT && p.current.Literal == "parent":
		if p.peek.Type == token.DOT {
			return nil, p.codedErrorf(CodeIDValueMalformed, "parent is reserved: id: parent takes no path")
		}
		if p.inSyncNexus {
			return nil, p.codedErrorf(CodeAddressMisplaced, "id: parent is not allowed in a sync nexus operation body; it has no parent workflow")
		}
		id.Kind = ast.IDParent
		p.advance()
	case p.current.Type == token.IDENT:
		name, err := p.parseDotQualifiedIdent()
		if err != nil {
			return nil, err
		}
		id.Kind, id.Name = ast.IDName, name
	default:
		return nil, p.codedErrorf(CodeIDValueMalformed, "id: takes a quoted literal, parent, or one name; bind anything else on the line before")
	}
	if err := p.endAddressLine(CodeIDValueMalformed, "id: takes a quoted literal, parent, or one name; bind anything else on the line before"); err != nil {
		return nil, err
	}
	addr.ID = id

	p.skipBlankLinesAndComments()
	if p.current.Type == token.IDENT && p.current.Literal == "run_id" {
		if id.Kind == ast.IDParent {
			return nil, p.codedErrorf(CodeAddressMisplaced, "run_id: is not allowed under id: parent")
		}
		p.advance() // consume `run_id`
		if _, err := p.expect(token.COLON); err != nil {
			return nil, err
		}
		if p.current.Type != token.IDENT {
			return nil, p.codedErrorf(CodeAddressMisplaced, "run_id: takes a name; a run ID is observed, never written as a literal")
		}
		runID, err := p.parseDotQualifiedIdent()
		if err != nil {
			return nil, err
		}
		if err := p.endAddressLine(CodeAddressMisplaced, "run_id: takes one name"); err != nil {
			return nil, err
		}
		addr.RunID = runID
		p.skipBlankLinesAndComments()
	}

	switch {
	case p.current.Type == token.DEDENT:
		p.advance()
	case p.current.Type == token.EOF:
	case p.current.Type == token.OPTIONS:
		return nil, p.codedErrorf(CodeAddressMisplaced, "a signal send takes no options:")
	case isAddressKey(p.current):
		return nil, p.codedErrorf(CodeAddressMisplaced, "an address is one id: line, then an optional run_id: line")
	default:
		return nil, p.codedErrorf(CodeAddressMisplaced, "unexpected %q in a send's address", p.current.Literal)
	}
	return addr, nil
}

// endAddressLine consumes the end of an address line — an optional trailing
// comment, then NEWLINE — or reports code with msg when anything else follows.
func (p *Parser) endAddressLine(code, msg string) error {
	if p.current.Type == token.COMMENT {
		p.advance()
	}
	switch p.current.Type {
	case token.NEWLINE:
		p.advance()
	case token.DEDENT, token.EOF:
	default:
		return p.codedErrorf(code, "%s", msg)
	}
	return nil
}

// isAddressKey reports whether tok is one of the address keys `id` / `run_id`,
// which are special only on a send's address lines.
func isAddressKey(tok token.Token) bool {
	return tok.Type == token.IDENT && (tok.Literal == "id" || tok.Literal == "run_id")
}
