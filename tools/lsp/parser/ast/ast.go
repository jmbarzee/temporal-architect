package ast

// Node is the base interface for all AST nodes.
type Node interface {
	NodeLine() int
	NodeColumn() int
}

// Definition is a top-level definition (workflow, activity, worker, or namespace).
type Definition interface {
	Node
	defNode()
}

// Statement is a statement inside a body.
type Statement interface {
	Node
	stmtNode()
}

// Pos holds source position information.
type Pos struct {
	Line   int
	Column int
}

func (p Pos) NodeLine() int   { return p.Line }
func (p Pos) NodeColumn() int { return p.Column }

// Ref is a named reference to another AST node, resolved after parsing.
//
// Package is an optional package qualifier written in a keyword-led call
// position (e.g. `activity billing.Charge(...)` records Package="billing").
// Empty means unqualified / same-package. In this slice the qualifier is only
// recorded — cross-package resolution is deferred (issue #109) — so an empty
// Package (every current file) behaves exactly as before.
type Ref[T any] struct {
	Pos
	Package  string
	Name     string
	Resolved T
}

// File represents a parsed .twf file.
//
// Package is the file's declared package name; empty means the implicit default
// package, which is elided from every key/ID/diagnostic so clause-less files
// (all files today) are unaffected. Imports records the file's import
// declarations verbatim; they are not resolved in this slice.
type File struct {
	Package     string
	Imports     []*ImportDecl
	Definitions []Definition
}

// ImportDecl is a single `import [alias] "path"` declaration at file scope.
// Path is the imported module path, carried verbatim (not enforced in this
// slice). Alias is the local name bound to the import; an empty Alias means the
// import is referenced by its leaf name.
//
// Package is a RUNTIME-ONLY stamp (issue #109): the envelope merge records the
// owning package of the file this import was declared in, so the resolver can
// group imports into per-package binding tables. It is never serialized (not in
// ast/json.go) — no wire-Schema change.
//
// SourceFile is likewise a RUNTIME-ONLY stamp (issue #136): the envelope/LSP
// merge records the base name of the file this import was declared in, so the
// resolver can attribute import warnings (UNRESOLVED_IMPORT / UNUSED_IMPORT) to
// the referencing file. Like Package it is NEVER serialized (no entry in
// ast/json.go) — no wire-Schema change.
type ImportDecl struct {
	Pos
	Path       string
	Alias      string
	Package    string
	SourceFile string
}

// ---------------------------------------------------------------------------
// Top-level definitions
// ---------------------------------------------------------------------------

// Package fields on the top-level definitions below are RUNTIME-ONLY stamps
// (issue #109): the envelope merge records each definition's owning package so
// the resolver and graph can key by (package, name) and encode the package
// inside a node's name element via graph.QualifiedName. They are NEVER
// serialized (the MarshalJSON methods in ast/json.go do not emit them), so
// there is no wire-Schema change and unpackaged output stays byte-identical.
// The empty string is the implicit default package. When a definition is
// resolved without going through the merge (e.g. a single-file parse), the
// stamp is empty and consumers fall back to File.Package.
//
// Packaged exposes that runtime package stamp so generic helpers can read it
// off a Ref's resolved target without a per-type switch.
type Packaged interface {
	PackageName() string
}

type WorkflowDef struct {
	Pos
	Name           string
	Params         string        // opaque content inside parens
	ReturnType     string        // opaque, optional
	IDScheme       *IDScheme     // optional; the first body element
	DefaultOptions *OptionsBlock // optional definition-level call-option defaults (after id_scheme:, before state:)
	State          *StateBlock
	Signals        []*SignalDecl
	Queries        []*QueryDecl
	Updates        []*UpdateDecl
	Body           []Statement
	SourceFile     string
	Package        string // runtime-only; see Packaged note above
}

func (*WorkflowDef) defNode()              {}
func (d *WorkflowDef) PackageName() string { return d.Package }

type ActivityDef struct {
	Pos
	Name           string
	Params         string
	ReturnType     string
	DefaultOptions *OptionsBlock // optional definition-level call-option defaults (head of body)
	Body           []Statement
	SourceFile     string
	Package        string // runtime-only; see Packaged note above
}

func (*ActivityDef) defNode()              {}
func (d *ActivityDef) PackageName() string { return d.Package }

type WorkerDef struct {
	Pos
	Name       string
	Workflows  []Ref[*WorkflowDef]
	Activities []Ref[*ActivityDef]
	Services   []Ref[*NexusServiceDef] // nexus service references
	SourceFile string
	Package    string // runtime-only; see Packaged note above
}

func (*WorkerDef) defNode()              {}
func (d *WorkerDef) PackageName() string { return d.Package }

// NamespaceWorker is a worker instantiation inside a namespace block.
type NamespaceWorker struct {
	Pos
	Worker  Ref[*WorkerDef]
	Options *OptionsBlock
}

