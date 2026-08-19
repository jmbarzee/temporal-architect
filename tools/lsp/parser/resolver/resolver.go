package resolver

import (
	"fmt"
	"strings"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
)

// ErrorKind classifies a resolve error for structured handling.
type ErrorKind int

const (
	// --- Duplicate definition errors ---

	// ErrDuplicateWorkflow: a workflow name appears more than once.
	ErrDuplicateWorkflow ErrorKind = iota + 1
	// ErrDuplicateActivity: an activity name appears more than once.
	ErrDuplicateActivity
	// ErrDuplicateWorker: a worker name appears more than once.
	ErrDuplicateWorker
	// ErrDuplicateNamespace: a namespace name appears more than once.
	ErrDuplicateNamespace
	// ErrDuplicateNexusService: a nexus service name appears more than once.
	ErrDuplicateNexusService
	// ErrDuplicateEndpoint: a nexus endpoint name appears in more than one namespace.
	ErrDuplicateEndpoint

	// --- Undefined reference errors ---

	// ErrUndefinedActivity: an activity call references a name with no definition.
	ErrUndefinedActivity
	// ErrUndefinedWorkflow: a workflow call references a name with no definition.
	ErrUndefinedWorkflow
	// ErrUndefinedSignal: an await/promise target references an undefined signal.
	ErrUndefinedSignal
	// ErrUndefinedUpdate: an await/promise target references an undefined update.
	ErrUndefinedUpdate
	// ErrUndefinedCondition: a set/unset statement references an undefined condition.
	ErrUndefinedCondition
	// ErrUndefinedPromiseOrCondition: an ident target matches neither a promise nor a condition.
	ErrUndefinedPromiseOrCondition
	// ErrConditionResultBinding: a condition target has a result binding (-> identifier), which is not allowed.
	ErrConditionResultBinding

	// --- Cross-workflow signal send errors ---

	// ErrSignalSendHandleNotWorkflow: a signal-send handle resolves to a promise
	// that is not workflow-bound (the handle must come from `promise h <- workflow X(args)`).
	ErrSignalSendHandleNotWorkflow
	// ErrSignalSendUndefinedSignal: the target workflow does not declare the named signal.
	ErrSignalSendUndefinedSignal

	// --- Nexus resolution errors ---

	// ErrNexusAsyncUndefinedWorkflow: an async nexus operation references an undefined workflow.
	ErrNexusAsyncUndefinedWorkflow
	// ErrNexusUndefinedEndpoint: a nexus call references an endpoint not defined in any namespace.
	ErrNexusUndefinedEndpoint
	// ErrNexusUndefinedService: a nexus call references a service name with no definition.
	ErrNexusUndefinedService
	// ErrNexusNoOperation: a nexus call references an operation not found on the resolved service.
	ErrNexusNoOperation

	// --- Worker reference errors ---

	// ErrWorkerUndefinedWorkflow: a worker registers an undefined workflow.
	ErrWorkerUndefinedWorkflow
	// ErrWorkerUndefinedActivity: a worker registers an undefined activity.
	ErrWorkerUndefinedActivity
	// ErrWorkerUndefinedNexusService: a worker registers an undefined nexus service.
	ErrWorkerUndefinedNexusService

	// --- Namespace reference errors ---

	// ErrNamespaceUndefinedWorker: a namespace references an undefined worker.
	ErrNamespaceUndefinedWorker

	// --- Import / package diagnostics (issue #109) ---

	// ErrUnusedImport: a bound import qualifier is never referenced in its
	// package. Warning severity.
	ErrUnusedImport
	// ErrQualifiedRefWithoutImport: a reference carries a package qualifier that
	// is neither the file's own package nor a bound import.
	ErrQualifiedRefWithoutImport
	// ErrUnresolvedImport: a bound import whose target package is absent from the
	// tree — treated as external, its qualified refs resolve as external with no
	// UNDEFINED_*. Warning severity.
	ErrUnresolvedImport
)

