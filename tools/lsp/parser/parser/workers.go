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
		Pos:     pos,
		Name:    name.Literal,
		NamePos: posOf(name),
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
			pkg, name, err := p.parseWorkerRef()
			if err != nil {
				return nil, err
			}
			worker.Workflows = append(worker.Workflows, refTo[*ast.WorkflowDef](pkg, name))

		case token.ACTIVITY:
			pkg, name, err := p.parseWorkerRef()
			if err != nil {
				return nil, err
			}
			worker.Activities = append(worker.Activities, refTo[*ast.ActivityDef](pkg, name))

		case token.NEXUS:
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
			// A third segment (`pkg.Svc.Op`) names an operation. A worker
			// registers whole services, so keep the service and record the
			// operation for the resolver to diagnose; failing here would drop
			// the whole worker.
			if svcPkg.Literal != "" && p.current.Type == token.DOT {
				p.advance() // consume DOT
				op, err := p.expect(token.IDENT)
				if err != nil {
					return nil, err
				}
				worker.OperationMentions = append(worker.OperationMentions, ast.OperationMention{
					Pos:          posOf(op),
					ServiceIndex: len(worker.Services),
					Op:           op.Literal,
				})
			}
			worker.Services = append(worker.Services, refTo[*ast.NexusServiceDef](svcPkg, svcName))
			if p.current.Type == token.NEWLINE {
				p.advance()
			}

		case token.AT:
			if err := p.skipBodyAnnotation(); err != nil {
				return nil, err
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
// package-qualified name ([IDENT.]IDENT), and returns the qualifier (zero when
// unqualified) and name tokens. Consumes a trailing NEWLINE if present.
func (p *Parser) parseWorkerRef() (pkg, name token.Token, err error) {
	p.advance() // consume keyword (WORKFLOW, ACTIVITY, etc.)
	pkg, name, err = p.parseRefNameWithPackage()
	if err != nil {
		return token.Token{}, token.Token{}, err
	}
	if p.current.Type == token.NEWLINE {
		p.advance()
	}
	return pkg, name, nil
}