// NamespaceEndpoint is a nexus endpoint instantiation inside a namespace block.
type NamespaceEndpoint struct {
	Pos
	EndpointName string
	Namespace    string // set by resolver: name of the owning namespace
	TaskQueue    string // set by resolver: endpoint's task_queue option
	// TemplateParams holds the distinct {param} template holes in EndpointName,
	// in order of first appearance (populated at parse time). Empty for a static
	// endpoint name, so its serialization stays byte-identical.
	TemplateParams []string
	Options        *OptionsBlock
}

// NamespaceDef is a namespace definition that instantiates workers with options.
type NamespaceDef struct {
	Pos
	Name string
	// TemplateParams holds the distinct {param} template holes in Name, in order
	// of first appearance (populated at parse time). Empty for a static namespace
	// name, so its serialization stays byte-identical.
	TemplateParams []string
	Workers        []NamespaceWorker
	Endpoints      []NamespaceEndpoint
	SourceFile     string
	Package        string // runtime-only; see Packaged note above
}

func (*NamespaceDef) defNode()              {}
func (d *NamespaceDef) PackageName() string { return d.Package }

// ---------------------------------------------------------------------------
// Workflow-level declarations (embedded in WorkflowDef)
// ---------------------------------------------------------------------------

type SignalDecl struct {
	Pos
	Name    string
	Params  string
	Options *OptionsBlock // optional handler options block (leads the body)
	Body    []Statement   // handler body
}

func (*SignalDecl) stmtNode() {}

type QueryDecl struct {
	Pos
	Name       string
	Params     string
	ReturnType string
	Options    *OptionsBlock // optional handler options block (leads the body)
	Body       []Statement   // handler body (restricted: no temporal primitives)
}

func (*QueryDecl) stmtNode() {}

type UpdateDecl struct {
	Pos
	Name       string
	Params     string
	ReturnType string
	Options    *OptionsBlock // optional handler options block (leads the body)
	Body       []Statement   // handler body
}

func (*UpdateDecl) stmtNode() {}

// ---------------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------------

type ActivityCall struct {
	Pos
	Activity Ref[*ActivityDef]
	Args     string
	Result   string // optional
	Options  *OptionsBlock
}

func (*ActivityCall) stmtNode() {}

// WorkflowCallMode describes how a workflow call is executed.
type WorkflowCallMode int

const (
	CallChild  WorkflowCallMode = iota // bare workflow call (child)
	CallDetach                         // detach workflow (fire-and-forget)
)

type WorkflowCall struct {
	Pos
	Mode     WorkflowCallMode
	Workflow Ref[*WorkflowDef]
	Args     string
	Result   string // optional
	Options  *OptionsBlock
}

func (*WorkflowCall) stmtNode() {}

// ---------------------------------------------------------------------------
// Async target discriminated union
// ---------------------------------------------------------------------------

// AsyncTarget is the interface for async operation targets used in await,
// await-one-case, and promise statements. Exactly one concrete type is used.
type AsyncTarget interface {
	asyncTarget() // unexported marker
}

// AsyncTargetKind returns a string identifying the kind of async target.
func AsyncTargetKind(t AsyncTarget) string {
	switch t.(type) {
	case *TimerTarget:
		return "timer"
	case *SignalTarget:
		return "signal"
	case *UpdateTarget:
		return "update"
	case *ActivityTarget:
		return "activity"
	case *WorkflowTarget:
		return "workflow"
	case *NexusTarget:
		return "nexus"
	case *IdentTarget:
		return "ident"
	default:
		return "unknown"
	}
}

type TimerTarget struct {
	Duration string
}

func (*TimerTarget) asyncTarget() {}

type SignalTarget struct {
	Signal Ref[*SignalDecl]
	Params string
}

func (*SignalTarget) asyncTarget() {}

type UpdateTarget struct {
	Update Ref[*UpdateDecl]
	Params string
}

func (*UpdateTarget) asyncTarget() {}

type ActivityTarget struct {
	Activity Ref[*ActivityDef]
	Args     string
	Result   string
}

func (*ActivityTarget) asyncTarget() {}

type WorkflowTarget struct {
	Workflow Ref[*WorkflowDef]
	Mode     WorkflowCallMode
	Args     string
	Result   string
}

func (*WorkflowTarget) asyncTarget() {}

type NexusTarget struct {
	Endpoint  Ref[*NamespaceEndpoint]
	Service   Ref[*NexusServiceDef]
	Operation Ref[*NexusOperation]
	Args      string
	Result    string
	Detach    bool
}

func (*NexusTarget) asyncTarget() {}

// IdentResolution holds the resolved target of an ident reference.
// Exactly one field is non-nil after successful resolution.
type IdentResolution struct {
	Promise   *PromiseStmt
	Condition *ConditionDecl
}

