package parser

import (
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/token"
)

// parseNexusTopLevel dispatches nexus top-level definitions.
// Current token is NEXUS. Peek: if IDENT "service" → parseNexusServiceDef
func parseNexusTopLevel(p *Parser) (ast.Definition, error) {
	// Current = NEXUS. Check if next is IDENT "service".
	if p.peek.Type == token.IDENT && p.peek.Literal == "service" {
		return parseNexusServiceDef(p)
	}
	return nil, p.errorf("expected 'service' after 'nexus' at top level, got %s", p.peek.Type)
}

// parseNexusServiceDef parses:
// NEXUS "service" IDENT COLON NEWLINE INDENT operations DEDENT
func parseNexusServiceDef(p *Parser) (ast.Definition, error) {
	pos := ast.Pos{Line: p.current.Line, Column: p.current.Column}
	p.advance() // consume NEXUS
	p.advance() // consume "service" IDENT

	name, err := p.expect(token.IDENT)
	if err != nil {
		return nil, err
	}

	if err := p.expectBlock(); err != nil {
		return nil, err
	}

	svc := &ast.NexusServiceDef{
		Pos:  pos,
		Name: name.Literal,
	}

	for p.current.Type != token.DEDENT && p.current.Type != token.EOF {
		switch p.current.Type {
		case token.NEWLINE:
			p.advance()
			continue
		case token.COMMENT:
			p.advance()
			if p.current.Type == token.NEWLINE {
				p.advance()
			}
			continue
		case token.ASYNC:
			op, err := parseAsyncOperation(p)
			if err != nil {
				return nil, err
			}
			svc.Operations = append(svc.Operations, op)
		case token.SYNC:
			op, err := parseSyncOperation(p)
			if err != nil {
				return nil, err
			}
			svc.Operations = append(svc.Operations, op)
		default:
			return nil, p.errorf("expected 'async' or 'sync' in nexus service body, got %s", p.current.Type)
		}
	}

	if p.current.Type == token.DEDENT {
		p.advance()
	}

	return svc, nil
}

// parseAsyncOperation parses: ASYNC IDENT WORKFLOW IDENT NEWLINE
func parseAsyncOperation(p *Parser) (*ast.NexusOperation, error) {
	pos := ast.Pos{Line: p.current.Line, Column: p.current.Column}
	p.advance() // consume ASYNC

	opName, err := p.expect(token.IDENT)
	if err != nil {
		return nil, err
	}

	if _, err := p.expect(token.WORKFLOW); err != nil {
		return nil, err
	}

	wfPkg, wfName, err := p.parseRefNameWithPackage()
	if err != nil {
		return nil, err
	}

	if p.current.Type == token.NEWLINE {
		p.advance()
	}

	return &ast.NexusOperation{
		Pos:      pos,
		OpType:   ast.NexusOpAsync,
		Name:     opName.Literal,
		Workflow: ast.Ref[*ast.WorkflowDef]{Package: wfPkg, Name: wfName},
	}, nil
}

// parseSyncOperation parses: SYNC IDENT ARGS ARROW ARGS COLON NEWLINE INDENT body DEDENT
func parseSyncOperation(p *Parser) (*ast.NexusOperation, error) {
	pos := ast.Pos{Line: p.current.Line, Column: p.current.Column}
	p.advance() // consume SYNC

	opName, err := p.expect(token.IDENT)
	if err != nil {
		return nil, err
	}

	params, err := p.expect(token.ARGS)
	if err != nil {
		return nil, err
	}

	if _, err := p.expect(token.ARROW); err != nil {
		return nil, err
	}

	retType, err := p.expect(token.ARGS)
	if err != nil {
		return nil, err
	}

	if err := p.expectBlock(); err != nil {
		return nil, err
	}

	// Parse body with workflow statement set (sync ops can use temporal primitives)
	body, err := p.parseBodyAs(bodyWorkflow)
	if err != nil {
		return nil, err
	}

	return &ast.NexusOperation{
		Pos:        pos,
		OpType:     ast.NexusOpSync,
		Name:       opName.Literal,
		Params:     params.Literal,
		ReturnType: retType.Literal,
		Body:       body,
	}, nil
}

// parseNexusCall parses: NEXUS IDENT IDENT DOT IDENT ARGS [ARROW IDENT] NEWLINE [options]
// Called when current token is NEXUS inside a workflow body.
func parseNexusCall(p *Parser) (ast.Statement, error) {
	pos := ast.Pos{Line: p.current.Line, Column: p.current.Column}
	return parseNexusCallInner(p, pos, false)
}

