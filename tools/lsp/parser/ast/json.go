package ast

import (
	"cmp"
	"encoding/json"
	"fmt"
)

// JSON serialization with type discriminators for interface types.

// Site is where a node sits in source: its file and its 1-based line and
// column. It is the one position type on the wire.
type Site struct {
	File   string `json:"file,omitempty"` // absent only for a single unnamed source
	Line   int    `json:"line"`
	Column int    `json:"column"`
}

// SiteOf is n's site in file.
func SiteOf(file string, n Node) Site {
	return Site{File: file, Line: n.NodeLine(), Column: n.NodeColumn()}
}

// Compare orders sites by file, line, then column.
func (s Site) Compare(o Site) int {
	return cmp.Or(cmp.Compare(s.File, o.File), cmp.Compare(s.Line, o.Line), cmp.Compare(s.Column, o.Column))
}

// ResolvedRefJSON is a lightweight JSON reference to a resolved AST definition.
// Instead of embedding the entire target node, we emit its name and site.
type ResolvedRefJSON struct {
	Name string `json:"name"`
	Site Site   `json:"site"`
}

// FileSummary provides a count of each definition type in the file plus
// roll-up totals for diagnostics emitted while analyzing it.
type FileSummary struct {
	Namespaces    int `json:"namespaces"`
	Workers       int `json:"workers"`
	Workflows     int `json:"workflows"`
	Activities    int `json:"activities"`
	NexusServices int `json:"nexusServices"`

	// Errors and Warnings are aggregate diagnostic counts injected by the
	// CLI layer after analysis. The AST package itself does not populate
	// them — they default to zero in the raw parser output.
	Errors   int `json:"errors,omitempty"`
	Warnings int `json:"warnings,omitempty"`
}

// FileJSON is the JSON-serializable representation of a File.
//
// Package and Imports are additive and omitempty: a clause-less file (the
// implicit default package, every file today) emits neither, so its output is
// byte-identical to before this slice.
type FileJSON struct {
	Summary     FileSummary      `json:"summary"`
	Package     string           `json:"package,omitempty"`
	Imports     []ImportDeclJSON `json:"imports,omitempty"`
	Definitions []RawDefinition  `json:"definitions"`
}

// ImportDeclJSON is the JSON representation of an import declaration.
type ImportDeclJSON struct {
	Site  Site   `json:"site"`
	Path  string `json:"path"`
	Alias string `json:"alias,omitempty"`
}

// MarshalJSON implements json.Marshaler for File, the one entry point of the
// AST wire.
func (f *File) MarshalJSON() ([]byte, error) {
	files := targetFiles(f)
	fj := FileJSON{
		Package:     f.Package,
		Definitions: make([]RawDefinition, 0, len(f.Definitions)),
	}
	for _, imp := range f.Imports {
		fj.Imports = append(fj.Imports, ImportDeclJSON{
			Site:  SiteOf(imp.SourceFile, imp),
			Path:  imp.Path,
			Alias: imp.Alias,
		})
	}
	for _, def := range f.Definitions {
		switch def.(type) {
		case *WorkflowDef:
			fj.Summary.Workflows++
		case *ActivityDef:
			fj.Summary.Activities++
		case *WorkerDef:
			fj.Summary.Workers++
		case *NamespaceDef:
			fj.Summary.Namespaces++
		case *NexusServiceDef:
			fj.Summary.NexusServices++
		}
		data, err := marshaller{file: SourceFileOf(def), files: files}.definition(def)
		if err != nil {
			return nil, err
		}
		fj.Definitions = append(fj.Definitions, data)
	}
	return json.Marshal(fj)
}

// marshaller emits one definition: file is its source file, and files maps
// every resolvable target to its own.
type marshaller struct {
	file  string
	files map[Node]string
}

// targetFiles maps each definition in f, and each endpoint and operation
// nested in one, to its definition's source file.
func targetFiles(f *File) map[Node]string {
	files := map[Node]string{}
	for _, def := range f.Definitions {
		file := SourceFileOf(def)
		files[def] = file
		switch d := def.(type) {
		case *NamespaceDef:
			for i := range d.Endpoints {
				files[&d.Endpoints[i]] = file
			}
		case *NexusServiceDef:
			for _, op := range d.Operations {
				files[op] = file
			}
		}
	}
	return files
}

func (m marshaller) site(n Node) Site { return SiteOf(m.file, n) }

func (m marshaller) ref(name string, target Node) *ResolvedRefJSON {
	return &ResolvedRefJSON{Name: name, Site: SiteOf(m.files[target], target)}
}

func (m marshaller) statements(stmts []Statement) ([]RawStatement, error) {
	if len(stmts) == 0 {
		return nil, nil
	}
	out := make([]RawStatement, 0, len(stmts))
	for _, stmt := range stmts {
		data, err := m.statement(stmt)
		if err != nil {
			return nil, err
		}
		out = append(out, data)
	}
	return out, nil
}

// marshalDeclList marshals a slice of declarations using the given per-element function.
func marshalDeclList[D any, J any](decls []D, fn func(D) (*J, error)) ([]*J, error) {
	out := make([]*J, 0, len(decls))
	for _, d := range decls {
		j, err := fn(d)
		if err != nil {
			return nil, err
		}
		out = append(out, j)
	}
	return out, nil
}

func (m marshaller) signalDecl(s *SignalDecl) (*SignalDeclJSON, error) {
	sj := &SignalDeclJSON{
		Type:    "signalDecl",
		Site:    m.site(s),
		Name:    s.Name,
		Params:  s.Params,
		Options: marshalOptionsBlock(s.Options),
	}
	var err error
	if sj.Body, err = m.statements(s.Body); err != nil {
		return nil, err
	}
	return sj, nil
}

func (m marshaller) queryDecl(q *QueryDecl) (*QueryDeclJSON, error) {
	qj := &QueryDeclJSON{
		Type:       "queryDecl",
		Site:       m.site(q),
		Name:       q.Name,
		Params:     q.Params,
		ReturnType: q.ReturnType,
		Options:    marshalOptionsBlock(q.Options),
	}
	var err error
	if qj.Body, err = m.statements(q.Body); err != nil {
		return nil, err
	}
	return qj, nil
}

