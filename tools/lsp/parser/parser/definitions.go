package parser

import (
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/token"
)

// parseWorkflowDef parses:
// WORKFLOW IDENT ARGS [ ARROW ARGS ] COLON NEWLINE
// INDENT [ id_scheme ] [ default_options ] [ state ]
// { signal_def | query_def | update_def } workflow_body DEDENT
func parseWorkflowDef(p *Parser) (ast.Definition, error) {
	pos := ast.Pos{Line: p.current.Line, Column: p.current.Column}
	p.advance() // consume WORKFLOW

	name, err := p.expect(token.IDENT)
	if err != nil {
		return nil, err
	}

	params, err := p.expect(token.ARGS)
	if err != nil {
		return nil, err
	}

	var returnType string
	if p.current.Type == token.ARROW {
		p.advance() // consume ARROW
		rt, err := p.expect(token.ARGS)
		if err != nil {
			return nil, err
		}
		returnType = rt.Literal
	}

	if err := p.expectBlock(); err != nil {
		return nil, err
	}

	// Optional id_scheme: line, the first body element: the type's ID is part of
	// its identity, ahead of everything that describes how it is invoked.
	p.skipBlankLinesAndComments()
	idScheme, err := p.parseOptionalIDScheme(params.Literal)
	if err != nil {
		return nil, err
	}

	// Optional default_options block, before state:. A definition's defaults are
	// its external invocation contract, which reads above its internal state:.
	p.skipBlankLinesAndComments()
	defaultOptions, _, err := p.parseDefaultOptions(OptionsContextWorkflowDefaults) // comments were skipped above
	if err != nil {
		return nil, err
	}

	// Optional state block (must come before handlers and body).
	p.skipBlankLinesAndComments()
	var stateBlock *ast.StateBlock
	if p.current.Type == token.STATE {
		stateBlock, err = parseStateBlock(p)
		if err != nil {
			return nil, err
		}
	}

	// Parse signal/query/update declarations (must come before body stmts).
	var signals []*ast.SignalDecl
	var queries []*ast.QueryDecl
	var updates []*ast.UpdateDecl
	var firstSend ast.Statement

	// A failed declaration line, like a failed statement, is left out when
	// collecting errors (see recoverLine).
	depth := p.depth
declLoop:
	for {
		// Skip blank lines and comments between declarations.
		p.skipBlankLinesAndComments()
		start := p.current

		var err error
		send := false
		switch p.current.Type {
		case token.SIGNAL:
			// `signal IDENT` then `.` is a send — the body's first statement,
			// which ends this region; `(` or `:` is a handler declaration.
			var sig *ast.SignalDecl
			sig, firstSend, send, err = parseSignalDeclOrSend(p)
			if err == nil && send {
				break declLoop
			}
			if err == nil {
				signals = append(signals, sig)
			}
		case token.ID_SCHEME:
			err = p.misplacedIDScheme()
		case token.QUERY:
			var q *ast.QueryDecl
			if q, err = parseQueryDecl(p); err == nil {
				queries = append(queries, q)
			}
		case token.UPDATE:
			var u *ast.UpdateDecl
			if u, err = parseUpdateDecl(p); err == nil {
				updates = append(updates, u)
			}
		default:
			break declLoop
		}
		if err != nil {
			if err := p.recoverLine(err, start, depth); err != nil {
				return nil, err
			}
			if send || p.depth < depth {
				break declLoop // a failed send is the body's first statement
			}
		}
	}

	// Parse workflow body, unless a failed line consumed its end.
	var body []ast.Statement
	if p.depth == depth {
		body, err = p.parseBodyAs(bodyWorkflow)
		if err != nil {
			return nil, err
		}
	}
	if firstSend != nil {
		body = append([]ast.Statement{firstSend}, body...)
	}

	return &ast.WorkflowDef{
		Pos:            pos,
		Name:           name.Literal,
		NamePos:        posOf(name),
		Params:         params.Literal,
		ReturnType:     returnType,
		IDScheme:       idScheme,
		DefaultOptions: defaultOptions,
		State:          stateBlock,
		Signals:        signals,
		Queries:        queries,
		Updates:        updates,
		Body:           body,
	}, nil
}