// parseNexusServiceRef parses the "[pkg.]Service.Operation" portion of a nexus
// call (the tokens after the endpoint), returning the optional service package
// qualifier and the service and operation identifier tokens. A leading
// `IDENT.` before `Service.Operation` — i.e. the three-segment
// `pkg.Service.Operation` — is the package qualifier (issue #109, completing the
// Ref[T].Package surface #108 landed on the AST/wire); the two-segment
// `Service.Operation` form consumes exactly the same tokens as before, so
// unpackaged nexus calls are byte-identical.
func (p *Parser) parseNexusServiceRef() (svcPkg string, svc, op token.Token, err error) {
	var zero token.Token
	first, err := p.expect(token.IDENT)
	if err != nil {
		return "", zero, zero, err
	}
	if _, err = p.expect(token.DOT); err != nil {
		return "", zero, zero, err
	}
	second, err := p.expect(token.IDENT)
	if err != nil {
		return "", zero, zero, err
	}
	if p.current.Type != token.DOT {
		return "", first, second, nil // Service.Operation
	}
	p.advance() // consume the second DOT: pkg.Service.Operation
	third, err := p.expect(token.IDENT)
	if err != nil {
		return "", zero, zero, err
	}
	return first.Literal, second, third, nil
}

// parseNexusCallInner is the shared parser for nexus calls (direct and detach).
func parseNexusCallInner(p *Parser, pos ast.Pos, detach bool) (ast.Statement, error) {
	p.advance() // consume NEXUS

	endpoint, _, err := p.expectDeployName()
	if err != nil {
		return nil, err
	}

	svcPkg, service, operation, err := p.parseNexusServiceRef()
	if err != nil {
		return nil, err
	}

	args, err := p.expect(token.ARGS)
	if err != nil {
		return nil, err
	}

	var result string
	if p.current.Type == token.ARROW {
		p.advance()
		res, err := p.expect(token.IDENT)
		if err != nil {
			return nil, err
		}
		result = res.Literal
	}

	// Validate: detach + arrow = error
	if detach && result != "" {
		return nil, &ParseError{
			Msg:    "detach nexus call cannot have a result (-> identifier)",
			Line:   pos.Line,
			Column: pos.Column,
		}
	}

	if p.current.Type == token.NEWLINE {
		p.advance()
	}

	options, err := p.parseOptionalOptionsLine(OptionsContextNexusCall)
	if err != nil {
		return nil, err
	}

	return &ast.NexusCall{
		Pos:       pos,
		Detach:    detach,
		Endpoint:  ast.Ref[*ast.NamespaceEndpoint]{Pos: ast.Pos{Line: endpoint.Line, Column: endpoint.Column}, Name: endpoint.Literal},
		Service:   ast.Ref[*ast.NexusServiceDef]{Pos: ast.Pos{Line: service.Line, Column: service.Column}, Package: svcPkg, Name: service.Literal},
		Operation: ast.Ref[*ast.NexusOperation]{Pos: ast.Pos{Line: operation.Line, Column: operation.Column}, Name: operation.Literal},
		Args:      args.Literal,
		Result:    result,
		Options:   options,
	}, nil
}

// parseWorkflowCallOrNexus handles DETACH dispatch: detach workflow ... or detach nexus ...
func parseWorkflowCallOrNexus(p *Parser) (ast.Statement, error) {
	pos := ast.Pos{Line: p.current.Line, Column: p.current.Column}
	p.advance() // consume DETACH

	if p.current.Type == token.NEXUS {
		return parseNexusCallInner(p, pos, true)
	}

	// Fall through to workflow call (detach workflow ...)
	if _, err := p.expect(token.WORKFLOW); err != nil {
		return nil, err
	}

	pkg, name, err := p.parseRefNameWithPackage()
	if err != nil {
		return nil, err
	}

	args, err := p.expect(token.ARGS)
	if err != nil {
		return nil, err
	}

	var result string
	if p.current.Type == token.ARROW {
		p.advance()
		res, err := p.expect(token.IDENT)
		if err != nil {
			return nil, err
		}
		result = res.Literal
	}

	// Validate: detach + arrow = error
	if result != "" {
		return nil, &ParseError{
			Msg:    "detach workflow call cannot have a result (-> identifier)",
			Line:   pos.Line,
			Column: pos.Column,
		}
	}

	if p.current.Type == token.NEWLINE {
		p.advance()
	}

	options, err := p.parseOptionalOptionsLine(OptionsContextWorkflow)
	if err != nil {
		return nil, err
	}

	return &ast.WorkflowCall{
		Pos:      pos,
		Mode:     ast.CallDetach,
		Workflow: ast.Ref[*ast.WorkflowDef]{Pos: pos, Package: pkg, Name: name},
		Args:     args.Literal,
		Result:   result,
		Options:  options,
	}, nil
}