func (m marshaller) updateDecl(u *UpdateDecl) (*UpdateDeclJSON, error) {
	uj := &UpdateDeclJSON{
		Type:       "updateDecl",
		Site:       m.site(u),
		Name:       u.Name,
		Params:     u.Params,
		ReturnType: u.ReturnType,
		Options:    marshalOptionsBlock(u.Options),
	}
	var err error
	if uj.Body, err = m.statements(u.Body); err != nil {
		return nil, err
	}
	return uj, nil
}

func (m marshaller) definition(def Definition) (json.RawMessage, error) {
	switch d := def.(type) {
	case *WorkflowDef:
		return m.workflowDef(d)
	case *ActivityDef:
		return m.activityDef(d)
	case *WorkerDef:
		return m.workerDef(d)
	case *NamespaceDef:
		return m.namespaceDef(d)
	case *NexusServiceDef:
		return m.nexusServiceDef(d)
	default:
		return nil, fmt.Errorf("marshal: unhandled definition type %T", def)
	}
}

// OptionsBlockJSON is the JSON representation of an options block.
type OptionsBlockJSON struct {
	Entries []OptionEntryJSON `json:"entries"`
}

// OptionEntryJSON is the JSON representation of a single option entry.
// Value holds the scalar literal for flat entries; Values holds the elements of
// a list-valued entry (valueType == "list"). The two are mutually exclusive.
type OptionEntryJSON struct {
	Key       string            `json:"key"`
	Value     string            `json:"value,omitempty"`
	ValueType string            `json:"valueType,omitempty"`
	Values    []string          `json:"values,omitempty"`
	Nested    []OptionEntryJSON `json:"nested,omitempty"`
}

func marshalOptionsBlock(ob *OptionsBlock) *OptionsBlockJSON {
	if ob == nil {
		return nil
	}
	obj := &OptionsBlockJSON{
		Entries: marshalOptionEntries(ob.Entries),
	}
	return obj
}

func marshalOptionEntries(entries []*OptionEntry) []OptionEntryJSON {
	result := make([]OptionEntryJSON, 0, len(entries))
	for _, e := range entries {
		ej := OptionEntryJSON{
			Key:       e.Key,
			Value:     e.Value,
			ValueType: e.ValueType,
			Values:    e.Values,
		}
		if len(e.Nested) > 0 {
			ej.Nested = marshalOptionEntries(e.Nested)
		}
		result = append(result, ej)
	}
	return result
}

// PackageRef is one entry of an output's packages table, keyed by package
// identity.
type PackageRef struct {
	// Name is the package's declared name.
	Name string `json:"name"`
}

// PackageRefs is a merged file's packages table: each kept package's identity
// mapped to its declared name, or nil for an unpackaged design.
func PackageRefs(file *File) map[string]PackageRef {
	if file == nil || len(file.Packages) == 0 {
		return nil
	}
	out := make(map[string]PackageRef, len(file.Packages))
	for _, p := range file.Packages {
		out[p.ID] = PackageRef{Name: p.Name}
	}
	return out
}

// Label is how messages and text output name a definition: its package's
// declared name and its name (`fabric.Setup`; `fabric.Svc.Op` for an
// operation), with the package identity appended in parentheses when another
// package in the table shares the declared name. A default-package
// definition's label is its bare name.
func Label(packages map[string]PackageRef, pkgID, name string) string {
	if pkgID == "" {
		return name
	}
	ref, ok := packages[pkgID]
	if !ok {
		return QualifiedName(pkgID, name)
	}
	label := QualifiedName(ref.Name, name)
	for id, other := range packages {
		if id != pkgID && other.Name == ref.Name {
			return label + " (" + pkgID + ")"
		}
	}
	return label
}

// qualifiedNameJSON is the qualifiedName a workflow / activity / nexus-service
// DTO emits (issue #184): QualifiedName of the definition's package identity
// (PackageIDOf, from the stamps the pipeline's merge writes), so it equals
// the name element of the definition's graph node ID. It is empty — and the
// omitempty field absent — for an unstamped (default-package) definition,
// whose graph name is already the bare name, so unpackaged output stays
// byte-identical. Workers and namespaces carry no such field: the graph keeps
// them bare.
func qualifiedNameJSON(pkg, name string) string {
	if pkg == "" {
		return ""
	}
	return QualifiedName(pkg, name)
}

// WorkflowDefJSON is the JSON representation of WorkflowDef.
type WorkflowDefJSON struct {
	Type string `json:"type"`
	Site Site   `json:"site"`
	Name string `json:"name"`
	// QualifiedName is the name element of this definition's graph node ID
	// (`pkg.Name`); absent for a default-package definition, whose graph name
	// is the bare Name. Join graph nodes to definitions on it (issue #184).
	QualifiedName string `json:"qualifiedName,omitempty"`
	// PackageID is the owning package's identity, a key into the envelope's
	// packages table; absent for the default package.
	PackageID      string            `json:"packageId,omitempty"`
	Params         string            `json:"params"`
	ReturnType     string            `json:"returnType,omitempty"`
	IDScheme       *IDSchemeJSON     `json:"idScheme,omitempty"`
	DefaultOptions *OptionsBlockJSON `json:"defaultOptions,omitempty"`
	State          *StateBlockJSON   `json:"state,omitempty"`
	Signals        []*SignalDeclJSON `json:"signals"`
	Queries        []*QueryDeclJSON  `json:"queries"`
	Updates        []*UpdateDeclJSON `json:"updates"`
	Body           []RawStatement    `json:"body"`
}

// StateBlockJSON is the JSON representation of a state: block.
type StateBlockJSON struct {
	Conditions []*ConditionDeclJSON `json:"conditions,omitempty"`
	RawStmts   []RawStmtJSON        `json:"rawStmts,omitempty"`
}