// parseActivityDef parses:
// ACTIVITY IDENT ARGS [ ARROW ARGS ] COLON NEWLINE
// INDENT activity_body DEDENT
func parseActivityDef(p *Parser) (ast.Definition, error) {
	pos := ast.Pos{Line: p.current.Line, Column: p.current.Column}
	p.advance() // consume ACTIVITY

	name, err := p.expect(token.IDENT)
	if err != nil {
		return nil, err
	}

	params, err := p.expect(token.ARGS)
	if err != nil {
		return nil, err
	}

	var returnType string
	if p.current.Type == token.ARROW {
		p.advance()
		rt, err := p.expect(token.ARGS)
		if err != nil {
			return nil, err
		}
		returnType = rt.Literal
	}

	if err := p.expectBlock(); err != nil {
		return nil, err
	}

	// Optional default_options block at the head of the activity body.
	defaultOptions, comments, err := p.parseDefaultOptions(OptionsContextActivityDefaults)
	if err != nil {
		return nil, err
	}

	body, err := p.parseBodyAs(bodyActivity)
	if err != nil {
		return nil, err
	}
	body = append(comments, body...)

	return &ast.ActivityDef{
		Pos:            pos,
		Name:           name.Literal,
		NamePos:        posOf(name),
		Params:         params.Literal,
		ReturnType:     returnType,
		DefaultOptions: defaultOptions,
		Body:           body,
	}, nil
}

// parseDefaultOptions parses an optional definition-level `default_options:`
// block at the head of an activity or workflow definition body (see
// parseHeadOptions). `default_options` is a soft/contextual keyword — it lexes
// as an IDENT and is special only here — so it is matched on the literal rather
// than a dedicated token type. The block reuses the call-option value grammar;
// ctx selects the definition-defaults key partition (activity vs workflow).
func (p *Parser) parseDefaultOptions(ctx OptionsContext) (*ast.OptionsBlock, []ast.Statement, error) {
	return p.parseHeadOptions(ctx, func(t token.Token) bool {
		return t.Type == token.IDENT && t.Literal == "default_options"
	})
}

// parseHandlerOptions parses an optional `options:` block at the head of a
// handler body (see parseHeadOptions), validated against the handler context
// (the same placement as a state: block at the top of a workflow).
func (p *Parser) parseHandlerOptions(ctx OptionsContext) (*ast.OptionsBlock, []ast.Statement, error) {
	return p.parseHeadOptions(ctx, func(t token.Token) bool { return t.Type == token.OPTIONS })
}

// parseHeadOptions parses an optional options block, led by a token isHead
// matches, at the head of a body whose INDENT expectBlock has consumed.
// Comment lines may sit above the block, which discards them as it does the
// comments inside it. With no block, it returns them for the body to keep.
func (p *Parser) parseHeadOptions(ctx OptionsContext, isHead func(token.Token) bool) (*ast.OptionsBlock, []ast.Statement, error) {
	var comments []ast.Statement
	for p.current.Type == token.COMMENT || p.current.Type == token.NEWLINE {
		if p.current.Type == token.COMMENT {
			comments = append(comments, p.parseComment())
		} else {
			p.advance()
		}
	}
	if !isHead(p.current) {
		return nil, comments, nil
	}
	p.advance() // consume the leading keyword
	opts, err := p.parseOptionsBlock(ctx)
	return opts, nil, err
}

// parseSignalDeclOrSend parses a `signal` line at the head of a workflow body:
// a handler declaration, or, when a `.` follows the name, a send that is the
// body's first statement. send reports which one the line is.
func parseSignalDeclOrSend(p *Parser) (sig *ast.SignalDecl, firstSend ast.Statement, send bool, err error) {
	pos := ast.Pos{Line: p.current.Line, Column: p.current.Column}
	p.advance() // consume SIGNAL
	name, err := p.expect(token.IDENT)
	if err != nil {
		return nil, nil, false, err
	}
	if p.current.Type == token.DOT {
		firstSend, err = parseSignalSendRest(p, pos, name)
		if err == nil {
			err = p.checkMisplacedAddress(firstSend)
		}
		if err != nil {
			return nil, nil, true, err
		}
		return nil, firstSend, true, nil
	}
	sig, err = parseSignalDeclRest(p, pos, name)
	return sig, nil, false, err
}

// parseSignalDeclRest parses a signal declaration after its `signal` keyword and
// name: [ ARGS ] COLON NEWLINE INDENT [options_block] body DEDENT
func parseSignalDeclRest(p *Parser, pos ast.Pos, name token.Token) (*ast.SignalDecl, error) {
	var params string
	if p.current.Type == token.ARGS {
		params = p.current.Literal
		p.advance()
	}

	if err := p.expectBlock(); err != nil {
		return nil, err
	}

	options, comments, err := p.parseHandlerOptions(OptionsContextSignalHandler)
	if err != nil {
		return nil, err
	}

	body, err := p.parseHandlerBody(bodyWorkflow)
	if err != nil {
		return nil, err
	}
	body = append(comments, body...)

	return &ast.SignalDecl{
		Pos:     pos,
		Name:    name.Literal,
		NamePos: posOf(name),
		Params:  params,
		Options: options,
		Body:    body,
	}, nil
}

