package parser

import (
	"maps"
	"strings"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/token"
)

// OptionsContext identifies the parent context for schema validation.
type OptionsContext int

const (
	OptionsContextActivity OptionsContext = iota
	// A workflow start's `options:` follows the Temporal operation the start
	// becomes, which its enclosing body decides: a child start (workflow body,
	// signal or update handler) is a StartChildWorkflowExecution command; a
	// client start (sync nexus operation body) goes through the client start API.
	OptionsContextChildStart
	OptionsContextClientStart
	OptionsContextWorker
	OptionsContextNexusCall
	OptionsContextEndpoint
	OptionsContextSignalHandler
	OptionsContextUpdateHandler
	OptionsContextQueryHandler
	// Definition-level `default_options:` blocks. They reuse the call-option
	// value grammar but partition the allowed keys by definition kind: a key
	// describing the operation is defaultable, a key describing one particular
	// invocation is call-site-only (see optionMisplaced).
	OptionsContextActivityDefaults
	OptionsContextWorkflowDefaults
)

// optionSchema describes the expected value type for an option key.
// "nested" means the key introduces a nested block (e.g. retry_policy:).
type optionSchema struct {
	valueType string // "string", "duration", "number", "bool", "enum", "list", "nested"
	nested    map[string]*optionSchema
	allowed   []string // allowed values for enum type
}

var retryPolicySchema = map[string]*optionSchema{
	"initial_interval":          {valueType: "duration"},
	"backoff_coefficient":       {valueType: "number"},
	"maximum_interval":          {valueType: "duration"},
	"maximum_attempts":          {valueType: "number"},
	"non_retryable_error_types": {valueType: "list"},
}

var prioritySchema = map[string]*optionSchema{
	"priority_key":    {valueType: "number"},
	"fairness_key":    {valueType: "string"},
	"fairness_weight": {valueType: "number"},
}

var activityOptionSchema = map[string]*optionSchema{
	"task_queue":                {valueType: "string"},
	"schedule_to_close_timeout": {valueType: "duration"},
	"schedule_to_start_timeout": {valueType: "duration"},
	"start_to_close_timeout":    {valueType: "duration"},
	"heartbeat_timeout":         {valueType: "duration"},
	"request_eager_execution":   {valueType: "bool"},
	"retry_policy":              {valueType: "nested", nested: retryPolicySchema},
	"priority":                  {valueType: "nested", nested: prioritySchema},
}

// versioningStrategies are the worker-versioning strategies expressed at design
// altitude. Intent, not numeric tuning: `build_id` uses an underscore because
// DSL enum values are bare idents and cannot contain hyphens.
var versioningStrategies = []string{"none", "build_id", "deployment"}

// workerOptionSchema is the SDK-union of worker options (excluding per-language
// one-offs). Keys are accepted permissively with no per-language validation —
// an option missing from one SDK does not gate its inclusion here.
var workerOptionSchema = map[string]*optionSchema{
	"task_queue":                               {valueType: "string"},
	"worker_activity_rate_limit":               {valueType: "number"},
	"task_queue_activity_rate_limit":           {valueType: "number"},
	"worker_local_activity_rate_limit":         {valueType: "number"},
	"max_concurrent_activity_executions":       {valueType: "number"},
	"max_concurrent_workflow_task_executions":  {valueType: "number"},
	"max_concurrent_local_activity_executions": {valueType: "number"},
	"max_concurrent_nexus_task_executions":     {valueType: "number"},
	"max_concurrent_workflow_task_pollers":     {valueType: "number"},
	"max_concurrent_activity_task_pollers":     {valueType: "number"},
	"max_concurrent_nexus_task_pollers":        {valueType: "number"},
	"max_cached_workflows":                     {valueType: "number"},
	"sticky_schedule_to_start_timeout":         {valueType: "duration"},
	"heartbeat_throttle_interval":              {valueType: "duration"},
	"worker_identity":                          {valueType: "string"},
	"worker_shutdown_timeout":                  {valueType: "duration"},
	"local_activity_only_mode":                 {valueType: "bool"},
	"enable_sessions":                          {valueType: "bool"},
	"max_concurrent_session_executions":        {valueType: "number"},
	"versioning":                               {valueType: "enum", allowed: versioningStrategies},
}