// ConditionDeclJSON is the JSON representation of a condition declaration.
type ConditionDeclJSON struct {
	Site Site   `json:"site"`
	Name string `json:"name"`
}

func (m marshaller) workflowDef(w *WorkflowDef) (json.RawMessage, error) {
	wj := WorkflowDefJSON{
		Type:           "workflowDef",
		Site:           m.site(w),
		Name:           w.Name,
		QualifiedName:  qualifiedNameJSON(PackageIDOf(w, nil), w.Name),
		PackageID:      PackageIDOf(w, nil),
		Params:         w.Params,
		ReturnType:     w.ReturnType,
		DefaultOptions: marshalOptionsBlock(w.DefaultOptions),
	}
	if w.IDScheme != nil {
		wj.IDScheme = &IDSchemeJSON{
			Site:     m.site(w.IDScheme),
			Template: w.IDScheme.Template,
			Holes:    w.IDScheme.Holes,
		}
	}
	if w.State != nil {
		sj := &StateBlockJSON{}
		for _, c := range w.State.Conditions {
			sj.Conditions = append(sj.Conditions, &ConditionDeclJSON{Site: m.site(c), Name: c.Name})
		}
		for _, r := range w.State.RawStmts {
			sj.RawStmts = append(sj.RawStmts, RawStmtJSON{
				Type: "raw",
				Site: m.site(r),
				Text: r.Text,
			})
		}
		wj.State = sj
	}
	var err error
	if wj.Signals, err = marshalDeclList(w.Signals, m.signalDecl); err != nil {
		return nil, err
	}
	if wj.Queries, err = marshalDeclList(w.Queries, m.queryDecl); err != nil {
		return nil, err
	}
	if wj.Updates, err = marshalDeclList(w.Updates, m.updateDecl); err != nil {
		return nil, err
	}
	if wj.Body, err = m.statements(w.Body); err != nil {
		return nil, err
	}
	return json.Marshal(wj)
}

// ActivityDefJSON is the JSON representation of ActivityDef.
type ActivityDefJSON struct {
	Type string `json:"type"`
	Site Site   `json:"site"`
	Name string `json:"name"`
	// QualifiedName is the name element of this definition's graph node ID
	// (`pkg.Name`); absent for a default-package definition, whose graph name
	// is the bare Name. Join graph nodes to definitions on it (issue #184).
	QualifiedName string `json:"qualifiedName,omitempty"`
	// PackageID is the owning package's identity, a key into the envelope's
	// packages table; absent for the default package.
	PackageID      string            `json:"packageId,omitempty"`
	Params         string            `json:"params"`
	ReturnType     string            `json:"returnType,omitempty"`
	DefaultOptions *OptionsBlockJSON `json:"defaultOptions,omitempty"`
	Body           []RawStatement    `json:"body"`
}

func (m marshaller) activityDef(a *ActivityDef) (json.RawMessage, error) {
	aj := ActivityDefJSON{
		Type:           "activityDef",
		Site:           m.site(a),
		Name:           a.Name,
		QualifiedName:  qualifiedNameJSON(PackageIDOf(a, nil), a.Name),
		PackageID:      PackageIDOf(a, nil),
		Params:         a.Params,
		ReturnType:     a.ReturnType,
		DefaultOptions: marshalOptionsBlock(a.DefaultOptions),
	}
	var err error
	if aj.Body, err = m.statements(a.Body); err != nil {
		return nil, err
	}
	return json.Marshal(aj)
}

// WorkerRefJSON is the JSON representation of a Ref used in worker definitions.
type WorkerRefJSON struct {
	Package  string           `json:"package,omitempty"`
	Name     string           `json:"name"`
	Site     Site             `json:"site"`
	Resolved *ResolvedRefJSON `json:"resolved,omitempty"`
}

// marshalWorkerRefs converts a slice of Ref[T] to JSON form. Returns an
// empty (non-nil) slice when refs is empty so the JSON output always emits
// the field as `[]` rather than omitting it — keeps WorkerDef/NamespaceDef
// shape consistent for downstream consumers.
func marshalWorkerRefs[T interface {
	comparable
	Node
}](m marshaller, refs []Ref[T]) []WorkerRefJSON {
	out := make([]WorkerRefJSON, 0, len(refs))
	for _, ref := range refs {
		rj := WorkerRefJSON{
			Package: ref.Package,
			Name:    ref.Name,
			Site:    m.site(ref),
		}
		var zero T
		if ref.Resolved != zero {
			rj.Resolved = m.ref(ref.Name, ref.Resolved)
		}
		out = append(out, rj)
	}
	return out
}

// WorkerDefJSON is the JSON representation of WorkerDef.
type WorkerDefJSON struct {
	Type string `json:"type"`
	Site Site   `json:"site"`
	Name string `json:"name"`
	// PackageID is the owning package's identity, a key into the envelope's
	// packages table; absent for the default package.
	PackageID  string          `json:"packageId,omitempty"`
	Workflows  []WorkerRefJSON `json:"workflows"`
	Activities []WorkerRefJSON `json:"activities"`
	Services   []WorkerRefJSON `json:"services"`
	// SDKs are the worker's implementations, from its `@sdk` annotations;
	// absent when it has none.
	SDKs []SDKJSON `json:"sdks,omitempty"`
}

// SDKJSON is one implementation of a worker: its SDK and, once code exists,
// its entry file, relative to the module root (else the .twf file's
// directory).
type SDKJSON struct {
	SDK  string `json:"sdk"`
	Impl string `json:"impl,omitempty"`
}

// MarshalSDKs converts a worker's implementations to JSON form; nil when it
// has none.
func MarshalSDKs(sdks []WorkerSDK) []SDKJSON {
	var out []SDKJSON
	for _, s := range sdks {
		out = append(out, SDKJSON{SDK: s.SDK, Impl: s.Impl})
	}
	return out
}