type IdentTarget struct {
	Name     string
	Result   string
	Resolved IdentResolution
}

func (*IdentTarget) asyncTarget() {}

// AwaitStmt represents a single await statement.
type AwaitStmt struct {
	Pos
	Target AsyncTarget
}

func (*AwaitStmt) stmtNode() {}

// AwaitAllBlock represents an "await all:" block that waits for all operations to complete.
type AwaitAllBlock struct {
	Pos
	Body []Statement
}

func (*AwaitAllBlock) stmtNode() {}

// AwaitOneCase represents a single case in an "await one:" block.
// Can be signal, update, timer, activity, workflow, nexus, ident, or nested await all.
type AwaitOneCase struct {
	Pos
	Target   AsyncTarget    // nil when AwaitAll is set
	AwaitAll *AwaitAllBlock // nil when Target is set
	Body     []Statement
}

func (*AwaitOneCase) stmtNode() {}

// AwaitOneBlock represents an "await one:" block that waits for the first case to complete.
type AwaitOneBlock struct {
	Pos
	Cases []*AwaitOneCase
}

func (*AwaitOneBlock) stmtNode() {}

// SwitchCase represents a single case in a switch block.
type SwitchCase struct {
	Pos
	Value string // opaque expression after "case"
	Body  []Statement
}

func (*SwitchCase) stmtNode() {}

type SwitchBlock struct {
	Pos
	Expr    string // opaque, paren-delimited
	Cases   []*SwitchCase
	Default []Statement // optional else block
}

func (*SwitchBlock) stmtNode() {}

type IfStmt struct {
	Pos
	Condition string // opaque, paren-delimited
	Body      []Statement
	ElseBody  []Statement // optional
}

func (*IfStmt) stmtNode() {}

// ForVariant describes the kind of for loop.
type ForVariant int

const (
	ForInfinite    ForVariant = iota // for:
	ForConditional                   // for (condition):
	ForIteration                     // for (var in collection):
)

type ForStmt struct {
	Pos
	Variant   ForVariant
	Condition string // for conditional loops
	Variable  string // for iteration loops
	Iterable  string // for iteration loops
	Body      []Statement
}

func (*ForStmt) stmtNode() {}

type ReturnStmt struct {
	Pos
	Value string // opaque, optional
}

func (*ReturnStmt) stmtNode() {}

// CloseReason classifies the kind of workflow close.
type CloseReason int

const (
	CloseComplete      CloseReason = iota // close complete
	CloseFailWorkflow                     // close fail
	CloseContinueAsNew                    // close continue_as_new
)

type CloseStmt struct {
	Pos
	Reason CloseReason
	Args   string // opaque, optional (parenthesized args)
}

func (*CloseStmt) stmtNode() {}

type BreakStmt struct {
	Pos
}

func (*BreakStmt) stmtNode() {}

type ContinueStmt struct {
	Pos
}

func (*ContinueStmt) stmtNode() {}

type RawStmt struct {
	Pos
	Text string
}

func (*RawStmt) stmtNode() {}

// IDScheme is a workflow type's declared ID template: `id_scheme: "ship-{order.id}"`.
// The ID derives from the workflow's params, so no start writes one.
type IDScheme struct {
	Pos
	Template string   // the unquoted template text
	Holes    []string // hole paths in order, each rooted at a param (e.g. "order.id")
}

// SignalSendStmt represents a cross-workflow signal send: signal Head.Name(args),
// with an Address on the indented lines below a type head. It is statement-only —
// never an AsyncTarget, await target, or promise RHS — because a signal carries
// no return value (fire-and-forget).
type SignalSendStmt struct {
	Pos
	Head   SendHead
	Signal string // signal name declared on the target workflow
	Args   string // opaque parenthesized argument literal
}

// SendHeadKind says whether a send's head names a workflow type or a handle.
type SendHeadKind string

const (
	SendHeadType   SendHeadKind = "type"   // a workflow type; requires an Address
	SendHeadHandle SendHeadKind = "handle" // a workflow-bound promise; takes no Address
)

// SendHead is what a signal send names before `.Signal`. The parser classifies a
// qualified head or one carrying an address as a type and a bare one as a handle;
// the resolver corrects the kind once it knows which names are promises. Type is
// the claimed type of the receiver: Temporal delivers by ID alone, so it names the
// scheme a literal is checked against, the handler, and the graph edge's target.
type SendHead struct {
	Pos
	Kind    SendHeadKind
	Type    Ref[*WorkflowDef] // set when Kind is SendHeadType
	Handle  Ref[*PromiseStmt] // set when Kind is SendHeadHandle
	Address *Address
	// External is set by the resolver when Type's qualifier is an import of a
	// package absent from the tree; such a head is carried unchecked.
	External bool
}

