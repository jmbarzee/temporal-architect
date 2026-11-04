package parser

import (
	"fmt"
	"slices"
	"strings"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/lexer"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/token"
)

// Parse-error codes for annotations.
const (
	CodeUnknownAnnotation   = "UNKNOWN_ANNOTATION"
	CodeAnnotationMisplaced = "ANNOTATION_MISPLACED"
	CodeUnknownSDK          = "UNKNOWN_SDK"
	CodeDuplicateSDK        = "DUPLICATE_SDK"
	CodeInvalidImplPath     = "INVALID_IMPL_PATH"
)

// annotation is one annotation line: its '@', its name, and its arguments,
// each an IDENT or a STRING positioned in the file.
type annotation struct {
	at, name token.Token
	args     []token.Token
}

// parseAnnotated parses the annotation lines above a definition, then the
// definition, and applies the annotations to it. def is nil when no
// definition follows them.
func (p *Parser) parseAnnotated() (ast.Definition, error) {
	annots, err := p.parseAnnotations()
	if err != nil {
		return nil, err
	}
	parse, ok := topLevelParsers[p.current.Type]
	if !ok {
		if len(annots) == 0 {
			return nil, nil // each line failed, and is reported
		}
		a := annots[0]
		return nil, p.soft(annotationError(a.at, CodeAnnotationMisplaced, "an annotation sits on the lines directly above a definition"))
	}
	def, err := parse(p)
	if err != nil {
		return nil, err
	}
	for _, a := range annots {
		if err := p.apply(a, def); err != nil {
			return def, err
		}
	}
	return def, nil
}

// parseAnnotations parses annotation lines, and comment lines among them, up
// to the line that does not start with '@'. Collecting errors, a malformed
// line is reported and left out.
//
//	annotation ::= '@' IDENT [ '(' annot_arg (',' annot_arg)* ')' ] NEWLINE
//	annot_arg  ::= IDENT | STRING
func (p *Parser) parseAnnotations() ([]annotation, error) {
	var annots []annotation
	for {
		switch p.current.Type {
		case token.NEWLINE, token.COMMENT:
			p.advance()
			continue
		case token.AT:
		default:
			return annots, nil
		}
		start := p.current
		a, err := p.parseAnnotation()
		if err != nil {
			if err := p.recoverLine(err, start, p.depth); err != nil {
				return nil, err
			}
			continue
		}
		annots = append(annots, a)
	}
}

// parseAnnotation parses one annotation line, standing on its '@'.
func (p *Parser) parseAnnotation() (annotation, error) {
	a := annotation{at: p.current}
	p.advance() // consume '@'
	if p.current.Type != token.IDENT && !p.current.Type.IsKeyword() || p.current.Offset != a.at.End {
		return a, p.errorf("expected an annotation name directly after '@'")
	}
	a.name = p.current
	p.advance()
	if p.current.Type == token.ARGS {
		args, err := annotationArgs(p.current)
		if err != nil {
			return a, err
		}
		a.args = args
		p.advance()
	}
	return a, p.endLine("an annotation")
}

// annotationArgs splits an annotation's argument list into its arguments,
// positioned in the file.
func annotationArgs(list token.Token) ([]token.Token, error) {
	var args []token.Token
	expectArg := true
	var last token.Token
	l := lexer.New(list.Literal)
	for {
		tok := l.NextToken()
		switch tok.Type {
		case token.NEWLINE, token.INDENT, token.DEDENT, token.ILLEGAL:
			continue // layout, and escapes the file's own scan reported
		}
		if tok.Line == 1 {
			tok.Column += list.Column
		}
		tok.Line += list.Line - 1
		bad := func(format string, a ...any) error {
			return &ParseError{Msg: fmt.Sprintf(format, a...), Line: tok.Line, Column: tok.Column}
		}
		switch {
		case tok.Type == token.EOF && len(args) == 0:
			return nil, &ParseError{Msg: "an empty argument list; drop the parentheses", Line: list.Line, Column: list.Column}
		case tok.Type == token.EOF && expectArg:
			return nil, &ParseError{Msg: "expected an argument after ','", Line: last.Line, Column: last.Column}
		case tok.Type == token.EOF:
			return args, nil
		case expectArg && (tok.Type == token.IDENT || tok.Type == token.STRING):
			args = append(args, tok)
		case expectArg:
			return nil, bad("an annotation argument is a name or a quoted string, got %q", tok.Literal)
		case tok.Type != token.COMMA:
			return nil, bad("expected ',' between annotation arguments, got %q", tok.Literal)
		}
		expectArg = !expectArg
		last = tok
	}
}