func (m marshaller) workerDef(w *WorkerDef) (json.RawMessage, error) {
	wj := WorkerDefJSON{
		Type:       "workerDef",
		Site:       m.site(w),
		Name:       w.Name,
		PackageID:  PackageIDOf(w, nil),
		Workflows:  marshalWorkerRefs(m, w.Workflows),
		Activities: marshalWorkerRefs(m, w.Activities),
		Services:   marshalWorkerRefs(m, w.Services),
		SDKs:       MarshalSDKs(w.SDKs),
	}
	return json.Marshal(wj)
}

// NamespaceWorkerJSON is the JSON representation of a worker instantiation in a namespace.
type NamespaceWorkerJSON struct {
	WorkerName string `json:"workerName"`
	Site       Site   `json:"site"`
	// TemplateParams is the distinct instance parameters in the task_queue, in
	// order of first appearance. Omitted (omitempty) for a static queue so its
	// output stays byte-identical.
	TemplateParams []string          `json:"templateParams,omitempty"`
	Options        *OptionsBlockJSON `json:"options,omitempty"`
	ResolvedWorker *ResolvedRefJSON  `json:"resolvedWorker,omitempty"`
}

// NamespaceEndpointJSON is the JSON representation of a nexus endpoint in a namespace.
type NamespaceEndpointJSON struct {
	EndpointName string `json:"endpointName"`
	Site         Site   `json:"site"`
	TaskQueue    string `json:"taskQueue,omitempty"`
	// TemplateParams is the distinct {param} parameters in the endpoint name, in order
	// of first appearance. Omitted (omitempty) for a static endpoint so its
	// output stays byte-identical.
	TemplateParams []string          `json:"templateParams,omitempty"`
	Options        *OptionsBlockJSON `json:"options,omitempty"`
}

// NamespaceDefJSON is the JSON representation of NamespaceDef.
type NamespaceDefJSON struct {
	Type string `json:"type"`
	Site Site   `json:"site"`
	Name string `json:"name"`
	// PackageID is the owning package's identity, a key into the envelope's
	// packages table; absent for the default package.
	PackageID string `json:"packageId,omitempty"`
	// TemplateParams is the distinct {param} parameters in the namespace name, in
	// order of first appearance. Omitted (omitempty) for a static namespace so
	// its output stays byte-identical.
	TemplateParams []string                `json:"templateParams,omitempty"`
	Workers        []NamespaceWorkerJSON   `json:"workers"`
	Endpoints      []NamespaceEndpointJSON `json:"endpoints"`
}

func (m marshaller) namespaceDef(n *NamespaceDef) (json.RawMessage, error) {
	nj := NamespaceDefJSON{
		Type:           "namespaceDef",
		Site:           m.site(n),
		Name:           n.Name,
		PackageID:      PackageIDOf(n, nil),
		TemplateParams: n.TemplateParams,
		Workers:        make([]NamespaceWorkerJSON, 0, len(n.Workers)),
		Endpoints:      make([]NamespaceEndpointJSON, 0, len(n.Endpoints)),
	}
	for _, w := range n.Workers {
		wj := NamespaceWorkerJSON{
			WorkerName:     w.Worker.Name,
			Site:           m.site(w),
			TemplateParams: w.TemplateParams,
			Options:        marshalOptionsBlock(w.Options),
		}
		if w.Worker.Resolved != nil {
			wj.ResolvedWorker = m.ref(w.Worker.Resolved.Name, w.Worker.Resolved)
		}
		nj.Workers = append(nj.Workers, wj)
	}
	for _, ep := range n.Endpoints {
		nj.Endpoints = append(nj.Endpoints, NamespaceEndpointJSON{
			EndpointName:   ep.EndpointName,
			Site:           m.site(ep),
			TaskQueue:      ep.TaskQueue,
			TemplateParams: ep.TemplateParams,
			Options:        marshalOptionsBlock(ep.Options),
		})
	}
	return json.Marshal(nj)
}

// Declaration JSON types
type SignalDeclJSON struct {
	Type    string            `json:"type"`
	Site    Site              `json:"site"`
	Name    string            `json:"name"`
	Params  string            `json:"params"`
	Options *OptionsBlockJSON `json:"options,omitempty"`
	Body    []RawStatement    `json:"body,omitempty"`
}

type QueryDeclJSON struct {
	Type       string            `json:"type"`
	Site       Site              `json:"site"`
	Name       string            `json:"name"`
	Params     string            `json:"params"`
	ReturnType string            `json:"returnType,omitempty"`
	Options    *OptionsBlockJSON `json:"options,omitempty"`
	Body       []RawStatement    `json:"body,omitempty"`
}

type UpdateDeclJSON struct {
	Type       string            `json:"type"`
	Site       Site              `json:"site"`
	Name       string            `json:"name"`
	Params     string            `json:"params"`
	ReturnType string            `json:"returnType,omitempty"`
	Options    *OptionsBlockJSON `json:"options,omitempty"`
	Body       []RawStatement    `json:"body,omitempty"`
}

// statement marshals a Statement with type discrimination.
func (m marshaller) statement(stmt Statement) (json.RawMessage, error) {
	switch s := stmt.(type) {
	case *ActivityCall:
		return m.activityCall(s)
	case *WorkflowCall:
		return m.workflowCall(s)
	case *NexusCall:
		return m.nexusCall(s)
	case *AwaitStmt:
		return m.awaitStmt(s)
	case *AwaitAllBlock:
		return m.awaitAllBlock(s)
	case *AwaitOneBlock:
		return m.awaitOneBlock(s)
	case *SwitchBlock:
		return m.switchBlock(s)
	case *IfStmt:
		return m.ifStmt(s)
	case *ForStmt:
		return m.forStmt(s)
	case *ReturnStmt:
		return m.returnStmt(s)
	case *CloseStmt:
		return m.closeStmt(s)
	case *BreakStmt:
		return m.breakStmt(s)
	case *ContinueStmt:
		return m.continueStmt(s)
	case *RawStmt:
		return m.rawStmt(s)
	case *SignalSendStmt:
		return m.signalSendStmt(s)
	case *Comment:
		return m.comment(s)
	case *PromiseStmt:
		return m.promiseStmt(s)
	case *SetStmt:
		return m.setStmt(s)
	case *UnsetStmt:
		return m.unsetStmt(s)
	default:
		return nil, fmt.Errorf("marshal: unhandled statement type %T", stmt)
	}
}