// ResolveError represents a resolution error with position info.
type ResolveError struct {
	Msg      string
	Line     int
	Column   int
	Severity string // "error" (default) or "warning"
	Kind     ErrorKind
	Name     string // primary entity referenced by this error
}

func (e *ResolveError) Error() string {
	return fmt.Sprintf("resolve error at %d:%d: %s", e.Line, e.Column, e.Msg)
}

// Code returns the symbolic, stable identifier for this error kind.
// It is suitable for emission in structured diagnostics and as an LSP
// Diagnostic.Code, and forms a 1:1 mapping with the ErrorKind enum.
func (e *ResolveError) Code() string { return e.Kind.String() }

// String returns the symbolic name of an ErrorKind (e.g. "UNDEFINED_ACTIVITY").
// These names are part of the diagnostic contract and should not change
// without a coordinated bump across downstream consumers.
func (k ErrorKind) String() string {
	switch k {
	case ErrDuplicateWorkflow:
		return "DUPLICATE_WORKFLOW"
	case ErrDuplicateActivity:
		return "DUPLICATE_ACTIVITY"
	case ErrDuplicateWorker:
		return "DUPLICATE_WORKER"
	case ErrDuplicateNamespace:
		return "DUPLICATE_NAMESPACE"
	case ErrDuplicateNexusService:
		return "DUPLICATE_NEXUS_SERVICE"
	case ErrDuplicateEndpoint:
		return "DUPLICATE_ENDPOINT"
	case ErrUndefinedActivity:
		return "UNDEFINED_ACTIVITY"
	case ErrUndefinedWorkflow:
		return "UNDEFINED_WORKFLOW"
	case ErrUndefinedSignal:
		return "UNDEFINED_SIGNAL"
	case ErrUndefinedUpdate:
		return "UNDEFINED_UPDATE"
	case ErrUndefinedCondition:
		return "UNDEFINED_CONDITION"
	case ErrUndefinedPromiseOrCondition:
		return "UNDEFINED_PROMISE_OR_CONDITION"
	case ErrConditionResultBinding:
		return "CONDITION_RESULT_BINDING"
	case ErrSignalSendHandleNotWorkflow:
		return "SIGNAL_SEND_HANDLE_NOT_WORKFLOW"
	case ErrSignalSendUndefinedSignal:
		return "SIGNAL_SEND_UNDEFINED_SIGNAL"
	case ErrNexusAsyncUndefinedWorkflow:
		return "NEXUS_ASYNC_UNDEFINED_WORKFLOW"
	case ErrNexusUndefinedEndpoint:
		return "NEXUS_UNDEFINED_ENDPOINT"
	case ErrNexusUndefinedService:
		return "NEXUS_UNDEFINED_SERVICE"
	case ErrNexusNoOperation:
		return "NEXUS_NO_OPERATION"
	case ErrWorkerUndefinedWorkflow:
		return "WORKER_UNDEFINED_WORKFLOW"
	case ErrWorkerUndefinedActivity:
		return "WORKER_UNDEFINED_ACTIVITY"
	case ErrWorkerUndefinedNexusService:
		return "WORKER_UNDEFINED_NEXUS_SERVICE"
	case ErrNamespaceUndefinedWorker:
		return "NAMESPACE_UNDEFINED_WORKER"
	case ErrUnusedImport:
		return "UNUSED_IMPORT"
	case ErrQualifiedRefWithoutImport:
		return "QUALIFIED_REF_WITHOUT_IMPORT"
	case ErrUnresolvedImport:
		return "UNRESOLVED_IMPORT"
	}
	return "UNKNOWN"
}

// ---------------------------------------------------------------------------
// Package-aware keying
// ---------------------------------------------------------------------------

// pkgKey is the composite (package, name) key under which package-scoped
// definitions — workflows, activities, workers, namespaces, nexus services —
// are stored. Two same-named definitions in different packages are distinct
// keys, so they resolve (and later graph) as distinct nodes (F8). The empty
// package string is the implicit default package.
type pkgKey struct {
	pkg  string
	name string
}