// Address is the indented `id:` / `run_id:` block under a type-headed send.
type Address struct {
	Pos
	ID    IDValue
	RunID string // optional path naming a variable that holds the run ID
}

// IDKind is the form of an `id:` value.
type IDKind string

const (
	IDLiteral IDKind = "literal" // a quoted literal mirroring the type's scheme
	IDParent  IDKind = "parent"  // the sender's parent execution
	IDName    IDKind = "name"    // a path naming a variable holding the whole ID
)

// IDValue is the value of an address's `id:` line.
type IDValue struct {
	Pos
	Kind    IDKind
	Literal string   // IDLiteral: the unquoted literal
	Parts   []string // IDLiteral: the hole paths, in the sender's own names
	Name    string   // IDName: the path holding the whole ID
}

func (*SignalSendStmt) stmtNode() {}

// DeclaresSignal reports whether the workflow declares a signal handler name.
func (wf *WorkflowDef) DeclaresSignal(name string) bool {
	for _, sig := range wf.Signals {
		if sig.Name == name {
			return true
		}
	}
	return false
}

// Target returns the workflow definition a send reaches: a type head's resolved
// type, or the resolved workflow a handle's promise was started against. Nil
// when the head did not resolve, or its type does not declare the signal.
func (s *SignalSendStmt) Target() *WorkflowDef {
	if s.Head.Kind == SendHeadType {
		if wf := s.Head.Type.Resolved; wf != nil && wf.DeclaresSignal(s.Signal) {
			return wf
		}
		return nil
	}
	if s.Head.Handle.Resolved == nil {
		return nil
	}
	if wt, ok := s.Head.Handle.Resolved.Target.(*WorkflowTarget); ok {
		return wt.Workflow.Resolved
	}
	return nil
}

type Comment struct {
	Pos
	Text string
}

func (*Comment) stmtNode() {}

// ---------------------------------------------------------------------------
// State block and new primitives
// ---------------------------------------------------------------------------

// StateBlock represents a state: block at the top of a workflow definition.
type StateBlock struct {
	Pos
	Conditions []*ConditionDecl
	RawStmts   []*RawStmt
}

// ConditionDecl represents a condition declaration inside a state block.
type ConditionDecl struct {
	Pos
	Name string
}

// PromiseStmt represents a promise declaration: promise name <- async_target
type PromiseStmt struct {
	Pos
	Name   string
	Target AsyncTarget
}

func (*PromiseStmt) stmtNode() {}

// SetStmt represents: set conditionName
type SetStmt struct {
	Pos
	Condition Ref[*ConditionDecl]
}

func (*SetStmt) stmtNode() {}

// UnsetStmt represents: unset conditionName
type UnsetStmt struct {
	Pos
	Condition Ref[*ConditionDecl]
}

func (*UnsetStmt) stmtNode() {}

// ---------------------------------------------------------------------------
// Nexus definitions and calls
// ---------------------------------------------------------------------------

// NexusOperationType distinguishes async vs sync nexus operations.
type NexusOperationType int

const (
	NexusOpAsync NexusOperationType = iota
	NexusOpSync
)

// NexusOperation is an operation inside a nexus service definition.
type NexusOperation struct {
	Pos
	OpType     NexusOperationType
	Name       string
	Workflow   Ref[*WorkflowDef] // async only: backing workflow
	Params     string            // sync only
	ReturnType string            // sync only
	Body       []Statement       // sync only
}

// NexusServiceDef is a top-level nexus service definition.
type NexusServiceDef struct {
	Pos
	Name       string
	Operations []*NexusOperation
	SourceFile string
	Package    string // runtime-only; see Packaged note above
}

func (*NexusServiceDef) defNode()              {}
func (d *NexusServiceDef) PackageName() string { return d.Package }

// NexusCall is a nexus service operation call inside a workflow body.
type NexusCall struct {
	Pos
	Detach    bool
	Endpoint  Ref[*NamespaceEndpoint]
	Service   Ref[*NexusServiceDef]
	Operation Ref[*NexusOperation]
	Args      string
	Result    string // optional
	Options   *OptionsBlock
}

func (*NexusCall) stmtNode() {}

// ---------------------------------------------------------------------------
// Options blocks
// ---------------------------------------------------------------------------

// OptionsBlock represents a structured options { ... } block.
type OptionsBlock struct {
	Pos
	Entries []*OptionEntry
}

// OptionEntry represents a single key-value pair or nested block inside options.
type OptionEntry struct {
	Pos
	Key       string
	Value     string         // literal for flat scalar entries
	ValueType string         // "string", "duration", "number", "bool", "enum", "list"
	Values    []string       // list elements; populated iff ValueType == "list", mutually exclusive with Value
	Nested    []*OptionEntry // non-nil for nested blocks (e.g. retry_policy)
}