func (m marshaller) activityCall(s *ActivityCall) (json.RawMessage, error) {
	aj := ActivityCallJSON{
		Type:    "activityCall",
		Site:    m.site(s),
		Package: s.Activity.Package,
		Name:    s.Activity.Name,
		Args:    s.Args,
		Result:  s.Result,
		Options: marshalOptionsBlock(s.Options),
	}
	if s.Activity.Resolved != nil {
		aj.Resolved = m.ref(s.Activity.Resolved.Name, s.Activity.Resolved)
	}
	return json.Marshal(aj)
}

func (m marshaller) workflowCall(s *WorkflowCall) (json.RawMessage, error) {
	wj := WorkflowCallJSON{
		Type:    "workflowCall",
		Site:    m.site(s),
		Mode:    workflowCallModeString(s.Mode),
		Start:   startKindString(s.Start),
		Package: s.Workflow.Package,
		Name:    s.Workflow.Name,
		Args:    s.Args,
		Result:  s.Result,
		Options: marshalOptionsBlock(s.Options),
	}
	if s.Workflow.Resolved != nil {
		wj.Resolved = m.ref(s.Workflow.Resolved.Name, s.Workflow.Resolved)
	}
	return json.Marshal(wj)
}

func (m marshaller) nexusCall(s *NexusCall) (json.RawMessage, error) {
	nj := NexusCallJSON{
		Type:           "nexusCall",
		Site:           m.site(s),
		Detach:         s.Detach,
		Endpoint:       s.Endpoint.Name,
		ServicePackage: s.Service.Package,
		Service:        s.Service.Name,
		Operation:      s.Operation.Name,
		Args:           s.Args,
		Result:         s.Result,
		Options:        marshalOptionsBlock(s.Options),
	}
	if s.Endpoint.Resolved != nil {
		nj.ResolvedEndpoint = m.ref(s.Endpoint.Resolved.EndpointName, s.Endpoint.Resolved)
		nj.ResolvedEndpointNamespace = s.Endpoint.Resolved.Namespace
	}
	if s.Service.Resolved != nil {
		nj.ResolvedService = m.ref(s.Service.Resolved.Name, s.Service.Resolved)
	}
	if s.Operation.Resolved != nil {
		nj.ResolvedOperation = m.ref(s.Operation.Resolved.Name, s.Operation.Resolved)
	}
	return json.Marshal(nj)
}

func (m marshaller) awaitStmt(s *AwaitStmt) (json.RawMessage, error) {
	return json.Marshal(AwaitStmtJSON{
		Type:   "await",
		Site:   m.site(s),
		Target: m.asyncTarget(s.Target),
	})
}

func (m marshaller) awaitAllBlock(s *AwaitAllBlock) (json.RawMessage, error) {
	body, err := m.statements(s.Body)
	if err != nil {
		return nil, err
	}
	return json.Marshal(AwaitAllBlockJSON{
		Type: "awaitAll",
		Site: m.site(s),
		Body: body,
	})
}

func (m marshaller) awaitOneBlock(s *AwaitOneBlock) (json.RawMessage, error) {
	cases := make([]AwaitOneCaseJSON, 0, len(s.Cases))
	for _, c := range s.Cases {
		caseBody, err := m.statements(c.Body)
		if err != nil {
			return nil, err
		}
		cj := AwaitOneCaseJSON{
			Site: m.site(c),
			Body: caseBody,
		}
		if c.AwaitAll != nil {
			data, err := m.statement(c.AwaitAll)
			if err != nil {
				return nil, err
			}
			cj.AwaitAll = data
		} else if c.Target != nil {
			t := m.asyncTarget(c.Target)
			cj.Target = &t
		}
		cases = append(cases, cj)
	}
	return json.Marshal(AwaitOneBlockJSON{
		Type:  "awaitOne",
		Site:  m.site(s),
		Cases: cases,
	})
}

func (m marshaller) switchBlock(s *SwitchBlock) (json.RawMessage, error) {
	cases := make([]SwitchCaseJSON, 0, len(s.Cases))
	for _, c := range s.Cases {
		caseBody, err := m.statements(c.Body)
		if err != nil {
			return nil, err
		}
		cases = append(cases, SwitchCaseJSON{
			Site:  m.site(c),
			Value: c.Value,
			Body:  caseBody,
		})
	}
	defaultBody, err := m.statements(s.Default)
	if err != nil {
		return nil, err
	}
	return json.Marshal(SwitchBlockJSON{
		Type:    "switch",
		Site:    m.site(s),
		Expr:    s.Expr,
		Cases:   cases,
		Default: defaultBody,
	})
}

func (m marshaller) ifStmt(s *IfStmt) (json.RawMessage, error) {
	body, err := m.statements(s.Body)
	if err != nil {
		return nil, err
	}
	elseBody, err := m.statements(s.ElseBody)
	if err != nil {
		return nil, err
	}
	return json.Marshal(IfStmtJSON{
		Type:      "if",
		Site:      m.site(s),
		Condition: s.Condition,
		Body:      body,
		ElseBody:  elseBody,
	})
}

func (m marshaller) forStmt(s *ForStmt) (json.RawMessage, error) {
	body, err := m.statements(s.Body)
	if err != nil {
		return nil, err
	}
	return json.Marshal(ForStmtJSON{
		Type:      "for",
		Site:      m.site(s),
		Variant:   forVariantString(s.Variant),
		Condition: s.Condition,
		Variable:  s.Variable,
		Iterable:  s.Iterable,
		Body:      body,
	})
}

func (m marshaller) returnStmt(s *ReturnStmt) (json.RawMessage, error) {
	return json.Marshal(ReturnStmtJSON{
		Type:  "return",
		Site:  m.site(s),
		Value: s.Value,
	})
}