// effPkg returns a definition's effective package: its runtime package stamp
// when present (set by the envelope merge), otherwise the file's own package.
// A single-file parse that never went through the merge leaves the stamp empty,
// so it falls back to file.Package — which keeps existing behaviour identical.
func effPkg(defPkg, filePkg string) string {
	if defPkg != "" {
		return defPkg
	}
	return filePkg
}

// leafName is the last "/"-separated segment of an import path — the package
// name a qualified reference uses (`import "acme/billing"` → "billing").
func leafName(path string) string {
	if i := strings.LastIndexByte(path, '/'); i >= 0 {
		return path[i+1:]
	}
	return path
}

// importBinding is one qualifier→target-package binding derived from an import
// declaration, scoped to the package the import was declared in.
type importBinding struct {
	qualifier string // alias, or the path's leaf when no alias
	targetPkg string // the leaf package name this qualifier resolves to
	external  bool   // true when targetPkg is absent from the parsed tree
	used      bool   // set once a reference resolves through this qualifier
	line      int
	column    int
}

// ---------------------------------------------------------------------------
// Resolver state
// ---------------------------------------------------------------------------

// state holds the whole-tree resolution context: the package-keyed definition
// maps, the flat-global endpoint map, the set of packages present in the tree,
// and the per-package import binding tables. Errors accumulate here so every
// pass appends to a single list.
type state struct {
	filePkg       string
	workflows     map[pkgKey]*ast.WorkflowDef
	activities    map[pkgKey]*ast.ActivityDef
	workers       map[pkgKey]*ast.WorkerDef
	namespaces    map[pkgKey]*ast.NamespaceDef
	nexusServices map[pkgKey]*ast.NexusServiceDef
	allEndpoints  map[string]*ast.NamespaceEndpoint
	packages      map[string]bool
	bindings      map[string]map[string]*importBinding // ownPkg → qualifier → binding
	imports       []*importBinding                     // ordered, for end-of-run diagnostics
	errs          []*ResolveError
}

