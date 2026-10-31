package parser

import (
	"fmt"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/token"
)

// Parse-error codes for workflow ID schemes and addressed signal sends.
const (
	CodeIDSchemeMisplaced = "ID_SCHEME_MISPLACED"
	CodeIDSchemeMalformed = "ID_SCHEME_MALFORMED"
	CodeIDValueMalformed  = "ID_VALUE_MALFORMED"
	CodeIDAtStart         = "ID_AT_START"
	CodeAddressMisplaced  = "ADDRESS_MISPLACED"
)

// codedErrorf creates a ParseError carrying code at the current token position.
func (p *Parser) codedErrorf(code, format string, args ...interface{}) error {
	return &ParseError{
		Msg:    fmt.Sprintf(format, args...),
		Line:   p.current.Line,
		Column: p.current.Column,
		code:   code,
	}
}

// parseOptionalIDScheme parses a workflow's `id_scheme:` line when it is the
// first body element. params is the workflow's opaque parameter list; every
// hole must be rooted at one of its names.
//
//	id_scheme ::= 'id_scheme' ':' STRING NEWLINE
func (p *Parser) parseOptionalIDScheme(params string) (*ast.IDScheme, error) {
	if p.current.Type != token.ID_SCHEME {
		return nil, nil
	}
	pos := ast.Pos{Line: p.current.Line, Column: p.current.Column}
	p.advance() // consume ID_SCHEME
	if _, err := p.expect(token.COLON); err != nil {
		return nil, err
	}
	if p.current.Type != token.STRING {
		return nil, p.codedErrorf(CodeIDSchemeMalformed, "id_scheme: takes a quoted template")
	}
	tmpl := p.current
	_, holes, msg := ast.ParseIDTemplate(tmpl.Literal)
	if msg != "" {
		return nil, p.codedErrorf(CodeIDSchemeMalformed, "id_scheme %q is malformed: %s", tmpl.Literal, msg)
	}
	names := ast.ParamNames(params)
	for _, h := range holes {
		if root := ast.IDPathRoot(h); !names[root] {
			return nil, p.codedErrorf(CodeIDSchemeMalformed, "id_scheme hole {%s} is not rooted at a param of this workflow", h)
		}
	}
	p.advance() // consume STRING
	if p.current.Type == token.COMMENT {
		p.advance()
	}
	if p.current.Type == token.NEWLINE {
		p.advance()
	}
	return &ast.IDScheme{Pos: pos, Template: tmpl.Literal, Holes: holes}, nil
}

// misplacedIDScheme reports an `id_scheme:` anywhere but the head of a workflow
// body, including a repeated one.
func (p *Parser) misplacedIDScheme() error {
	return p.codedErrorf(CodeIDSchemeMisplaced, "id_scheme: must be the first line of a workflow body, and appears at most once")
}

// parseMisplacedIDScheme is the workflow-body statement parser for ID_SCHEME.
func parseMisplacedIDScheme(p *Parser) (ast.Statement, error) {
	return nil, p.misplacedIDScheme()
}

// checkMisplacedAddress reports an `id:` / `run_id:` line indented under a
// statement that is not a signal send: ID_AT_START under a workflow start,
// ADDRESS_MISPLACED anywhere else. prev is the statement just parsed.
func (p *Parser) checkMisplacedAddress(prev ast.Statement) error {
	if p.current.Type != token.INDENT || !isAddressKey(p.peek) {
		return nil
	}
	p.advance() // consume INDENT
	if isWorkflowStart(prev) {
		return p.codedErrorf(CodeIDAtStart, "a workflow start takes no %s:; the ID derives from the started type's id_scheme", p.current.Literal)
	}
	return p.codedErrorf(CodeAddressMisplaced, "%s: is an address key, valid only under a signal send", p.current.Literal)
}

func isWorkflowStart(s ast.Statement) bool {
	switch s := s.(type) {
	case *ast.WorkflowCall:
		return true
	case *ast.PromiseStmt:
		_, ok := s.Target.(*ast.WorkflowTarget)
		return ok
	case *ast.AwaitStmt:
		_, ok := s.Target.(*ast.WorkflowTarget)
		return ok
	}
	return false
}