func (m marshaller) closeStmt(s *CloseStmt) (json.RawMessage, error) {
	return json.Marshal(CloseStmtJSON{
		Type:   "close",
		Site:   m.site(s),
		Reason: closeReasonString(s.Reason),
		Args:   s.Args,
	})
}

func (m marshaller) breakStmt(s *BreakStmt) (json.RawMessage, error) {
	return json.Marshal(BreakStmtJSON{Type: "break", Site: m.site(s)})
}

func (m marshaller) continueStmt(s *ContinueStmt) (json.RawMessage, error) {
	return json.Marshal(ContinueStmtJSON{Type: "continue", Site: m.site(s)})
}

func (m marshaller) rawStmt(s *RawStmt) (json.RawMessage, error) {
	return json.Marshal(RawStmtJSON{Type: "raw", Site: m.site(s), Text: s.Text})
}

func (m marshaller) comment(s *Comment) (json.RawMessage, error) {
	return json.Marshal(CommentJSON{Type: "comment", Site: m.site(s), Text: s.Text})
}

func (m marshaller) signalSendStmt(s *SignalSendStmt) (json.RawMessage, error) {
	h := s.Head
	hj := SendHeadJSON{
		Kind:     string(h.Kind),
		Site:     m.site(h),
		Address:  m.address(h.Address),
		External: h.External,
	}
	if h.Kind == SendHeadType {
		hj.Package, hj.Type = h.Type.Package, h.Type.Name
	} else {
		hj.Handle = h.Handle.Name
	}
	sj := SignalSendStmtJSON{
		Type:   "signalSend",
		Site:   m.site(s),
		Head:   hj,
		Signal: s.Signal,
		Args:   s.Args,
	}
	// resolved surfaces the target workflow — what the visualizer needs to draw
	// the signalSend edge: the type head's own definition, or the workflow a
	// handle's promise was started against.
	if target := s.Target(); target != nil {
		sj.Resolved = m.ref(target.Name, target)
	}
	return json.Marshal(sj)
}

func (m marshaller) address(a *Address) *AddressJSON {
	if a == nil {
		return nil
	}
	return &AddressJSON{
		Site: m.site(a),
		ID: IDValueJSON{
			Kind:    string(a.ID.Kind),
			Literal: a.ID.Literal,
			Parts:   a.ID.Parts,
			Name:    a.ID.Name,
		},
		RunID: a.RunID,
	}
}

func (m marshaller) promiseStmt(s *PromiseStmt) (json.RawMessage, error) {
	return json.Marshal(PromiseStmtJSON{
		Type:   "promise",
		Site:   m.site(s),
		Name:   s.Name,
		Target: m.asyncTarget(s.Target),
	})
}

func (m marshaller) setStmt(s *SetStmt) (json.RawMessage, error) {
	return json.Marshal(SetStmtJSON{Type: "set", Site: m.site(s), Name: s.Condition.Name})
}

func (m marshaller) unsetStmt(s *UnsetStmt) (json.RawMessage, error) {
	return json.Marshal(UnsetStmtJSON{Type: "unset", Site: m.site(s), Name: s.Condition.Name})
}

func workflowCallModeString(mode WorkflowCallMode) string {
	if mode == CallDetach {
		return "detach"
	}
	return "attached"
}

func startKindString(kind StartKind) string {
	if kind == StartClient {
		return "client"
	}
	return "child"
}

func forVariantString(v ForVariant) string {
	switch v {
	case ForInfinite:
		return "infinite"
	case ForConditional:
		return "conditional"
	case ForIteration:
		return "iteration"
	default:
		return "infinite"
	}
}

// Statement JSON types
type ActivityCallJSON struct {
	Type     string            `json:"type"`
	Site     Site              `json:"site"`
	Package  string            `json:"package,omitempty"`
	Name     string            `json:"name"`
	Args     string            `json:"args"`
	Result   string            `json:"result,omitempty"`
	Options  *OptionsBlockJSON `json:"options,omitempty"`
	Resolved *ResolvedRefJSON  `json:"resolved,omitempty"`
}

type WorkflowCallJSON struct {
	Type     string            `json:"type"`
	Site     Site              `json:"site"`
	Mode     string            `json:"mode"`
	Start    string            `json:"start"`
	Package  string            `json:"package,omitempty"`
	Name     string            `json:"name"`
	Args     string            `json:"args"`
	Result   string            `json:"result,omitempty"`
	Options  *OptionsBlockJSON `json:"options,omitempty"`
	Resolved *ResolvedRefJSON  `json:"resolved,omitempty"`
}

func closeReasonString(r CloseReason) string {
	switch r {
	case CloseComplete:
		return "complete"
	case CloseFailWorkflow:
		return "fail"
	case CloseContinueAsNew:
		return "continue_as_new"
	default:
		return "complete"
	}
}

// AsyncTargetJSON is a discriminated union for async target JSON serialization.
// Each kind populates exactly one of the per-kind fields.
type AsyncTargetJSON struct {
	Kind     string              `json:"kind"`
	Timer    *TimerTargetJSON    `json:"timer,omitempty"`
	Signal   *SignalTargetJSON   `json:"signal,omitempty"`
	Update   *UpdateTargetJSON   `json:"update,omitempty"`
	Activity *ActivityTargetJSON `json:"activity,omitempty"`
	Workflow *WorkflowTargetJSON `json:"workflow,omitempty"`
	Nexus    *NexusTargetJSON    `json:"nexus,omitempty"`
	Ident    *IdentTargetJSON    `json:"ident,omitempty"`
}

type TimerTargetJSON struct {
	Duration string `json:"duration"`
}

type SignalTargetJSON struct {
	Name   string `json:"name"`
	Params string `json:"params,omitempty"`
}

type UpdateTargetJSON struct {
	Name   string `json:"name"`
	Params string `json:"params,omitempty"`
}

