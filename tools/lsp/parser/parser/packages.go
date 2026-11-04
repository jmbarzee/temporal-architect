package parser

import (
	"fmt"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/token"
)

// parsePackageClause parses a package clause, `package IDENT`, consuming its
// whole line. first reports whether it is the file's first clause. A clause
// that is not first (a duplicate included) excludes the file. A clause that
// fails to parse is recovered from the token after `package` when that is an
// identifier or a keyword (`package a.b` → `a`, `package nexus` → `nexus`);
// otherwise the file is excluded. Either way the error is returned, and the
// file never silently becomes clause-less.
func (p *Parser) parsePackageClause(file *ast.File, first bool) error {
	pos := ast.Pos{Line: p.current.Line, Column: p.current.Column}
	p.advance() // consume PACKAGE
	defer p.skipLine(pos.Line)

	if !first || file.PackagePos.Line != 0 {
		file.ClauseExcluded = true
		msg := "package clause must be the file's first clause"
		if file.PackagePos.Line != 0 {
			msg = "duplicate package clause"
		}
		return &ParseError{Msg: msg, Line: pos.Line, Column: pos.Column}
	}
	file.PackagePos = pos

	name := p.current
	word := name.Type == token.IDENT || token.LookupIdent(name.Literal) == name.Type
	if name.Line != pos.Line || !word || !isWord(name.Literal) {
		file.ClauseExcluded = true
		return &ParseError{Msg: "expected a package name after package", Line: pos.Line, Column: pos.Column}
	}
	file.Package = name.Literal
	p.advance()
	switch {
	case name.Type != token.IDENT:
		file.PackageRecovered = true
		return &ParseError{Msg: fmt.Sprintf("package name %q is a keyword", name.Literal), Line: name.Line, Column: name.Column}
	case p.current.Line == pos.Line && p.current.Type != token.NEWLINE && p.current.Type != token.COMMENT && p.current.Type != token.EOF:
		file.PackageRecovered = true
		return &ParseError{Msg: "a package name is one identifier", Line: p.current.Line, Column: p.current.Column}
	}
	return nil
}

// skipLine advances past every token on line, and the newline ending it.
func (p *Parser) skipLine(line int) {
	for p.current.Type != token.EOF && p.current.Line == line && p.current.Type != token.NEWLINE {
		p.advance()
	}
	if p.current.Type == token.NEWLINE {
		p.advance()
	}
}

// isWord reports whether s is identifier-shaped: an IDENT's or a keyword's text.
func isWord(s string) bool {
	if s == "" {
		return false
	}
	for i, r := range s {
		switch {
		case r == '_', r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z':
		case i > 0 && r >= '0' && r <= '9':
		default:
			return false
		}
	}
	return true
}

// misplacedImport is the error for an import that follows a definition.
func misplacedImport(imp *ast.ImportDecl) *ParseError {
	return &ParseError{Msg: "import must come before the file's definitions", Line: imp.Line, Column: imp.Column}
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