// Resolve walks the AST, linking calls to their definitions. Resolution keys by
// (package, name): same-named definitions in different packages are distinct,
// endpoints stay flat-global, and cross-package references resolve through
// per-package import binding tables (issue #109). Returns a list of errors and
// warnings (empty on success).
func Resolve(file *ast.File) []*ResolveError {
	s := &state{
		filePkg:       file.Package,
		workflows:     map[pkgKey]*ast.WorkflowDef{},
		activities:    map[pkgKey]*ast.ActivityDef{},
		workers:       map[pkgKey]*ast.WorkerDef{},
		namespaces:    map[pkgKey]*ast.NamespaceDef{},
		nexusServices: map[pkgKey]*ast.NexusServiceDef{},
		allEndpoints:  map[string]*ast.NamespaceEndpoint{},
		packages:      map[string]bool{},
		bindings:      map[string]map[string]*importBinding{},
	}

	// Pass 1: collect definitions keyed by (package, name), duplicate-detecting
	// per key, and record which packages the tree contains.
	for _, def := range file.Definitions {
		switch d := def.(type) {
		case *ast.WorkflowDef:
			p := effPkg(d.Package, s.filePkg)
			s.packages[p] = true
			collectInto(s.workflows, pkgKey{p, d.Name}, d, "workflow", ErrDuplicateWorkflow, d.Line, d.Column, &s.errs)
		case *ast.ActivityDef:
			p := effPkg(d.Package, s.filePkg)
			s.packages[p] = true
			collectInto(s.activities, pkgKey{p, d.Name}, d, "activity", ErrDuplicateActivity, d.Line, d.Column, &s.errs)
		case *ast.WorkerDef:
			p := effPkg(d.Package, s.filePkg)
			s.packages[p] = true
			collectInto(s.workers, pkgKey{p, d.Name}, d, "worker", ErrDuplicateWorker, d.Line, d.Column, &s.errs)
		case *ast.NamespaceDef:
			p := effPkg(d.Package, s.filePkg)
			s.packages[p] = true
			collectInto(s.namespaces, pkgKey{p, d.Name}, d, "namespace", ErrDuplicateNamespace, d.Line, d.Column, &s.errs)
		case *ast.NexusServiceDef:
			p := effPkg(d.Package, s.filePkg)
			s.packages[p] = true
			collectInto(s.nexusServices, pkgKey{p, d.Name}, d, "nexus service", ErrDuplicateNexusService, d.Line, d.Column, &s.errs)
		}
	}

	// Build the flat-global endpoint map across all namespaces. Endpoints are
	// never package-qualified; a duplicate endpoint name across any two
	// namespaces (in any package) stays a hard error.
	for _, ns := range s.namespaces {
		for i := range ns.Endpoints {
			ep := &ns.Endpoints[i]
			ep.Namespace = ns.Name
			ep.TaskQueue = endpointTaskQueue(ep.Options)
			if existing, exists := s.allEndpoints[ep.EndpointName]; exists {
				s.errs = append(s.errs, &ResolveError{
					Msg:    fmt.Sprintf("duplicate nexus endpoint name %q: defined in namespace %s and namespace %s", ep.EndpointName, existing.Namespace, ns.Name),
					Line:   ep.Line,
					Column: ep.Column,
					Kind:   ErrDuplicateEndpoint,
					Name:   ep.EndpointName,
				})
			}
			s.allEndpoints[ep.EndpointName] = ep
		}
	}

	// Build per-package import binding tables. A qualifier is the alias when
	// present, otherwise the path's leaf; the target package is the leaf; the
	// import is external when that package is absent from the tree.
	for _, imp := range file.Imports {
		p := effPkg(imp.Package, s.filePkg)
		leaf := leafName(imp.Path)
		q := imp.Alias
		if q == "" {
			q = leaf
		}
		b := &importBinding{
			qualifier: q,
			targetPkg: leaf,
			external:  !s.packages[leaf],
			line:      imp.Line,
			column:    imp.Column,
		}
		if s.bindings[p] == nil {
			s.bindings[p] = map[string]*importBinding{}
		}
		s.bindings[p][q] = b
		s.imports = append(s.imports, b)
	}

	// Continue to Pass 2 even if there are duplicate definition errors — this
	// provides better diagnostics by also reporting undefined references.

	// Pass 2: walk workflow bodies, resolving references.
	for _, def := range file.Definitions {
		wf, ok := def.(*ast.WorkflowDef)
		if !ok {
			continue
		}
		ownPkg := effPkg(wf.Package, s.filePkg)

		signals := make(map[string]*ast.SignalDecl)
		queries := make(map[string]*ast.QueryDecl)
		updates := make(map[string]*ast.UpdateDecl)
		for _, sig := range wf.Signals {
			signals[sig.Name] = sig
		}
		for _, q := range wf.Queries {
			queries[q.Name] = q
		}
		for _, u := range wf.Updates {
			updates[u.Name] = u
		}

		conditions := make(map[string]*ast.ConditionDecl)
		if wf.State != nil {
			for _, c := range wf.State.Conditions {
				conditions[c.Name] = c
			}
		}

		promises := make(map[string]*ast.PromiseStmt)
		for _, stmt := range wf.Body {
			if p, ok := stmt.(*ast.PromiseStmt); ok {
				promises[p.Name] = p
			}
		}

		ctx := &resolveCtx{
			s:          s,
			ownPkg:     ownPkg,
			signals:    signals,
			queries:    queries,
			updates:    updates,
			conditions: conditions,
			promises:   promises,
		}

		for _, sig := range wf.Signals {
			ctx.resolveStatements(sig.Body)
		}
		for _, q := range wf.Queries {
			ctx.resolveStatements(q.Body)
		}
		for _, u := range wf.Updates {
			ctx.resolveStatements(u.Body)
		}
		ctx.resolveStatements(wf.Body)
	}

	// Pass 2b: resolve nexus service operation bodies / async backing workflows.
	for _, def := range file.Definitions {
		svc, ok := def.(*ast.NexusServiceDef)
		if !ok {
			continue
		}
		svcPkg := effPkg(svc.Package, s.filePkg)
		for _, op := range svc.Operations {
			switch op.OpType {
			case ast.NexusOpAsync:
				targetPkg, external, ok := s.resolveQualifier(svcPkg, op.Workflow.Package, op.Line, op.Column)
				if !ok || external {
					// Missing-import error already emitted, or the workflow lives
					// in an external package — leave it unresolved without a
					// UNDEFINED_* error.
					continue
				}
				if wf, found := s.workflows[pkgKey{targetPkg, op.Workflow.Name}]; found {
					op.Workflow.Resolved = wf
				} else {
					s.errs = append(s.errs, &ResolveError{
						Msg:    fmt.Sprintf("nexus service %s: async operation %s references undefined workflow: %s", svc.Name, op.Name, op.Workflow.Name),
						Line:   op.Line,
						Column: op.Column,
						Kind:   ErrNexusAsyncUndefinedWorkflow,
						Name:   op.Workflow.Name,
					})
				}
			case ast.NexusOpSync:
				syncCtx := &resolveCtx{
					s:          s,
					ownPkg:     svcPkg,
					signals:    map[string]*ast.SignalDecl{},
					queries:    map[string]*ast.QueryDecl{},
					updates:    map[string]*ast.UpdateDecl{},
					conditions: map[string]*ast.ConditionDecl{},
					promises:   map[string]*ast.PromiseStmt{},
				}
				syncCtx.resolveStatements(op.Body)
			}
		}
	}

	// Pass 3: resolve worker and namespace references, package-scoped.
	for _, w := range s.workers {
		wPkg := effPkg(w.Package, s.filePkg)
		for i := range w.Workflows {
			resolvePkgRef(s, wPkg, &w.Workflows[i], s.workflows, "workflow", ErrWorkerUndefinedWorkflow)
		}
		for i := range w.Activities {
			resolvePkgRef(s, wPkg, &w.Activities[i], s.activities, "activity", ErrWorkerUndefinedActivity)
		}
		for i := range w.Services {
			resolvePkgRef(s, wPkg, &w.Services[i], s.nexusServices, "nexus service", ErrWorkerUndefinedNexusService)
		}
	}

	for _, ns := range s.namespaces {
		nsPkg := effPkg(ns.Package, s.filePkg)
		for i := range ns.Workers {
			nw := &ns.Workers[i]
			targetPkg, external, ok := s.resolveQualifier(nsPkg, nw.Worker.Package, nw.Line, nw.Column)
			if !ok || external {
				continue
			}
			if def, found := s.workers[pkgKey{targetPkg, nw.Worker.Name}]; found {
				nw.Worker.Resolved = def
			} else {
				s.errs = append(s.errs, &ResolveError{
					Msg:    fmt.Sprintf("namespace %s references undefined worker: %s", ns.Name, nw.Worker.Name),
					Line:   nw.Line,
					Column: nw.Column,
					Kind:   ErrNamespaceUndefinedWorker,
					Name:   nw.Worker.Name,
				})
			}
		}
	}

	// End-of-run import diagnostics. An external import is reported as
	// "treated as external"; a resolved import that was never referenced is
	// reported as unused. (An external import subsumes the unused signal — the
	// external warning is the more informative one.)
	for _, b := range s.imports {
		switch {
		case b.external:
			s.errs = append(s.errs, &ResolveError{
				Msg:      fmt.Sprintf("import %q is unresolved (no package %q in the tree); treated as external", b.qualifier, b.targetPkg),
				Severity: "warning",
				Line:     b.line,
				Column:   b.column,
				Kind:     ErrUnresolvedImport,
				Name:     b.qualifier,
			})
		case !b.used:
			s.errs = append(s.errs, &ResolveError{
				Msg:      fmt.Sprintf("unused import: %q is never referenced", b.qualifier),
				Severity: "warning",
				Line:     b.line,
				Column:   b.column,
				Kind:     ErrUnusedImport,
				Name:     b.qualifier,
			})
		}
	}

	return s.errs
}

