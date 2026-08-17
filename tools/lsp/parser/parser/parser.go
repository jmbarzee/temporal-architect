package parser

import (
	"fmt"
	"sort"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/lexer"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/token"
)

// Symbolic parse-error codes. Consumers should rely on the diagnostic's
// kind+code+message and treat new codes as a non-breaking addition.
const (
	// CodeSyntax is the default code for uncategorized parse failures.
	CodeSyntax = "SYNTAX"
	// CodeLexical marks a structural lexical error surfaced from the lexer's
	// token.ILLEGAL stream: an unterminated string, an unterminated argument
	// list, or inconsistent indentation. The input could not be tokenized, so
	// the parse is fundamentally broken — unlike a resolve/validate error over a
	// well-formed token stream. Tooling uses this to refuse a clean `--lenient`
	// exit: a tokenization failure is never a "lenient" condition.
	CodeLexical = "LEX"
)

// ParseError represents a parse error with position info.
type ParseError struct {
	Msg    string
	Line   int
	Column int
	code   string // symbolic code; empty means CodeSyntax
}

func (e *ParseError) Error() string {
	return fmt.Sprintf("parse error at %d:%d: %s", e.Line, e.Column, e.Msg)
}

// Code returns a stable, symbolic error code for downstream tooling.
//
// Most parse errors are still uncategorized and share CodeSyntax. Structural
// lexical errors carry CodeLexical (see recordLexError). Finer categorization of
// the remaining syntax failures (e.g. UNEXPECTED_TOKEN) is a future refinement.
func (e *ParseError) Code() string {
	if e.code != "" {
		return e.code
	}
	return CodeSyntax
}

type defParser func(p *Parser) (ast.Definition, error)
type stmtParser func(p *Parser) (ast.Statement, error)

// bodyContext tracks what kind of body the parser is currently inside.
type bodyContext int

const (
	bodyNone     bodyContext = iota
	bodyWorkflow            // workflow, signal handler, update handler, nexus sync op
	bodyActivity            // activity, query handler
)

// Parser is a recursive descent parser for .twf files.
type Parser struct {
	lex     *lexer.Lexer
	current token.Token
	peek    token.Token

	bodyCtx bodyContext

	collecting bool          // true when collecting errors instead of bailing
	errors     []*ParseError // accumulated errors in collecting mode

	// lexErrors holds structural lexer errors (token.ILLEGAL) encountered while
	// reading ahead. They are collected centrally in advance() rather than at
	// each consumption site so an ILLEGAL token — which can surface anywhere,
	// e.g. an unterminated string or argument list mid-body — is always reported
	// exactly once, with the lexer's message and opening-delimiter position.
	lexErrors []*ParseError
}

// Registration maps for keyword dispatch.
var (
	topLevelParsers     map[token.TokenType]defParser
	workflowStmtParsers map[token.TokenType]stmtParser
	activityStmtParsers map[token.TokenType]stmtParser
)

func init() {
	topLevelParsers = map[token.TokenType]defParser{
		token.WORKFLOW:  parseWorkflowDef,
		token.ACTIVITY:  parseActivityDef,
		token.WORKER:    parseWorkerDef,
		token.NAMESPACE: parseNamespaceDef,
		token.NEXUS:     parseNexusTopLevel,
	}

	workflowStmtParsers = map[token.TokenType]stmtParser{
		token.ACTIVITY:        parseActivityCall,
		token.WORKFLOW:        parseWorkflowCall,
		token.SIGNAL:          parseSignalSendStmt,
		token.DETACH:          parseWorkflowCallOrNexus,
		token.NEXUS:           parseNexusCall,
		token.AWAIT:           parseAwaitStmt, // handles both single await and await blocks
		token.PROMISE:         parsePromiseStmt,
		token.SET:             parseSetStmt,
		token.UNSET:           parseUnsetStmt,
		token.SWITCH:          parseSwitchBlock,
		token.IF:              parseIfStmt,
		token.FOR:             parseForStmt,
		token.CLOSE:           parseCloseStmt,
		token.RETURN:          parseReturnStmt,
		token.BREAK:           parseBreakStmt,
		token.CONTINUE:        parseContinueStmt,
	}

	activityStmtParsers = map[token.TokenType]stmtParser{
		token.SWITCH:   parseSwitchBlock,
		token.IF:       parseIfStmt,
		token.FOR:      parseForStmt,
		token.RETURN:   parseReturnStmt,
		token.BREAK:    parseBreakStmt,
		token.CONTINUE: parseContinueStmt,
	}
}

// temporalKeywords are keywords that are not allowed in activity bodies.
var temporalKeywords = map[token.TokenType]bool{
	token.WORKFLOW:        true,
	token.ACTIVITY:        true,
	token.SIGNAL:          true,
	token.QUERY:           true,
	token.UPDATE:          true,
	token.DETACH:          true,
	token.NEXUS:           true,
	token.SYNC:            true,
	token.ASYNC:           true,
	token.PROMISE:         true,
	token.CONDITION:       true,
	token.SET:             true,
	token.UNSET:           true,
	token.STATE:           true,
	token.TIMER:           true,
	token.AWAIT:           true,
	token.ALL:             true,
	token.ONE:             true,
	token.CLOSE:           true,
}