// workflowStartSchema is the key set every workflow start shares. The
// deprecated TERMINATE_IF_RUNNING reuse value is absent: its replacement is
// ALLOW_DUPLICATE plus the TERMINATE_EXISTING conflict policy.
var workflowStartSchema = map[string]*optionSchema{
	"task_queue":                 {valueType: "string"},
	"workflow_execution_timeout": {valueType: "duration"},
	"workflow_run_timeout":       {valueType: "duration"},
	"workflow_task_timeout":      {valueType: "duration"},
	"workflow_id_reuse_policy":   {valueType: "enum", allowed: []string{"ALLOW_DUPLICATE", "ALLOW_DUPLICATE_FAILED_ONLY", "REJECT_DUPLICATE"}},
	"retry_policy":               {valueType: "nested", nested: retryPolicySchema},
	"priority":                   {valueType: "nested", nested: prioritySchema},
}

var parentClosePolicySchema = &optionSchema{valueType: "enum", allowed: []string{"TERMINATE", "ABANDON", "REQUEST_CANCEL"}}
var conflictPolicySchema = &optionSchema{valueType: "enum", allowed: []string{"FAIL", "USE_EXISTING", "TERMINATE_EXISTING"}}

// A child start has a parent, so it takes parent_close_policy, and carries no
// conflict policy. A client start has no parent and carries both ID policies.
var childStartOptionSchema = schemaWith(workflowStartSchema, "parent_close_policy", parentClosePolicySchema)
var clientStartOptionSchema = schemaWith(workflowStartSchema, "workflow_id_conflict_policy", conflictPolicySchema)

// Definition-level default-option schemas. A `default_options:` block declares
// per-definition call-option defaults, so it reuses the call-option schemas but
// partitions the keys: a key describing the operation is defaultable; a key
// describing one particular invocation stays call-site-only.
//
//   - Activity: every activity call option is defaultable — no keys excluded.
//   - Workflow: every client-start option. A start uses the defaults its kind
//     can carry, so a child start ignores the conflict policy. `parent_close_policy`
//     is relational (it describes one parent↔child bond, not the workflow type)
//     and so stays call-site-only.
//
// Schemas are never mutated after init, so contexts may share one map.
var activityDefaultOptionSchema = activityOptionSchema
var workflowDefaultOptionSchema = clientStartOptionSchema

// CodeOptionMisplaced marks a known option key written where its context
// cannot carry it.
const CodeOptionMisplaced = "OPTION_MISPLACED"

// misplacedOption is the targeted error for a key a context rejects, in place
// of the generic unknown-key error.
type misplacedOption struct {
	code string
	msg  string
}

var workflowIDAtStart = misplacedOption{CodeIDAtStart, "a workflow start takes no workflow_id; the ID derives from the started type's id_scheme"}

// optionMisplaced maps a context to the keys it rejects with a targeted error.
var optionMisplaced = map[OptionsContext]map[string]misplacedOption{
	OptionsContextChildStart: {
		"workflow_id":                 workflowIDAtStart,
		"workflow_id_conflict_policy": {CodeOptionMisplaced, "a child start takes no workflow_id_conflict_policy and fails on a running instance with the same ID; to reach a running instance, signal it by its scheme, or start it from a client start"},
	},
	OptionsContextClientStart: {
		"workflow_id":         workflowIDAtStart,
		"parent_close_policy": {CodeOptionMisplaced, "a start in a sync nexus operation has no parent workflow, so it takes no parent_close_policy"},
	},
	OptionsContextWorkflowDefaults: {
		"workflow_id":         {CodeIDAtStart, "default_options takes no workflow_id; the ID derives from the workflow's id_scheme"},
		"parent_close_policy": {CodeOptionMisplaced, "call-site-only option key not allowed in default_options: parent_close_policy"},
	},
}