// resolveQualifier maps a reference's package qualifier to the package its name
// should be looked up in, for a reference written in ownPkg.
//
//   - empty or ownPkg → same package (targetPkg = ownPkg, not external).
//   - a bound import qualifier → its target package; external is true when that
//     package is absent from the tree. The binding is marked used.
//   - anything else → QUALIFIED_REF_WITHOUT_IMPORT error; ok is false so the
//     caller leaves the reference unresolved without a second diagnostic.
func (s *state) resolveQualifier(ownPkg, q string, line, column int) (targetPkg string, external, ok bool) {
	if q == "" || q == ownPkg {
		return ownPkg, false, true
	}
	if b := s.bindings[ownPkg][q]; b != nil {
		b.used = true
		return b.targetPkg, b.external, true
	}
	s.errs = append(s.errs, &ResolveError{
		Msg:    fmt.Sprintf("qualified reference uses package %q with no matching import in package %q", q, ownPkg),
		Line:   line,
		Column: column,
		Kind:   ErrQualifiedRefWithoutImport,
		Name:   q,
	})
	return "", false, false
}

// resolveCtx is the per-runnable resolution context: a back-reference to the
// whole-tree state, the package the runnable belongs to, and its workflow-local
// symbol tables (signals/queries/updates/conditions/promises), which are never
// package-qualified.
type resolveCtx struct {
	s          *state
	ownPkg     string
	signals    map[string]*ast.SignalDecl
	queries    map[string]*ast.QueryDecl
	updates    map[string]*ast.UpdateDecl
	conditions map[string]*ast.ConditionDecl
	promises   map[string]*ast.PromiseStmt
}

