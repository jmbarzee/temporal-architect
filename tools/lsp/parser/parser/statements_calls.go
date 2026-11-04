package parser

import (
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/token"
)

// callParts holds the shared parsed components of an activity or workflow call.
type callParts struct {
	pos     ast.Pos
	pkg     token.Token
	name    token.Token
	args    string
	result  string
	options *ast.OptionsBlock
}

// parseCallParts parses the shared [IDENT.]IDENT ARGS [ ARROW IDENT ] NEWLINE [ options ] pattern.
func parseCallParts(p *Parser, optCtx OptionsContext) (*callParts, error) {
	pos := ast.Pos{Line: p.current.Line, Column: p.current.Column}
	p.advance() // consume keyword

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
		res, err := p.parseDotQualifiedIdent()
		if err != nil {
			return nil, err
		}
		result = res
	}

	if err := p.endLine("a call"); err != nil {
		return nil, err
	}

	options, err := p.parseOptionalOptionsLine(optCtx)
	if err != nil {
		return nil, err
	}

	return &callParts{pos: pos, pkg: pkg, name: name, args: args.Literal, result: result, options: options}, nil
}

// parseActivityCall parses: ACTIVITY IDENT ARGS [ ARROW IDENT ] NEWLINE [ options_line ]
func parseActivityCall(p *Parser) (ast.Statement, error) {
	cp, err := parseCallParts(p, OptionsContextActivity)
	if err != nil {
		return nil, err
	}
	return &ast.ActivityCall{
		Pos:      cp.pos,
		Activity: refTo[*ast.ActivityDef](cp.pkg, cp.name),
		Args:     cp.args,
		Result:   cp.result,
		Options:  cp.options,
	}, nil
}

// parseWorkflowCall parses: WORKFLOW IDENT ARGS [ ARROW IDENT ] NEWLINE [ options_line ]
func parseWorkflowCall(p *Parser) (ast.Statement, error) {
	cp, err := parseCallParts(p, p.workflowStartContext(ast.CallAttached))
	if err != nil {
		return nil, err
	}
	return &ast.WorkflowCall{
		Pos:      cp.pos,
		Mode:     ast.CallAttached,
		Start:    p.workflowStartKind(),
		Workflow: refTo[*ast.WorkflowDef](cp.pkg, cp.name),
		Args:     cp.args,
		Result:   cp.result,
		Options:  cp.options,
	}, nil
}