type ActivityTargetJSON struct {
	Package  string           `json:"package,omitempty"`
	Name     string           `json:"name"`
	Args     string           `json:"args,omitempty"`
	Result   string           `json:"result,omitempty"`
	Resolved *ResolvedRefJSON `json:"resolved,omitempty"`
}

type WorkflowTargetJSON struct {
	Package  string           `json:"package,omitempty"`
	Name     string           `json:"name"`
	Start    string           `json:"start"`
	Args     string           `json:"args,omitempty"`
	Result   string           `json:"result,omitempty"`
	Resolved *ResolvedRefJSON `json:"resolved,omitempty"`
}

type NexusTargetJSON struct {
	Endpoint                  string           `json:"endpoint"`
	ServicePackage            string           `json:"servicePackage,omitempty"`
	Service                   string           `json:"service"`
	Operation                 string           `json:"operation"`
	Args                      string           `json:"args,omitempty"`
	Result                    string           `json:"result,omitempty"`
	ResolvedEndpoint          *ResolvedRefJSON `json:"resolvedEndpoint,omitempty"`
	ResolvedEndpointNamespace string           `json:"resolvedEndpointNamespace,omitempty"`
	ResolvedService           *ResolvedRefJSON `json:"resolvedService,omitempty"`
	ResolvedOperation         *ResolvedRefJSON `json:"resolvedOperation,omitempty"`
}

type IdentTargetJSON struct {
	Name   string `json:"name"`
	Result string `json:"result,omitempty"`
}

func (m marshaller) asyncTarget(target AsyncTarget) AsyncTargetJSON {
	at := AsyncTargetJSON{Kind: AsyncTargetKind(target)}
	switch t := target.(type) {
	case *TimerTarget:
		at.Timer = &TimerTargetJSON{Duration: t.Duration}
	case *SignalTarget:
		at.Signal = &SignalTargetJSON{Name: t.Signal.Name, Params: t.Params}
	case *UpdateTarget:
		at.Update = &UpdateTargetJSON{Name: t.Update.Name, Params: t.Params}
	case *ActivityTarget:
		aj := &ActivityTargetJSON{Package: t.Activity.Package, Name: t.Activity.Name, Args: t.Args, Result: t.Result}
		if t.Activity.Resolved != nil {
			aj.Resolved = m.ref(t.Activity.Resolved.Name, t.Activity.Resolved)
		}
		at.Activity = aj
	case *WorkflowTarget:
		wj := &WorkflowTargetJSON{Package: t.Workflow.Package, Name: t.Workflow.Name, Start: startKindString(t.Start), Args: t.Args, Result: t.Result}
		if t.Workflow.Resolved != nil {
			wj.Resolved = m.ref(t.Workflow.Resolved.Name, t.Workflow.Resolved)
		}
		at.Workflow = wj
	case *NexusTarget:
		nj := &NexusTargetJSON{
			Endpoint:       t.Endpoint.Name,
			ServicePackage: t.Service.Package,
			Service:        t.Service.Name,
			Operation:      t.Operation.Name,
			Args:           t.Args,
			Result:         t.Result,
		}
		if t.Endpoint.Resolved != nil {
			nj.ResolvedEndpoint = m.ref(t.Endpoint.Resolved.EndpointName, t.Endpoint.Resolved)
			nj.ResolvedEndpointNamespace = t.Endpoint.Resolved.Namespace
		}
		if t.Service.Resolved != nil {
			nj.ResolvedService = m.ref(t.Service.Resolved.Name, t.Service.Resolved)
		}
		if t.Operation.Resolved != nil {
			nj.ResolvedOperation = m.ref(t.Operation.Resolved.Name, t.Operation.Resolved)
		}
		at.Nexus = nj
	case *IdentTarget:
		at.Ident = &IdentTargetJSON{Name: t.Name, Result: t.Result}
	}
	return at
}

type AwaitStmtJSON struct {
	Type   string          `json:"type"`
	Site   Site            `json:"site"`
	Target AsyncTargetJSON `json:"target"`
}

type AwaitAllBlockJSON struct {
	Type string         `json:"type"`
	Site Site           `json:"site"`
	Body []RawStatement `json:"body"`
}

type AwaitOneCaseJSON struct {
	Site     Site             `json:"site"`
	Target   *AsyncTargetJSON `json:"target,omitempty"`
	AwaitAll RawStatement     `json:"awaitAll,omitempty"`
	Body     []RawStatement   `json:"body"`
}

type AwaitOneBlockJSON struct {
	Type  string             `json:"type"`
	Site  Site               `json:"site"`
	Cases []AwaitOneCaseJSON `json:"cases"`
}

type SwitchCaseJSON struct {
	Site  Site           `json:"site"`
	Value string         `json:"value"`
	Body  []RawStatement `json:"body"`
}

type SwitchBlockJSON struct {
	Type    string           `json:"type"`
	Site    Site             `json:"site"`
	Expr    string           `json:"expr"`
	Cases   []SwitchCaseJSON `json:"cases"`
	Default []RawStatement   `json:"default,omitempty"`
}

type IfStmtJSON struct {
	Type      string         `json:"type"`
	Site      Site           `json:"site"`
	Condition string         `json:"condition"`
	Body      []RawStatement `json:"body"`
	ElseBody  []RawStatement `json:"elseBody,omitempty"`
}

type ForStmtJSON struct {
	Type      string         `json:"type"`
	Site      Site           `json:"site"`
	Variant   string         `json:"variant"`
	Condition string         `json:"condition,omitempty"`
	Variable  string         `json:"variable,omitempty"`
	Iterable  string         `json:"iterable,omitempty"`
	Body      []RawStatement `json:"body"`
}

type ReturnStmtJSON struct {
	Type  string `json:"type"`
	Site  Site   `json:"site"`
	Value string `json:"value,omitempty"`
}

type CloseStmtJSON struct {
	Type   string `json:"type"`
	Site   Site   `json:"site"`
	Reason string `json:"reason"`
	Args   string `json:"args,omitempty"`
}