func (c *resolveCtx) resolveStatements(stmts []ast.Statement) {
	ast.WalkStatements(stmts, func(s ast.Statement) bool {
		switch s := s.(type) {
		case *ast.ActivityCall:
			resolvePkgRef(c.s, c.ownPkg, &s.Activity, c.s.activities, "activity", ErrUndefinedActivity)
		case *ast.WorkflowCall:
			resolvePkgRef(c.s, c.ownPkg, &s.Workflow, c.s.workflows, "workflow", ErrUndefinedWorkflow)
		case *ast.NexusCall:
			c.resolveNexusRefs(&s.Endpoint, &s.Service, &s.Operation)
		case *ast.SetStmt:
			resolveLocalRef(&s.Condition, c.conditions, "condition", ErrUndefinedCondition, &c.s.errs)
		case *ast.UnsetStmt:
			resolveLocalRef(&s.Condition, c.conditions, "condition", ErrUndefinedCondition, &c.s.errs)
		case *ast.SignalSendStmt:
			c.resolveSignalSend(s)
		}
		return true
	}, ast.WithAsyncTargets(func(target ast.AsyncTarget, parent ast.Statement) bool {
		c.resolveAsyncTarget(target, parent.NodeLine(), parent.NodeColumn())
		return true
	}))
}

// resolveNexusRefs validates and resolves a nexus call site's endpoint, service,
// and operation Ref fields. Endpoints are flat-global and never
// package-qualified; the service is package-scoped and may resolve as external
// through an unresolved import (in which case the operation can't be checked).
func (c *resolveCtx) resolveNexusRefs(endpoint *ast.Ref[*ast.NamespaceEndpoint], service *ast.Ref[*ast.NexusServiceDef], operation *ast.Ref[*ast.NexusOperation]) {
	if ep, ok := c.s.allEndpoints[endpoint.Name]; ok {
		endpoint.Resolved = ep
	} else {
		c.s.errs = append(c.s.errs, &ResolveError{
			Msg:    fmt.Sprintf("undefined nexus endpoint: %s", endpoint.Name),
			Line:   endpoint.Line,
			Column: endpoint.Column,
			Kind:   ErrNexusUndefinedEndpoint,
			Name:   endpoint.Name,
		})
	}

	targetPkg, external, ok := c.s.resolveQualifier(c.ownPkg, service.Package, service.Line, service.Column)
	if !ok || external {
		return
	}
	if svc, found := c.s.nexusServices[pkgKey{targetPkg, service.Name}]; found {
		service.Resolved = svc
		c.resolveNexusOperation(svc, operation)
	} else {
		c.s.errs = append(c.s.errs, &ResolveError{
			Msg:    fmt.Sprintf("undefined nexus service: %s", service.Name),
			Line:   service.Line,
			Column: service.Column,
			Kind:   ErrNexusUndefinedService,
			Name:   service.Name,
		})
	}
}