// schemaWith returns a shallow copy of base with key added.
func schemaWith(base map[string]*optionSchema, key string, sch *optionSchema) map[string]*optionSchema {
	out := maps.Clone(base)
	out[key] = sch
	return out
}

var nexusCallOptionSchema = map[string]*optionSchema{
	"schedule_to_close_timeout": {valueType: "duration"},
	"retry_policy":              {valueType: "nested", nested: retryPolicySchema},
	"priority":                  {valueType: "nested", nested: prioritySchema},
}

var endpointOptionSchema = map[string]*optionSchema{
	"task_queue": {valueType: "string"},
}

// unfinishedPolicyValues are the SDK HandlerUnfinishedPolicy enum, lowercased.
var unfinishedPolicyValues = []string{"abandon", "warn_and_abandon"}

// Handler-options schemas. The three handler kinds share `description`;
// signal and update additionally admit `unfinished_policy`. Queries do not
// (they are synchronous and read-only, so they cannot be "unfinished").
var signalHandlerOptionSchema = map[string]*optionSchema{
	"unfinished_policy": {valueType: "enum", allowed: unfinishedPolicyValues},
	"description":       {valueType: "string"},
}

var updateHandlerOptionSchema = map[string]*optionSchema{
	"unfinished_policy": {valueType: "enum", allowed: unfinishedPolicyValues},
	"description":       {valueType: "string"},
}

var queryHandlerOptionSchema = map[string]*optionSchema{
	"description": {valueType: "string"},
}

var optionSchemas = map[OptionsContext]map[string]*optionSchema{
	OptionsContextActivity:         activityOptionSchema,
	OptionsContextChildStart:       childStartOptionSchema,
	OptionsContextClientStart:      clientStartOptionSchema,
	OptionsContextWorker:           workerOptionSchema,
	OptionsContextNexusCall:        nexusCallOptionSchema,
	OptionsContextEndpoint:         endpointOptionSchema,
	OptionsContextSignalHandler:    signalHandlerOptionSchema,
	OptionsContextUpdateHandler:    updateHandlerOptionSchema,
	OptionsContextQueryHandler:     queryHandlerOptionSchema,
	OptionsContextActivityDefaults: activityDefaultOptionSchema,
	OptionsContextWorkflowDefaults: workflowDefaultOptionSchema,
}

// workflowStartContext is the options context of a workflow start at the
// current position: a client start inside a sync nexus operation body, a child
// start anywhere else.
func (p *Parser) workflowStartContext() OptionsContext {
	if p.inSyncNexus {
		return OptionsContextClientStart
	}
	return OptionsContextChildStart
}

func schemaForContext(ctx OptionsContext) map[string]*optionSchema {
	return optionSchemas[ctx]
}

// parseOptionsBlock parses the contents of an options block: COLON NEWLINE INDENT entries DEDENT.
// The OPTIONS keyword has already been consumed. Expects current token = COLON.
func (p *Parser) parseOptionsBlock(ctx OptionsContext) (*ast.OptionsBlock, error) {
	pos := ast.Pos{Line: p.current.Line, Column: p.current.Column}

	if _, err := p.expect(token.COLON); err != nil {
		return nil, err
	}
	if p.current.Type == token.NEWLINE {
		p.advance()
	}
	if _, err := p.expect(token.INDENT); err != nil {
		return nil, err
	}

	schema := schemaForContext(ctx)
	entries, err := p.parseOptionEntries(schema, optionMisplaced[ctx])
	if err != nil {
		return nil, err
	}

	if _, err := p.expect(token.DEDENT); err != nil {
		return nil, err
	}

	return &ast.OptionsBlock{
		Pos:     pos,
		Entries: entries,
	}, nil
}