type BreakStmtJSON struct {
	Type string `json:"type"`
	Site Site   `json:"site"`
}

type ContinueStmtJSON struct {
	Type string `json:"type"`
	Site Site   `json:"site"`
}

type RawStmtJSON struct {
	Type string `json:"type"`
	Site Site   `json:"site"`
	Text string `json:"text"`
}

type CommentJSON struct {
	Type string `json:"type"`
	Site Site   `json:"site"`
	Text string `json:"text"`
}

type SignalSendStmtJSON struct {
	Type     string           `json:"type"`
	Site     Site             `json:"site"`
	Head     SendHeadJSON     `json:"head"`
	Signal   string           `json:"signal"`
	Args     string           `json:"args,omitempty"`
	Resolved *ResolvedRefJSON `json:"resolved,omitempty"`
}

// SendHeadJSON is a signal send's head: a workflow type (Package, Type, and an
// Address) or a handle (Handle). Kind is "type" or "handle".
type SendHeadJSON struct {
	Kind    string       `json:"kind"`
	Site    Site         `json:"site"`
	Package string       `json:"package,omitempty"`
	Type    string       `json:"type,omitempty"`
	Handle  string       `json:"handle,omitempty"`
	Address *AddressJSON `json:"address,omitempty"`
	// External is set on a type head through an import of a package absent
	// from the tree: carried unchecked, so its target is never resolved.
	External bool `json:"external,omitempty"`
}

// AddressJSON is the id: / run_id: block under a type-headed send.
type AddressJSON struct {
	Site  Site        `json:"site"`
	ID    IDValueJSON `json:"id"`
	RunID string      `json:"runId,omitempty"`
}

// IDValueJSON is an address's id: value. Kind is "literal" (Literal, Parts),
// "parent", or "name" (Name).
type IDValueJSON struct {
	Kind    string   `json:"kind"`
	Literal string   `json:"literal,omitempty"`
	Parts   []string `json:"parts,omitempty"`
	Name    string   `json:"name,omitempty"`
}

// IDSchemeJSON is a workflow type's id_scheme: template and its hole paths.
type IDSchemeJSON struct {
	Site     Site     `json:"site"`
	Template string   `json:"template"`
	Holes    []string `json:"holes,omitempty"`
}

type PromiseStmtJSON struct {
	Type   string          `json:"type"`
	Site   Site            `json:"site"`
	Name   string          `json:"name"`
	Target AsyncTargetJSON `json:"target"`
}

type SetStmtJSON struct {
	Type string `json:"type"`
	Site Site   `json:"site"`
	Name string `json:"name"`
}

type UnsetStmtJSON struct {
	Type string `json:"type"`
	Site Site   `json:"site"`
	Name string `json:"name"`
}

type NexusCallJSON struct {
	Type           string            `json:"type"`
	Site           Site              `json:"site"`
	Detach         bool              `json:"detach,omitempty"`
	Endpoint       string            `json:"endpoint"`
	ServicePackage string            `json:"servicePackage,omitempty"`
	Service        string            `json:"service"`
	Operation      string            `json:"operation"`
	Args           string            `json:"args"`
	Result         string            `json:"result,omitempty"`
	Options        *OptionsBlockJSON `json:"options,omitempty"`
	// Resolution links
	ResolvedEndpoint          *ResolvedRefJSON `json:"resolvedEndpoint,omitempty"`
	ResolvedEndpointNamespace string           `json:"resolvedEndpointNamespace,omitempty"`
	ResolvedService           *ResolvedRefJSON `json:"resolvedService,omitempty"`
	ResolvedOperation         *ResolvedRefJSON `json:"resolvedOperation,omitempty"`
}

// NexusOperationJSON is the JSON representation of a nexus operation.
type NexusOperationJSON struct {
	OpType          string         `json:"opType"`
	Site            Site           `json:"site"`
	Name            string         `json:"name"`
	WorkflowPackage string         `json:"workflowPackage,omitempty"`
	WorkflowName    string         `json:"workflowName,omitempty"`
	Params          string         `json:"params,omitempty"`
	ReturnType      string         `json:"returnType,omitempty"`
	Body            []RawStatement `json:"body,omitempty"`
}

// NexusServiceDefJSON is the JSON representation of NexusServiceDef.
type NexusServiceDefJSON struct {
	Type string `json:"type"`
	Site Site   `json:"site"`
	Name string `json:"name"`
	// QualifiedName is the name element of this definition's graph node ID
	// (`pkg.Name`); absent for a default-package definition, whose graph name
	// is the bare Name. Join graph nodes to definitions on it (issue #184).
	// Its operations' graph names are `${qualifiedName ?? name}.${op}`.
	QualifiedName string `json:"qualifiedName,omitempty"`
	// PackageID is the owning package's identity, a key into the envelope's
	// packages table; absent for the default package.
	PackageID  string                `json:"packageId,omitempty"`
	Operations []*NexusOperationJSON `json:"operations,omitempty"`
}

func (m marshaller) nexusServiceDef(n *NexusServiceDef) (json.RawMessage, error) {
	nj := NexusServiceDefJSON{
		Type:          "nexusServiceDef",
		Site:          m.site(n),
		Name:          n.Name,
		QualifiedName: qualifiedNameJSON(PackageIDOf(n, nil), n.Name),
		PackageID:     PackageIDOf(n, nil),
	}
	for _, op := range n.Operations {
		opj := &NexusOperationJSON{
			Site:            m.site(op),
			Name:            op.Name,
			WorkflowPackage: op.Workflow.Package,
			WorkflowName:    op.Workflow.Name,
			Params:          op.Params,
			ReturnType:      op.ReturnType,
		}
		if op.OpType == NexusOpAsync {
			opj.OpType = "async"
		} else {
			opj.OpType = "sync"
		}
		var err error
		if opj.Body, err = m.statements(op.Body); err != nil {
			return nil, err
		}
		nj.Operations = append(nj.Operations, opj)
	}
	return json.Marshal(nj)
}
