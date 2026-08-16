package parser

import (
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/token"
)

// parseWorkerDef parses:
// WORKER IDENT COLON NEWLINE INDENT worker_entries DEDENT
func parseWorkerDef(p *Parser) (ast.Definition, error) {
	pos := ast.Pos{Line: p.current.Line, Column: p.current.Column}
	p.advance() // consume WORKER

	name, err := p.expect(token.IDENT)
	if err != nil {
		return nil, err
	}

	if err := p.expectBlock(); err != nil {
		return nil, err
	}

	worker := &ast.WorkerDef{
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

		case token.WORKFLOW:
			pos, pkg, name, err := p.parseWorkerRef()
			if err != nil {
				return nil, err
			}
			worker.Workflows = append(worker.Workflows, ast.Ref[*ast.WorkflowDef]{Pos: pos, Package: pkg, Name: name})

		case token.ACTIVITY:
			pos, pkg, name, err := p.parseWorkerRef()
			if err != nil {
				return nil, err
			}
			worker.Activities = append(worker.Activities, ast.Ref[*ast.ActivityDef]{Pos: pos, Package: pkg, Name: name})

		case token.NEXUS:
			refPos := ast.Pos{Line: p.current.Line, Column: p.current.Column}
			p.advance() // consume NEXUS
			// Expect IDENT "service"
			if p.current.Type != token.IDENT || p.current.Literal != "service" {
				return nil, p.errorf("expected 'service' after 'nexus' in worker block, got %s %q", p.current.Type, p.current.Literal)
			}
			p.advance() // consume "service"
			svcPkg, svcName, err := p.parseRefNameWithPackage()
			if err != nil {
				return nil, err
			}
			worker.Services = append(worker.Services, ast.Ref[*ast.NexusServiceDef]{
				Pos:     refPos,
				Package: svcPkg,
				Name:    svcName,
			})
			if p.current.Type == token.NEWLINE {
				p.advance()
			}

		default:
			return nil, p.errorf("unexpected %s in worker block", p.current.Type)
		}
	}

	if p.current.Type == token.DEDENT {
		p.advance()
	}

	return worker, nil
}

// parseWorkerRef consumes the current keyword token, expects an optionally
// package-qualified name ([IDENT.]IDENT), and returns the position, package
// qualifier (empty when unqualified), and name. Consumes a trailing NEWLINE if
// present.
func (p *Parser) parseWorkerRef() (ast.Pos, string, string, error) {
	pos := ast.Pos{Line: p.current.Line, Column: p.current.Column}
	p.advance() // consume keyword (WORKFLOW, ACTIVITY, etc.)
	pkg, name, err := p.parseRefNameWithPackage()
	if err != nil {
		return ast.Pos{}, "", "", err
	}
	if p.current.Type == token.NEWLINE {
		p.advance()
	}
	return pos, pkg, name, nil
}