// parseOptionEntries parses key-value pairs until DEDENT is encountered.
// misplaced names the keys the context rejects with a targeted error; it is
// passed as nil to nested blocks (a nested key is validated against its own
// nested schema only).
func (p *Parser) parseOptionEntries(schema map[string]*optionSchema, misplaced map[string]misplacedOption) ([]*ast.OptionEntry, error) {
	var entries []*ast.OptionEntry

	for p.current.Type != token.DEDENT && p.current.Type != token.EOF {
		// Comments may appear anywhere (spec §8): on their own line before, between,
		// or after entries, or trailing a value on the same line.
		if p.current.Type == token.NEWLINE || p.current.Type == token.COMMENT {
			p.advance()
			continue
		}

		entry, err := p.parseOptionEntry(schema, misplaced)
		if err != nil {
			return nil, err
		}
		entries = append(entries, entry)
	}

	return entries, nil
}

// parseOptionEntry parses a single option entry: IDENT COLON (value | NEWLINE INDENT nested DEDENT).
func (p *Parser) parseOptionEntry(schema map[string]*optionSchema, misplaced map[string]misplacedOption) (*ast.OptionEntry, error) {
	pos := ast.Pos{Line: p.current.Line, Column: p.current.Column}

	var key string
	switch p.current.Type {
	case token.IDENT:
		key = p.current.Literal
		p.advance()
	case token.TASK_QUEUE:
		key = "task_queue"
		p.advance()
	default:
		return nil, p.errorf("expected option key, got %s", p.current.Type)
	}

	// Look up schema for this key.
	var sch *optionSchema
	if schema != nil {
		var ok bool
		sch, ok = schema[key]
		if !ok {
			if m, ok := misplaced[key]; ok {
				return nil, &ParseError{
					Msg:    m.msg,
					Line:   pos.Line,
					Column: pos.Column,
					code:   m.code,
				}
			}
			return nil, &ParseError{
				Msg:    "unknown option key: " + key,
				Line:   pos.Line,
				Column: pos.Column,
			}
		}
	}

	if _, err := p.expect(token.COLON); err != nil {
		return nil, err
	}

	entry := &ast.OptionEntry{
		Pos: pos,
		Key: key,
	}

	// Branch: NEWLINE followed by INDENT means nested block, otherwise flat value.
	if p.current.Type == token.NEWLINE && p.peek.Type == token.INDENT {
		// Nested block.
		if sch != nil && sch.valueType != "nested" {
			return nil, &ParseError{
				Msg:    "option " + key + " expects a value, not a nested block",
				Line:   p.current.Line,
				Column: p.current.Column,
			}
		}

		p.advance() // consume NEWLINE
		p.advance() // consume INDENT

		var nestedSchema map[string]*optionSchema
		if sch != nil {
			nestedSchema = sch.nested
		}

		nested, err := p.parseOptionEntries(nestedSchema, nil)
		if err != nil {
			return nil, err
		}
		entry.Nested = nested

		if _, err := p.expect(token.DEDENT); err != nil {
			return nil, err
		}
	} else {
		// Flat key: value.
		if sch != nil && sch.valueType == "nested" {
			return nil, &ParseError{
				Msg:    "option " + key + " expects a nested block, not a value",
				Line:   p.current.Line,
				Column: p.current.Column,
			}
		}

		value, values, valueType, err := p.parseOptionValue(sch)
		if err != nil {
			return nil, err
		}
		entry.Value = value
		entry.Values = values
		entry.ValueType = valueType
	}

	// Consume trailing newline if present.
	if p.current.Type == token.NEWLINE {
		p.advance()
	}

	return entry, nil
}

