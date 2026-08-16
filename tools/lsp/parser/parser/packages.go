package parser

import (
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/token"
)

// parsePackageClause parses a leading package clause: `package name` where name
// is a (possibly dot-qualified) identifier. It sets File.Package. Empty package
// (a clause-less file) is the implicit default package, so this is purely
// additive: files without a package clause are unchanged.
func (p *Parser) parsePackageClause(file *ast.File) error {
	pos := ast.Pos{Line: p.current.Line, Column: p.current.Column}
	p.advance() // consume PACKAGE

	name, err := p.parseDotQualifiedIdent()
	if err != nil {
		return err
	}
	if file.Package != "" {
		return &ParseError{
			Msg:    "duplicate package clause",
			Line:   pos.Line,
			Column: pos.Column,
		}
	}
	file.Package = name

	if p.current.Type == token.NEWLINE {
		p.advance()
	}
	return nil
}

// parseImportDecl parses one import declaration in either form:
//
//	import "path"
//	import alias "path"
//
// The path is carried verbatim (the module-path form is not enforced in this
// slice). An empty Alias means the import is referenced by its leaf name.
func (p *Parser) parseImportDecl() (*ast.ImportDecl, error) {
	pos := ast.Pos{Line: p.current.Line, Column: p.current.Column}
	p.advance() // consume IMPORT

	var alias string
	if p.current.Type == token.IDENT {
		alias = p.current.Literal
		p.advance()
	}

	path, err := p.expect(token.STRING)
	if err != nil {
		return nil, err
	}

	if p.current.Type == token.NEWLINE {
		p.advance()
	}

	return &ast.ImportDecl{
		Pos:   pos,
		Path:  path.Literal,
		Alias: alias,
	}, nil
}