// apply applies one annotation to the definition below it.
func (p *Parser) apply(a annotation, def ast.Definition) error {
	if a.name.Literal != "sdk" {
		return p.soft(annotationError(a.at, CodeUnknownAnnotation, fmt.Sprintf("unknown annotation @%s; the only annotation is @sdk", a.name.Literal)))
	}
	w, ok := def.(*ast.WorkerDef)
	if !ok {
		return p.soft(annotationError(a.at, CodeAnnotationMisplaced, "@sdk annotates a worker; a definition takes its SDK from the workers that register it"))
	}
	sdk, err := sdkOf(a)
	if err != nil {
		return p.soft(err)
	}
	if slices.ContainsFunc(w.SDKs, func(s ast.WorkerSDK) bool { return s.SDK == sdk.SDK }) {
		return p.soft(annotationError(a.at, CodeDuplicateSDK, fmt.Sprintf("worker %s already has an @sdk(%s); an SDK implements a worker once", w.Name, sdk.SDK)))
	}
	w.SDKs = append(w.SDKs, sdk)
	if sdk.Impl == "" && len(a.args) == 2 {
		return p.soft(implPathError(a.args[1]))
	}
	return nil
}

// sdkOf reads an `@sdk(<sdk>[, "path"])` annotation, leaving out an invalid
// path.
func sdkOf(a annotation) (ast.WorkerSDK, error) {
	sdk := ast.WorkerSDK{Pos: posOf(a.at)}
	switch {
	case len(a.args) == 0:
		return sdk, annotationError(a.name, CodeUnknownSDK, "@sdk names its SDK: one of "+strings.Join(ast.SDKs, ", "))
	case a.args[0].Type != token.IDENT || !slices.Contains(ast.SDKs, a.args[0].Literal):
		return sdk, annotationError(a.args[0], CodeUnknownSDK, fmt.Sprintf("unknown SDK %q; @sdk names one of %s", a.args[0].Literal, strings.Join(ast.SDKs, ", ")))
	case len(a.args) > 2:
		return sdk, &ParseError{Msg: "@sdk takes an SDK and an optional path", Line: a.args[2].Line, Column: a.args[2].Column}
	case len(a.args) == 2 && a.args[1].Type != token.STRING:
		return sdk, &ParseError{Msg: "an @sdk path is a quoted string", Line: a.args[1].Line, Column: a.args[1].Column}
	}
	sdk.SDK = a.args[0].Literal
	if len(a.args) == 2 && implPathProblem(a.args[1].Literal) == "" {
		sdk.Impl, sdk.ImplPos = a.args[1].Literal, posOf(a.args[1])
	}
	return sdk, nil
}

// implPathProblem says what makes an implementation path invalid, or "".
func implPathProblem(path string) string {
	switch {
	case path == "":
		return "is empty"
	case strings.Contains(path, "://"):
		return "is a URL"
	case strings.Contains(path, `\`):
		return `uses '\' (separate with '/')`
	case strings.HasPrefix(path, "/") || len(path) > 1 && path[1] == ':':
		return "is absolute"
	}
	return ""
}

// implPathError is the INVALID_IMPL_PATH error for an @sdk path argument.
func implPathError(arg token.Token) *ParseError {
	return annotationError(arg, CodeInvalidImplPath, fmt.Sprintf("@sdk path %q %s: name the worker's entry file relative to the module root (the directory of twf.mod), else to this file's directory", arg.Literal, implPathProblem(arg.Literal)))
}

// annotationError is a coded parse error at tok.
func annotationError(tok token.Token, code, msg string) *ParseError {
	return &ParseError{Msg: msg, Line: tok.Line, Column: tok.Column, code: code}
}

// soft reports an error that leaves the parse intact: collecting errors, it
// is recorded and parsing goes on; parsing strictly, it is returned.
func (p *Parser) soft(err error) error {
	pe, ok := err.(*ParseError)
	if !p.collecting || !ok {
		return err
	}
	p.addError(pe)
	return nil
}