// parseOptionValue parses a value after COLON. Returns (scalar value, list
// values, value type). For scalar types `values` is nil; for the "list" type
// `value` is empty and `values` holds the element literals — the two are
// mutually exclusive.
func (p *Parser) parseOptionValue(sch *optionSchema) (string, []string, string, error) {
	// Errors anchor at the value token, captured before it is consumed.
	pos := ast.Pos{Line: p.current.Line, Column: p.current.Column}
	switch p.current.Type {
	case token.STRING:
		val := p.current.Literal
		p.advance()
		if sch != nil && sch.valueType != "string" {
			return "", nil, "", &ParseError{
				Msg:    "expected " + sch.valueType + ", got string",
				Line:   pos.Line,
				Column: pos.Column,
			}
		}
		return val, nil, "string", nil

	case token.DURATION:
		val := p.current.Literal
		p.advance()
		if sch != nil && sch.valueType != "duration" {
			return "", nil, "", &ParseError{
				Msg:    "expected " + sch.valueType + ", got duration",
				Line:   pos.Line,
				Column: pos.Column,
			}
		}
		return val, nil, "duration", nil

	case token.NUMBER:
		val := p.current.Literal
		p.advance()
		if sch != nil && sch.valueType != "number" {
			return "", nil, "", &ParseError{
				Msg:    "expected " + sch.valueType + ", got number",
				Line:   pos.Line,
				Column: pos.Column,
			}
		}
		return val, nil, "number", nil

	case token.LBRACKET:
		// Bracketed inline list of strings. Parsed for any key; the schema
		// gate below decides acceptance, mirroring the scalar branches.
		values, err := p.parseListLiteral()
		if err != nil {
			return "", nil, "", err
		}
		if sch != nil && sch.valueType != "list" {
			return "", nil, "", &ParseError{
				Msg:    "expected " + sch.valueType + ", got list",
				Line:   pos.Line,
				Column: pos.Column,
			}
		}
		return "", values, "list", nil

	case token.IDENT:
		val := p.current.Literal
		p.advance()
		// Could be bool (true/false) or enum value.
		if val == "true" || val == "false" {
			if sch != nil && sch.valueType != "bool" {
				return "", nil, "", &ParseError{
					Msg:    "expected " + sch.valueType + ", got bool",
					Line:   pos.Line,
					Column: pos.Column,
				}
			}
			return val, nil, "bool", nil
		}
		// Enum value.
		if sch != nil && sch.valueType == "enum" {
			valid := false
			for _, a := range sch.allowed {
				if a == val {
					valid = true
					break
				}
			}
			if !valid {
				return "", nil, "", &ParseError{
					Msg:    "invalid value " + val + " for enum option (allowed: " + strings.Join(sch.allowed, ", ") + ")",
					Line:   pos.Line,
					Column: pos.Column,
				}
			}
			return val, nil, "enum", nil
		}
		// If no schema, treat as enum.
		return val, nil, "enum", nil

	default:
		return "", nil, "", p.errorf("expected value after colon, got %s", p.current.Type)
	}
}

// parseListLiteral parses a bracketed inline list of string elements:
//
//	'[' [ STRING (',' STRING)* ] ']'
//
// The current token must be LBRACKET. Syntax rules enforced: an empty list `[]`
// is allowed; elements are strings only (a bare ident, number, or duration is a
// parse error); no trailing comma; and the whole list is a single logical line
// (a NEWLINE before the closing `]` is a parse error). Returns a non-nil slice
// of the element literals (empty for `[]`).
func (p *Parser) parseListLiteral() ([]string, error) {
	p.advance() // consume '['

	values := []string{}
	if p.current.Type == token.RBRACKET {
		p.advance() // consume ']'
		return values, nil
	}

	for {
		if p.current.Type == token.NEWLINE {
			return nil, p.errorf("unexpected newline inside list literal (a list must be on a single line)")
		}
		if p.current.Type != token.STRING {
			return nil, p.errorf("expected string element in list, got %s", p.current.Type)
		}
		values = append(values, p.current.Literal)
		p.advance() // consume STRING

		switch p.current.Type {
		case token.COMMA:
			p.advance() // consume ','
			if p.current.Type == token.RBRACKET {
				return nil, p.errorf("unexpected trailing comma in list literal")
			}
		case token.RBRACKET:
			p.advance() // consume ']'
			return values, nil
		case token.NEWLINE:
			return nil, p.errorf("unexpected newline inside list literal (a list must be on a single line)")
		default:
			return nil, p.errorf("expected ',' or ']' in list literal, got %s", p.current.Type)
		}
	}
}