// resolveNexusOperation resolves an operation name against a service's operation list.
func (c *resolveCtx) resolveNexusOperation(svc *ast.NexusServiceDef, operation *ast.Ref[*ast.NexusOperation]) {
	for _, op := range svc.Operations {
		if op.Name == operation.Name {
			operation.Resolved = op
			return
		}
	}
	c.s.errs = append(c.s.errs, &ResolveError{
		Msg:    fmt.Sprintf("nexus service %s has no operation %s", svc.Name, operation.Name),
		Line:   operation.Line,
		Column: operation.Column,
		Kind:   ErrNexusNoOperation,
		Name:   operation.Name,
	})
}

// resolveAsyncTarget resolves references inside an async target.
func (c *resolveCtx) resolveAsyncTarget(target ast.AsyncTarget, line, column int) {
	switch t := target.(type) {
	case *ast.SignalTarget:
		resolveLocalRef(&t.Signal, c.signals, "signal", ErrUndefinedSignal, &c.s.errs)
	case *ast.UpdateTarget:
		resolveLocalRef(&t.Update, c.updates, "update", ErrUndefinedUpdate, &c.s.errs)
	case *ast.ActivityTarget:
		resolvePkgRef(c.s, c.ownPkg, &t.Activity, c.s.activities, "activity", ErrUndefinedActivity)
	case *ast.WorkflowTarget:
		resolvePkgRef(c.s, c.ownPkg, &t.Workflow, c.s.workflows, "workflow", ErrUndefinedWorkflow)
	case *ast.NexusTarget:
		c.resolveNexusRefs(&t.Endpoint, &t.Service, &t.Operation)
	case *ast.IdentTarget:
		promise, isPromise := c.promises[t.Name]
		condition, isCondition := c.conditions[t.Name]
		if !isPromise && !isCondition {
			c.s.errs = append(c.s.errs, &ResolveError{
				Msg:    fmt.Sprintf("undefined promise or condition: %s", t.Name),
				Line:   line,
				Column: column,
				Kind:   ErrUndefinedPromiseOrCondition,
				Name:   t.Name,
			})
		}
		if isPromise {
			t.Resolved.Promise = promise
		}
		if isCondition {
			t.Resolved.Condition = condition
		}
		if isCondition && t.Result != "" {
			c.s.errs = append(c.s.errs, &ResolveError{
				Msg:    fmt.Sprintf("condition %q cannot have a result binding (-> identifier)", t.Name),
				Line:   line,
				Column: column,
				Kind:   ErrConditionResultBinding,
				Name:   t.Name,
			})
		}
	case *ast.TimerTarget:
		// No resolution needed for timers
	}
}