// ParseFile parses a .twf source string into an AST File.
func ParseFile(input string) (*ast.File, error) {
	l := lexer.New(input)
	p := &Parser{lex: l}
	p.advance() // fill current
	p.advance() // fill peek

	file := &ast.File{}

	for p.current.Type != token.EOF {
		switch {
		case p.current.Type == token.NEWLINE:
			p.advance()
			continue
		case p.current.Type == token.COMMENT:
			p.advance()
			continue
		case p.current.Type == token.PACKAGE:
			if err := p.parsePackageClause(file); err != nil {
				return nil, err
			}
		case p.current.Type == token.IMPORT:
			imp, err := p.parseImportDecl()
			if err != nil {
				return nil, err
			}
			file.Imports = append(file.Imports, imp)
		default:
			parser, ok := topLevelParsers[p.current.Type]
			if !ok {
				return nil, p.errorf("unexpected token %s at top level", p.current.Type)
			}
			def, err := parser(p)
			if err != nil {
				return nil, err
			}
			file.Definitions = append(file.Definitions, def)
		}
	}

	// Structural lexer errors are recorded during token read-ahead and skipped
	// so parsing can continue. If one occurred without a parser error stopping
	// us first, surface it here so it is never silently dropped.
	if len(p.lexErrors) > 0 {
		return nil, p.lexErrors[0]
	}

	return file, nil
}

// ParseFileAll parses a .twf source string, collecting as many errors as
// possible instead of stopping at the first one. It returns a partial AST
// (which may have successfully parsed definitions) alongside all parse errors.
func ParseFileAll(input string) (*ast.File, []*ParseError) {
	l := lexer.New(input)
	p := &Parser{lex: l, collecting: true}
	p.advance() // fill current
	p.advance() // fill peek

	file := &ast.File{}

	for p.current.Type != token.EOF {
		switch {
		case p.current.Type == token.NEWLINE:
			p.advance()
			continue
		case p.current.Type == token.COMMENT:
			p.advance()
			continue
		case p.current.Type == token.PACKAGE:
			if err := p.parsePackageClause(file); err != nil {
				if pe, ok := err.(*ParseError); ok {
					p.addError(pe)
				}
				p.recoverTopLevel()
			}
			continue
		case p.current.Type == token.IMPORT:
			imp, err := p.parseImportDecl()
			if err != nil {
				if pe, ok := err.(*ParseError); ok {
					p.addError(pe)
				}
				p.recoverTopLevel()
				continue
			}
			file.Imports = append(file.Imports, imp)
			continue
		default:
			parser, ok := topLevelParsers[p.current.Type]
			if !ok {
				p.addError(p.errorf("unexpected token %s at top level", p.current.Type).(*ParseError))
				p.recoverTopLevel()
				continue
			}
			def, err := parser(p)
			if err != nil {
				if pe, ok := err.(*ParseError); ok {
					p.addError(pe)
				}
				p.recoverTopLevel()
				continue
			}
			file.Definitions = append(file.Definitions, def)
		}
	}

	// Merge structural lexer errors (collected during read-ahead) with the
	// parser errors, ordered by source position so diagnostics read top-to-bottom.
	// Lexer errors carry CodeLexical, which keeps the runaway-truncation bug from
	// hiding behind a clean `twf check --lenient` exit code.
	all := append(p.errors, p.lexErrors...)
	sort.SliceStable(all, func(i, j int) bool {
		if all[i].Line != all[j].Line {
			return all[i].Line < all[j].Line
		}
		return all[i].Column < all[j].Column
	})

	return file, all
}

// parseBody parses statements inside an indented block (after INDENT, until DEDENT).
func (p *Parser) parseBody() ([]ast.Statement, error) {
	var stmts []ast.Statement
	for p.current.Type != token.DEDENT && p.current.Type != token.EOF {
		if p.current.Type == token.NEWLINE {
			p.advance()
			continue
		}
		if p.current.Type == token.COMMENT {
			stmts = append(stmts, &ast.Comment{
				Pos:  ast.Pos{Line: p.current.Line, Column: p.current.Column},
				Text: p.current.Literal,
			})
			p.advance()
			if p.current.Type == token.NEWLINE {
				p.advance()
			}
			continue
		}

		var parseFn stmtParser
		var ok bool
		switch p.bodyCtx {
		case bodyWorkflow:
			parseFn, ok = workflowStmtParsers[p.current.Type]
		case bodyActivity:
			// Check for temporal keywords that aren't allowed.
			if temporalKeywords[p.current.Type] {
				return nil, p.errorf("%s is not allowed in activity body", p.current.Literal)
			}
			parseFn, ok = activityStmtParsers[p.current.Type]
		}

		if !ok {
			// Fallback to raw statement.
			stmt, err := parseRawStmt(p)
			if err != nil {
				return nil, err
			}
			stmts = append(stmts, stmt)
			continue
		}

		stmt, err := parseFn(p)
		if err != nil {
			return nil, err
		}
		stmts = append(stmts, stmt)
	}

	if p.current.Type == token.DEDENT {
		p.advance()
	}

	return stmts, nil
}