// parseQueryDecl parses: QUERY IDENT ARGS [ ARROW ARGS ] COLON NEWLINE INDENT body DEDENT
func parseQueryDecl(p *Parser) (*ast.QueryDecl, error) {
	pos := ast.Pos{Line: p.current.Line, Column: p.current.Column}
	p.advance() // consume QUERY

	name, err := p.expect(token.IDENT)
	if err != nil {
		return nil, err
	}

	params, err := p.expect(token.ARGS)
	if err != nil {
		return nil, err
	}

	var returnType string
	if p.current.Type == token.ARROW {
		p.advance()
		rt, err := p.expect(token.ARGS)
		if err != nil {
			return nil, err
		}
		returnType = rt.Literal
	}

	if err := p.expectBlock(); err != nil {
		return nil, err
	}

	options, comments, err := p.parseHandlerOptions(OptionsContextQueryHandler)
	if err != nil {
		return nil, err
	}

	// Query bodies are restricted like activity bodies (no temporal primitives).
	body, err := p.parseHandlerBody(bodyQuery)
	if err != nil {
		return nil, err
	}
	body = append(comments, body...)

	return &ast.QueryDecl{
		Pos:        pos,
		Name:       name.Literal,
		NamePos:    posOf(name),
		Params:     params.Literal,
		ReturnType: returnType,
		Options:    options,
		Body:       body,
	}, nil
}

// parseUpdateDecl parses: UPDATE IDENT ARGS [ ARROW ARGS ] COLON NEWLINE INDENT body DEDENT
func parseUpdateDecl(p *Parser) (*ast.UpdateDecl, error) {
	pos := ast.Pos{Line: p.current.Line, Column: p.current.Column}
	p.advance() // consume UPDATE

	name, err := p.expect(token.IDENT)
	if err != nil {
		return nil, err
	}
	if p.current.Type == token.NEWLINE || p.current.Type == token.COMMENT {
		return nil, p.bareUpdateError(pos)
	}

	params, err := p.expect(token.ARGS)
	if err != nil {
		return nil, err
	}

	var returnType string
	if p.current.Type == token.ARROW {
		p.advance()
		rt, err := p.expect(token.ARGS)
		if err != nil {
			return nil, err
		}
		returnType = rt.Literal
	}

	if err := p.expectBlock(); err != nil {
		return nil, err
	}

	options, comments, err := p.parseHandlerOptions(OptionsContextUpdateHandler)
	if err != nil {
		return nil, err
	}

	body, err := p.parseHandlerBody(bodyWorkflow)
	if err != nil {
		return nil, err
	}
	body = append(comments, body...)

	return &ast.UpdateDecl{
		Pos:        pos,
		Name:       name.Literal,
		NamePos:    posOf(name),
		Params:     params.Literal,
		ReturnType: returnType,
		Options:    options,
		Body:       body,
	}, nil
}

// parseStateBlock parses: STATE COLON NEWLINE INDENT (condition_decl | raw_stmt)* DEDENT
func parseStateBlock(p *Parser) (*ast.StateBlock, error) {
	pos := ast.Pos{Line: p.current.Line, Column: p.current.Column}
	p.advance() // consume STATE

	if err := p.expectBlock(); err != nil {
		return nil, err
	}

	block := &ast.StateBlock{Pos: pos}

	depth := p.depth
	for p.current.Type != token.DEDENT && p.current.Type != token.EOF {
		if p.current.Type == token.NEWLINE {
			p.advance()
			continue
		}
		if p.current.Type == token.COMMENT {
			p.advance()
			if p.current.Type == token.NEWLINE {
				p.advance()
			}
			continue
		}

		if p.current.Type == token.CONDITION {
			start := p.current
			cond, err := parseConditionDecl(p)
			if err != nil {
				// A failed line is left out when collecting (see recoverLine).
				if err := p.recoverLine(err, start, depth); err != nil {
					return nil, err
				}
				if p.depth < depth {
					return block, nil
				}
				continue
			}
			block.Conditions = append(block.Conditions, cond)
		} else {
			// Raw statement (variable initialization, etc.)
			stmt, err := parseRawStmt(p)
			if err != nil {
				return nil, err
			}
			if raw, ok := stmt.(*ast.RawStmt); ok {
				block.RawStmts = append(block.RawStmts, raw)
			}
		}
	}

	if p.current.Type == token.DEDENT {
		p.advance()
	}

	return block, nil
}

// parseConditionDecl parses: CONDITION IDENT NEWLINE
func parseConditionDecl(p *Parser) (*ast.ConditionDecl, error) {
	pos := ast.Pos{Line: p.current.Line, Column: p.current.Column}
	p.advance() // consume CONDITION

	name, err := p.expect(token.IDENT)
	if err != nil {
		return nil, err
	}

	if err := p.endLine("condition " + name.Literal); err != nil {
		return nil, err
	}

	return &ast.ConditionDecl{
		Pos:     pos,
		Name:    name.Literal,
		NamePos: posOf(name),
	}, nil
}