// resolveSignalSend resolves a cross-workflow signal send. The handle must be a
// workflow-bound promise, and the target workflow must declare the named signal.
// On full success the handle's Resolved pointer is linked to the promise so the
// graph and JSON layers can reach the target workflow.
func (c *resolveCtx) resolveSignalSend(s *ast.SignalSendStmt) {
	promise, ok := c.promises[s.Handle.Name]
	if !ok {
		c.s.errs = append(c.s.errs, &ResolveError{
			Msg:    fmt.Sprintf("undefined promise or condition: %s", s.Handle.Name),
			Line:   s.Handle.Line,
			Column: s.Handle.Column,
			Kind:   ErrUndefinedPromiseOrCondition,
			Name:   s.Handle.Name,
		})
		return
	}

	wt, ok := promise.Target.(*ast.WorkflowTarget)
	if !ok {
		c.s.errs = append(c.s.errs, &ResolveError{
			Msg:    fmt.Sprintf("signal-send handle %q is not a workflow-bound promise; the handle must come from `promise %s <- workflow X(args)`", s.Handle.Name, s.Handle.Name),
			Line:   s.Handle.Line,
			Column: s.Handle.Column,
			Kind:   ErrSignalSendHandleNotWorkflow,
			Name:   s.Handle.Name,
		})
		return
	}

	// The target workflow name itself is unresolved — the promise's own
	// workflow-call resolution already reported it. Degrade gracefully rather
	// than double-reporting or verifying the signal against a nil target.
	if wt.Workflow.Resolved == nil {
		return
	}

	for _, sig := range wt.Workflow.Resolved.Signals {
		if sig.Name == s.Signal {
			s.Handle.Resolved = promise
			return
		}
	}

	c.s.errs = append(c.s.errs, &ResolveError{
		Msg:    fmt.Sprintf("signal %q is not declared by workflow %s", s.Signal, wt.Workflow.Resolved.Name),
		Line:   s.Line,
		Column: s.Column,
		Kind:   ErrSignalSendUndefinedSignal,
		Name:   s.Signal,
	})
}

// collectInto registers a definition under its (package, name) key, appending a
// duplicate error (per key, so same-named defs in different packages coexist)
// if the key already exists.
func collectInto[T any](m map[pkgKey]T, key pkgKey, def T, kind string, errKind ErrorKind, line, column int, errs *[]*ResolveError) {
	if _, exists := m[key]; exists {
		*errs = append(*errs, &ResolveError{
			Msg:    fmt.Sprintf("duplicate %s definition: %s", kind, key.name),
			Line:   line,
			Column: column,
			Kind:   errKind,
			Name:   key.name,
		})
	}
	m[key] = def
}

// resolvePkgRef resolves a package-scoped reference (activity / workflow / nexus
// service / worker) against a (package, name) map, honouring the ref's package
// qualifier. A qualifier bound to an external (unresolved) import leaves the ref
// unresolved with no UNDEFINED_* error; a missing import is reported by
// resolveQualifier; a same/imported-package name that is genuinely absent is an
// undefined-reference error.
func resolvePkgRef[T any](s *state, ownPkg string, ref *ast.Ref[T], defs map[pkgKey]T, kind string, errKind ErrorKind) {
	targetPkg, external, ok := s.resolveQualifier(ownPkg, ref.Package, ref.Line, ref.Column)
	if !ok || external {
		return
	}
	if def, found := defs[pkgKey{targetPkg, ref.Name}]; found {
		ref.Resolved = def
		return
	}
	s.errs = append(s.errs, &ResolveError{
		Msg:    fmt.Sprintf("undefined %s: %s", kind, ref.Name),
		Line:   ref.Line,
		Column: ref.Column,
		Kind:   errKind,
		Name:   ref.Name,
	})
}

// resolveLocalRef resolves a workflow-local reference (signal / update /
// condition) against a bare-name map. These names are never package-qualified,
// so any qualifier is ignored.
func resolveLocalRef[T any](ref *ast.Ref[T], defs map[string]T, kind string, errKind ErrorKind, errs *[]*ResolveError) {
	if def, ok := defs[ref.Name]; ok {
		ref.Resolved = def
		return
	}
	*errs = append(*errs, &ResolveError{
		Msg:    fmt.Sprintf("undefined %s: %s", kind, ref.Name),
		Line:   ref.Line,
		Column: ref.Column,
		Kind:   errKind,
		Name:   ref.Name,
	})
}

// endpointTaskQueue extracts the task_queue value from an options block, or ""
// if absent. Nil-safe. Mirrors graph.taskQueue / validator.extractTaskQueue —
// kept local so the resolver package doesn't take a cross-package dependency.
func endpointTaskQueue(opts *ast.OptionsBlock) string {
	if opts == nil {
		return ""
	}
	for _, e := range opts.Entries {
		if e.Key == "task_queue" {
			return e.Value
		}
	}
	return ""
}
