package parser

import (
	"fmt"
	"slices"
	"sort"
	"strings"

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

// Parser is a recursive descent parser for .twf files.
type Parser struct {
	lex     *lexer.Lexer
	src     string // the lexer's input, which token offsets index
	current token.Token
	peek    token.Token
	prev    token.TokenType // the type of the token before current
	depth   int             // INDENTs minus DEDENTs before current
	elseAt  int             // the offset of the last `else` an if consumed

	body ast.BodyContext // what the body being parsed runs in

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
		token.ACTIVITY:  parseActivityCall,
		token.WORKFLOW:  parseWorkflowCall,
		token.SIGNAL:    parseSignalSendStmt,
		token.ID_SCHEME: parseMisplacedIDScheme,
		token.DETACH:    parseWorkflowCallOrNexus,
		token.NEXUS:     parseNexusCall,
		token.AWAIT:     parseAwaitStmt, // handles both single await and await blocks
		token.PROMISE:   parsePromiseStmt,
		token.SET:       parseSetStmt,
		token.UNSET:     parseUnsetStmt,
		token.SWITCH:    parseSwitchBlock,
		token.IF:        parseIfStmt,
		token.FOR:       parseForStmt,
		token.CLOSE:     parseCloseStmt,
		token.RETURN:    parseReturnStmt,
		token.BREAK:     parseBreakStmt,
		token.CONTINUE:  parseContinueStmt,
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
	token.WORKFLOW:  true,
	token.ACTIVITY:  true,
	token.SIGNAL:    true,
	token.QUERY:     true,
	token.UPDATE:    true,
	token.DETACH:    true,
	token.NEXUS:     true,
	token.SYNC:      true,
	token.ASYNC:     true,
	token.PROMISE:   true,
	token.CONDITION: true,
	token.SET:       true,
	token.UNSET:     true,
	token.STATE:     true,
	token.TIMER:     true,
	token.AWAIT:     true,
	token.ALL:       true,
	token.ONE:       true,
	token.CLOSE:     true,
}

// syncBodyRejects are the workflow keywords a sync nexus operation body
// rejects: its handler runs as a Temporal client, with no workflow context, so
// it holds only client forms — a workflow start, a signal send, close — and
// control flow.
var syncBodyRejects = map[token.TokenType]bool{
	token.ACTIVITY:  true,
	token.NEXUS:     true,
	token.AWAIT:     true,
	token.TIMER:     true,
	token.PROMISE:   true,
	token.CONDITION: true,
	token.SET:       true,
	token.UNSET:     true,
	token.STATE:     true,
}

// ParseFile parses a .twf source string into an AST File. It stops at the
// first error. A structural lexer error at or before the parser's error is
// reported in its place: bad indentation misleads the parser, so the error it
// causes there would hide the cause.
func ParseFile(input string) (*ast.File, error) {
	input = strings.TrimPrefix(input, "\ufeff") // a leading BOM is not text
	p := &Parser{lex: lexer.New(input), src: input}
	file, err := p.parseFile()
	if pe, ok := err.(*ParseError); ok && len(p.lexErrors) > 0 {
		if le := p.lexErrors[0]; le.Line < pe.Line || le.Line == pe.Line && le.Column <= pe.Column {
			return nil, le
		}
	}
	return file, err
}

// parseFile is ParseFile's strict parse.
func (p *Parser) parseFile() (*ast.File, error) {
	p.advance() // fill current
	p.advance() // fill peek

	file := &ast.File{}
	sawClause := false // a package clause is recognized only as the first clause
	sawDef := false    // imports come before definitions

	for p.current.Type != token.EOF {
		first := !sawClause
		switch p.current.Type {
		case token.NEWLINE, token.COMMENT, token.INDENT, token.DEDENT:
		default:
			sawClause = true
		}
		switch {
		case p.current.Type == token.NEWLINE:
			p.advance()
			continue
		case p.current.Type == token.COMMENT:
			p.advance()
			continue
		case p.current.Type == token.PACKAGE:
			if err := p.parsePackageClause(file, first); err != nil {
				return nil, err
			}
		case p.current.Type == token.IMPORT:
			imp, err := p.parseImportDecl()
			if err != nil {
				return nil, err
			}
			if sawDef {
				return nil, misplacedImport(imp)
			}
			file.Imports = append(file.Imports, imp)
		case p.current.Type == token.AT:
			def, err := p.parseAnnotated()
			if err != nil {
				return nil, err
			}
			if def != nil {
				sawDef = true
				file.Definitions = append(file.Definitions, def)
			}
		default:
			parser, ok := topLevelParsers[p.current.Type]
			if !ok {
				return nil, p.errorf("unexpected token %s at top level", p.current.Type)
			}
			sawDef = true
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
	input = strings.TrimPrefix(input, "\ufeff") // a leading BOM is not text
	l := lexer.New(input)
	p := &Parser{lex: l, src: input, collecting: true}
	p.advance() // fill current
	p.advance() // fill peek

	file := &ast.File{}
	sawClause := false // a package clause is recognized only as the first clause
	sawDef := false    // imports come before definitions

	for p.current.Type != token.EOF {
		start := p.current
		first := !sawClause
		switch p.current.Type {
		case token.NEWLINE, token.COMMENT, token.INDENT, token.DEDENT:
		default:
			sawClause = true
		}
		switch {
		case p.current.Type == token.NEWLINE:
			p.advance()
			continue
		case p.current.Type == token.COMMENT:
			p.advance()
			continue
		case p.current.Type == token.PACKAGE:
			// The clause consumes its own line, so no top-level recovery: that
			// would skip the import lines after it.
			if err := p.parsePackageClause(file, first); err != nil {
				if pe, ok := err.(*ParseError); ok {
					p.addError(pe)
				}
			}
			continue
		case p.current.Type == token.IMPORT:
			imp, err := p.parseImportDecl()
			if err != nil {
				if pe, ok := err.(*ParseError); ok {
					p.addError(pe)
				}
				p.recoverTopLevel(start)
				continue
			}
			if sawDef {
				// Still bound, so references through it do not cascade.
				p.addError(misplacedImport(imp))
			}
			file.Imports = append(file.Imports, imp)
			continue
		case p.current.Type == token.AT:
			def, err := p.parseAnnotated()
			if err != nil {
				if pe, ok := err.(*ParseError); ok {
					p.addError(pe)
				}
				p.recoverTopLevel(start)
				continue
			}
			if def != nil {
				sawDef = true
				file.Definitions = append(file.Definitions, def)
			}
			continue
		default:
			parser, ok := topLevelParsers[p.current.Type]
			if !ok {
				p.addError(p.errorf("unexpected token %s at top level", p.current.Type).(*ParseError))
				p.recoverTopLevel(start)
				continue
			}
			sawDef = true
			def, err := parser(p)
			if err != nil {
				if pe, ok := err.(*ParseError); ok {
					p.addError(pe)
				}
				p.recoverTopLevel(start)
				continue
			}
			file.Definitions = append(file.Definitions, def)
		}
	}

	// Merge structural lexer errors (collected during read-ahead) with the
	// parser errors, ordered by source position so diagnostics read top-to-bottom.
	// At one position a lexer error comes first, since it causes the parser's.
	// Lexer errors carry CodeLexical, which keeps the runaway-truncation bug from
	// hiding behind a clean `twf check --lenient` exit code.
	all := append(slices.Clone(p.lexErrors), p.errors...)
	sort.SliceStable(all, func(i, j int) bool {
		if all[i].Line != all[j].Line {
			return all[i].Line < all[j].Line
		}
		return all[i].Column < all[j].Column
	})

	return file, all
}

// parseBody parses statements inside an indented block (after INDENT, until
// DEDENT). Collecting errors, a failed statement is reported and left out, and
// the rest of the body still parses (see recoverLine).
func (p *Parser) parseBody() ([]ast.Statement, error) {
	depth := p.depth
	var stmts []ast.Statement
	var last ast.Statement // the statement any indented line sits under
	for p.current.Type != token.DEDENT && p.current.Type != token.EOF {
		if p.current.Type == token.NEWLINE {
			p.advance()
			continue
		}
		if p.current.Type == token.INDENT {
			comments, err := p.overIndent(optionsUnder(last))
			if err != nil {
				return nil, err
			}
			stmts = append(stmts, comments...)
			continue
		}
		start := p.current
		stmt, err := p.parseStatement()
		if err != nil {
			if err := p.recoverLine(err, start, depth); err != nil {
				return nil, err
			}
			if p.depth < depth {
				return stmts, nil // the failed statement consumed the body's DEDENT
			}
			continue
		}
		stmts = append(stmts, stmt)
		if _, ok := stmt.(*ast.Comment); !ok {
			last = stmt
		}
	}

	if p.current.Type == token.DEDENT {
		p.advance()
	}

	return stmts, nil
}

// optionsUnder words the error for an options: line indented under stmt, which
// takes none (a promise-bound or awaited start uses the callee's defaults). It is
// nil (the default wording) for any other statement.
func optionsUnder(stmt ast.Statement) func(token.Token) string {
	var what string
	switch stmt.(type) {
	case *ast.PromiseStmt:
		what = "a promise"
	case *ast.AwaitStmt:
		what = "an await"
	default:
		return nil
	}
	return func(tok token.Token) string {
		if tok.Type == token.OPTIONS {
			return what + " takes no options:"
		}
		return unexpectedIndent
	}
}

// parseStatement parses one statement of a body in the body's context.
func (p *Parser) parseStatement() (ast.Statement, error) {
	switch p.current.Type {
	case token.COMMENT:
		return p.parseComment(), nil
	case token.AT:
		return nil, p.bodyAnnotation()
	}

	var parseFn stmtParser
	var ok bool
	switch p.body {
	case ast.BodyWorkflow, ast.BodySignalHandler, ast.BodyUpdateHandler, ast.BodyNexusSync:
		if p.body == ast.BodyNexusSync {
			if syncBodyRejects[p.current.Type] {
				return nil, p.errorf("%s is not allowed in a sync nexus operation body", p.current.Literal)
			}
			if p.current.Type == token.DETACH && p.peek.Type == token.NEXUS {
				return nil, p.errorf("detach nexus is not allowed in a sync nexus operation body")
			}
		}
		parseFn, ok = workflowStmtParsers[p.current.Type]
	case ast.BodyQueryHandler, ast.BodyActivity:
		if p.current.Type == token.ID_SCHEME {
			return nil, p.misplacedIDScheme()
		}
		// Check for temporal keywords that aren't allowed.
		if temporalKeywords[p.current.Type] {
			return nil, p.errorf("%s is not allowed in activity body", p.current.Literal)
		}
		parseFn, ok = activityStmtParsers[p.current.Type]
	}

	if !ok {
		// In a workflow context a keyword leads no raw statement: one with
		// no parser here is misplaced, not an expression to pass through.
		// An activity body is free-form pseudocode.
		if p.body != ast.BodyActivity && p.current.Type.IsKeyword() {
			return nil, p.misplacedKeyword()
		}
		return parseRawStmt(p)
	}

	stmt, err := parseFn(p)
	if err != nil {
		return nil, err
	}
	if err := p.checkMisplacedAddress(stmt); err != nil {
		return nil, err
	}
	return stmt, nil
}
