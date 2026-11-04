package resolver

import (
	"fmt"
	"maps"
	"slices"
	"strings"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/module"
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

	// --- Workflow ID scheme / addressed send errors ---

	// ErrTypeNeedsID: a send headed by a workflow type carries no `id:`.
	ErrTypeNeedsID
	// ErrHandleTakesNoID: a send headed by a handle carries an address.
	ErrHandleTakesNoID
	// ErrNoIDScheme: a literal `id:` names a type that declares no id_scheme.
	ErrNoIDScheme
	// ErrIDMirrorMismatch: a literal `id:` differs from the type's scheme in
	// fixed text or hole count.
	ErrIDMirrorMismatch
	// ErrMirrorCopiedFromScheme: a literal's holes are byte-equal to the scheme's
	// and none is rooted in the sender's params — likely pasted, not mirrored.
	// Hint severity.
	ErrMirrorCopiedFromScheme
	// ErrReservedName: `parent` declared as a param, binding, promise, or
	// condition; it is reserved so `id: parent` has one meaning.
	ErrReservedName

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
	// ErrWorkerRegistersOperation: a worker `nexus service` entry names an
	// operation (`Svc.Op`, `pkg.Svc.Op`). A worker registers whole services.
	ErrWorkerRegistersOperation

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

	// --- Parameterized-family errors (issue #100) ---

	// ErrEndpointParamNotSuperset: a nexus endpoint's template-param set is not a
	// superset of its owning namespace's. The endpoint's flat-global name would
	// then collide across the namespace family (e.g. a static endpoint inside a
	// `fabric-shard-{org}` namespace resolves to one name for every org).
	ErrEndpointParamNotSuperset

	// --- Per-instance worker family errors (issue #229) ---

	// ErrQueueTemplateMalformed: a worker task_queue with an instance parameter
	// breaks a family rule (spec 03), so its placement drops out of routing.
	ErrQueueTemplateMalformed
	// ErrEndpointTaskQueueTemplated: an endpoint task_queue has a parameter; an
	// endpoint targets one static queue in its namespace.
	ErrEndpointTaskQueueTemplated

	// --- Module and package diagnostics (issue #232) ---
	//
	// The pipeline reports these before resolution, from the inputs' twf.mod
	// files and package clauses; each excludes files, except the warning and
	// the name mismatch.

	// ErrModuleFileInvalid: a twf.mod that cannot be used; its module's files
	// are excluded.
	ErrModuleFileInvalid
	// ErrModuleFileUnknownDirective: a directive other than `module` in a valid
	// twf.mod, ignored. Warning severity.
	ErrModuleFileUnknownDirective
	// ErrPackageOutsideModule: an on-disk file with a package clause and no
	// twf.mod above it; the file is excluded.
	ErrPackageOutsideModule
	// ErrDuplicateModule: a second module root declaring a module path already
	// in the run; the later module's files are excluded.
	ErrDuplicateModule
	// ErrPackageClauseConflict: a directory whose files declare different
	// packages, or mix a clause with clause-less files; the losers are excluded.
	ErrPackageClauseConflict
	// ErrInvalidPackagePath: a package directory whose derived import path is
	// not a valid path; the package is excluded.
	ErrInvalidPackagePath
	// ErrDuplicatePackage: two directories yielding one package path, or two
	// paths differing only in case; all but one directory are excluded.
	ErrDuplicatePackage
	// ErrPackageNameMismatch: a declared package name other than its path's
	// assumed name, when that name is usable.
	ErrPackageNameMismatch

	// --- Import resolution by path (issue #232) ---

	// ErrInvalidImportPath: an import path that is not a valid path (or is a
	// local one).
	ErrInvalidImportPath
	// ErrSelfImport: a package importing its own path.
	ErrSelfImport
	// ErrImportNeedsAlias: an import with no alias whose path's assumed name
	// cannot be a package name.
	ErrImportNeedsAlias
	// ErrDuplicateImportName: an import qualifier that is the package's own
	// name, or is already bound to a different path.
	ErrDuplicateImportName
	// ErrImportNotLoaded: a path whose package is on disk but not among the
	// inputs; treated as external. Warning severity.
	ErrImportNotLoaded
	// ErrImportNotFound: a path under a known module with no such package.
	ErrImportNotFound
)

// ResolveError represents a resolution error with position info.
type ResolveError struct {
	Msg      string
	Line     int
	Column   int
	Severity string // "error" (default), "warning", or "hint"
	Kind     ErrorKind
	Name     string // primary entity referenced by this error
	// File is the base name of the source file this error is attributed to
	// (issue #136): the enclosing definition's SourceFile for a reference error,
	// the redeclaration's own file for a duplicate, or the import's file for an
	// import warning. It is the reference-site file even when Name points at a
	// symbol defined elsewhere, so consumers must prefer it over reverse-
	// engineering the file from Name. Empty when the merge left the enclosing
	// node's SourceFile unstamped (e.g. a raw single-file parse).
	File string
	// Qualifier is the package qualifier as written, for an undefined
	// reference into another package (`fabric.Setup`); empty for a bare or
	// self-qualified one.
	Qualifier string
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
	case ErrTypeNeedsID:
		return "TYPE_NEEDS_ID"
	case ErrHandleTakesNoID:
		return "HANDLE_TAKES_NO_ID"
	case ErrNoIDScheme:
		return "NO_ID_SCHEME"
	case ErrIDMirrorMismatch:
		return "ID_MIRROR_MISMATCH"
	case ErrMirrorCopiedFromScheme:
		return "MIRROR_COPIED_FROM_SCHEME"
	case ErrReservedName:
		return "RESERVED_NAME"
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
	case ErrWorkerRegistersOperation:
		return "WORKER_REGISTERS_OPERATION"
	case ErrNamespaceUndefinedWorker:
		return "NAMESPACE_UNDEFINED_WORKER"
	case ErrUnusedImport:
		return "UNUSED_IMPORT"
	case ErrQualifiedRefWithoutImport:
		return "QUALIFIED_REF_WITHOUT_IMPORT"
	case ErrUnresolvedImport:
		return "UNRESOLVED_IMPORT"
	case ErrEndpointParamNotSuperset:
		return "ENDPOINT_PARAM_NOT_SUPERSET"
	case ErrQueueTemplateMalformed:
		return "QUEUE_TEMPLATE_MALFORMED"
	case ErrEndpointTaskQueueTemplated:
		return "ENDPOINT_TASK_QUEUE_TEMPLATED"
	case ErrModuleFileInvalid:
		return "MODULE_FILE_INVALID"
	case ErrModuleFileUnknownDirective:
		return "MODULE_FILE_UNKNOWN_DIRECTIVE"
	case ErrPackageOutsideModule:
		return "PACKAGE_OUTSIDE_MODULE"
	case ErrDuplicateModule:
		return "DUPLICATE_MODULE"
	case ErrPackageClauseConflict:
		return "PACKAGE_CLAUSE_CONFLICT"
	case ErrInvalidPackagePath:
		return "INVALID_PACKAGE_PATH"
	case ErrDuplicatePackage:
		return "DUPLICATE_PACKAGE"
	case ErrPackageNameMismatch:
		return "PACKAGE_NAME_MISMATCH"
	case ErrInvalidImportPath:
		return "INVALID_IMPORT_PATH"
	case ErrSelfImport:
		return "SELF_IMPORT"
	case ErrImportNeedsAlias:
		return "IMPORT_NEEDS_ALIAS"
	case ErrDuplicateImportName:
		return "DUPLICATE_IMPORT_NAME"
	case ErrImportNotLoaded:
		return "IMPORT_NOT_LOADED"
	case ErrImportNotFound:
		return "IMPORT_NOT_FOUND"
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

// importBinding is one qualifier→target-package binding derived from an import
// declaration, scoped to the package the import was declared in.
type importBinding struct {
	qualifier string // alias, or the path's assumed name when no alias
	targetPkg string // the identity of the package the path names
	path      string // the import path as written
	external  bool   // the path names a package outside the run (5.3, 5.5)
	// sink marks a failed import's qualifier: references through it resolve
	// silently as external, and it is never reported unused.
	sink bool
	// warning is the external import's diagnostic, reported at every line
	// binding this qualifier; it subsumes UNUSED_IMPORT.
	warning *ResolveError
	// failure is a failed lookup's error (IMPORT_NOT_FOUND), reported at every
	// line binding this qualifier to this path.
	failure *ResolveError
	used    bool      // set once a reference resolves through this qualifier
	lines   []lineRef // every import line binding this qualifier to this path
}

// lineRef is one import line's position and file (#136).
type lineRef struct {
	line, column int
	file         string
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
	// names maps a package identity to its declared name; paths maps a kept
	// package's import path to its identity; byName maps a declared name to
	// the identity of a package with no path (a virtual source's, or an
	// unstamped AST's), which an import still reaches by its assumed name.
	names    map[string]string
	paths    map[string]string
	pathOf   map[string]string // identity → import path
	moduleOf map[string]string // identity → module path
	byName   map[string]string
	// noQualifier lists, per package, the failed import lines that formed no
	// qualifier, for QUALIFIED_REF_WITHOUT_IMPORT to name.
	noQualifier map[string][]lineRef
	bindings    map[string]map[string]*importBinding // ownPkg → qualifier → binding
	imports     []*importBinding                     // ordered, for end-of-run diagnostics
	errs        []*ResolveError
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
		names:         map[string]string{},
		paths:         map[string]string{},
		pathOf:        map[string]string{},
		moduleOf:      map[string]string{},
		byName:        map[string]string{},
		noQualifier:   map[string][]lineRef{},
		bindings:      map[string]map[string]*importBinding{},
	}
	for _, p := range file.Packages {
		s.names[p.ID] = p.Name
		s.moduleOf[p.ID] = p.Module
		if p.Path != "" {
			s.paths[p.Path] = p.ID
			s.pathOf[p.ID] = p.Path
		}
	}

	// Pass 1: collect definitions keyed by (package, name), duplicate-detecting
	// per key, and record which packages the tree contains.
	for _, def := range file.Definitions {
		switch d := def.(type) {
		case *ast.WorkflowDef:
			p := effPkg(ast.PackageIDOf(d, nil), s.filePkg)
			s.notePackage(p, d.Package)
			collectInto(s.workflows, pkgKey{p, d.Name}, d, "workflow", ErrDuplicateWorkflow, d.Line, d.Column, d.SourceFile, &s.errs)
		case *ast.ActivityDef:
			p := effPkg(ast.PackageIDOf(d, nil), s.filePkg)
			s.notePackage(p, d.Package)
			collectInto(s.activities, pkgKey{p, d.Name}, d, "activity", ErrDuplicateActivity, d.Line, d.Column, d.SourceFile, &s.errs)
		case *ast.WorkerDef:
			p := effPkg(ast.PackageIDOf(d, nil), s.filePkg)
			s.notePackage(p, d.Package)
			collectInto(s.workers, pkgKey{p, d.Name}, d, "worker", ErrDuplicateWorker, d.Line, d.Column, d.SourceFile, &s.errs)
		case *ast.NamespaceDef:
			p := effPkg(ast.PackageIDOf(d, nil), s.filePkg)
			s.notePackage(p, d.Package)
			collectInto(s.namespaces, pkgKey{p, d.Name}, d, "namespace", ErrDuplicateNamespace, d.Line, d.Column, d.SourceFile, &s.errs)
		case *ast.NexusServiceDef:
			p := effPkg(ast.PackageIDOf(d, nil), s.filePkg)
			s.notePackage(p, d.Package)
			collectInto(s.nexusServices, pkgKey{p, d.Name}, d, "nexus service", ErrDuplicateNexusService, d.Line, d.Column, d.SourceFile, &s.errs)
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
			// An endpoint's template-param set must be a superset of its owning
			// namespace's, or its flat-global name collides across the family.
			if missing := paramsNotIn(ns.TemplateParams, ep.TemplateParams); len(missing) > 0 {
				s.errs = append(s.errs, &ResolveError{
					Msg:    fmt.Sprintf("nexus endpoint %q must be parameterized by all of namespace %s's template params; missing %s", ep.EndpointName, ns.Name, strings.Join(missing, ", ")),
					Line:   ep.Line,
					Column: ep.Column,
					Kind:   ErrEndpointParamNotSuperset,
					Name:   ep.EndpointName,
					File:   ns.SourceFile,
				})
			}
			if existing, exists := s.allEndpoints[ep.EndpointName]; exists {
				s.errs = append(s.errs, &ResolveError{
					Msg:    fmt.Sprintf("duplicate nexus endpoint name %q: defined in namespace %s and namespace %s", ep.EndpointName, existing.Namespace, ns.Name),
					Line:   ep.Line,
					Column: ep.Column,
					Kind:   ErrDuplicateEndpoint,
					Name:   ep.EndpointName,
					File:   ns.SourceFile,
				})
			}
			s.allEndpoints[ep.EndpointName] = ep
		}
	}

	// Per-instance families (spec 03): a {param} in a worker task_queue is an
	// instance parameter, and the queue must be a well-formed template. Name
	// parameters bind nothing there. An endpoint task_queue is static.
	for _, ns := range s.namespaces {
		for i := range ns.Workers {
			nw := &ns.Workers[i]
			e := taskQueueEntry(nw.Options)
			if e == nil {
				continue
			}
			nw.TemplateParams = ast.ExtractTemplateParams(e.Value)
			if q := ast.ParseDeployQueue(e.Value); q.Form == ast.QueueMalformed {
				s.errs = append(s.errs, &ResolveError{
					Msg:    fmt.Sprintf("task_queue %q of worker %s in namespace %s is not a well-formed template: %s", e.Value, nw.Worker.Name, ns.Name, q.Problem),
					Line:   e.Line,
					Column: e.Column,
					Kind:   ErrQueueTemplateMalformed,
					Name:   nw.Worker.Name,
					File:   ns.SourceFile,
				})
			}
		}
		for i := range ns.Endpoints {
			ep := &ns.Endpoints[i]
			e := taskQueueEntry(ep.Options)
			if e == nil {
				continue
			}
			if params := ast.ExtractTemplateParams(e.Value); len(params) > 0 {
				s.errs = append(s.errs, &ResolveError{
					Msg:    fmt.Sprintf("task_queue %q of nexus endpoint %s in namespace %s has a {%s} parameter: an endpoint targets one task queue in its namespace", e.Value, ep.EndpointName, ns.Name, params[0]),
					Line:   e.Line,
					Column: e.Column,
					Kind:   ErrEndpointTaskQueueTemplated,
					Name:   ep.EndpointName,
					File:   ns.SourceFile,
				})
			}
		}
	}

	// Build per-package import binding tables, checking each import line in
	// order (spec 14): a valid path, not the package's own, a usable qualifier,
	// not bound to another path; then the path resolves to the kept package
	// with exactly that path, or is external. A failed line binds nothing, but
	// its qualifier becomes a sink so references through it stay quiet.
	for _, imp := range file.Imports {
		s.bindImport(file, imp)
	}

	// Continue to Pass 2 even if there are duplicate definition errors — this
	// provides better diagnostics by also reporting undefined references.

	// Pass 2: walk workflow bodies, resolving references.
	for _, def := range file.Definitions {
		wf, ok := def.(*ast.WorkflowDef)
		if !ok {
			continue
		}
		ownPkg := effPkg(ast.PackageIDOf(wf, nil), s.filePkg)

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

		ctx := &resolveCtx{
			s:          s,
			ownPkg:     ownPkg,
			file:       wf.SourceFile,
			signals:    signals,
			queries:    queries,
			updates:    updates,
			conditions: conditions,
			promises:   map[string]*ast.PromiseStmt{},
			params:     ast.ParamNames(wf.Params),
		}

		s.checkReservedNames(wf)
		// The body resolves first, so a handler's send to a body promise
		// finds that promise's target already resolved.
		ctx.resolveStatements(wf.Body)
		handlerCtx := ctx.withPromises(topLevelPromises(wf.Body))
		for _, sig := range wf.Signals {
			handlerCtx.withParams(sig.Params).resolveStatements(sig.Body)
		}
		for _, q := range wf.Queries {
			handlerCtx.withParams(q.Params).resolveStatements(q.Body)
		}
		for _, u := range wf.Updates {
			handlerCtx.withParams(u.Params).resolveStatements(u.Body)
		}
	}

	// Pass 2b: resolve nexus service operation bodies / async backing workflows.
	for _, def := range file.Definitions {
		svc, ok := def.(*ast.NexusServiceDef)
		if !ok {
			continue
		}
		svcPkg := effPkg(ast.PackageIDOf(svc, nil), s.filePkg)
		for _, op := range svc.Operations {
			switch op.OpType {
			case ast.NexusOpAsync:
				targetPkg, external, ok := s.resolveQualifier(svcPkg, op.Workflow.Package, op.Line, op.Column, svc.SourceFile)
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
						File:   svc.SourceFile,
					})
				}
			case ast.NexusOpSync:
				syncCtx := &resolveCtx{
					s:          s,
					ownPkg:     svcPkg,
					file:       svc.SourceFile,
					signals:    map[string]*ast.SignalDecl{},
					queries:    map[string]*ast.QueryDecl{},
					updates:    map[string]*ast.UpdateDecl{},
					conditions: map[string]*ast.ConditionDecl{},
					promises:   map[string]*ast.PromiseStmt{},
					params:     ast.ParamNames(op.Params),
				}
				s.checkReservedIn(svc.SourceFile, []paramList{{op.Pos, op.Params}}, nil, [][]ast.Statement{op.Body})
				syncCtx.resolveStatements(op.Body)
			}
		}
	}

	// Pass 3: resolve worker and namespace references, package-scoped.
	for _, w := range s.workers {
		wPkg := effPkg(ast.PackageIDOf(w, nil), s.filePkg)
		for i := range w.Workflows {
			resolvePkgRef(s, wPkg, &w.Workflows[i], s.workflows, "workflow", ErrWorkerUndefinedWorkflow, w.SourceFile)
		}
		for i := range w.Activities {
			resolvePkgRef(s, wPkg, &w.Activities[i], s.activities, "activity", ErrWorkerUndefinedActivity, w.SourceFile)
		}
		s.readOperationMentions(w, wPkg)
		for i := range w.Services {
			resolvePkgRef(s, wPkg, &w.Services[i], s.nexusServices, "nexus service", ErrWorkerUndefinedNexusService, w.SourceFile)
			s.checkOperationMention(w, i)
		}
	}

	for _, ns := range s.namespaces {
		nsPkg := effPkg(ast.PackageIDOf(ns, nil), s.filePkg)
		for i := range ns.Workers {
			nw := &ns.Workers[i]
			targetPkg, external, ok := s.resolveQualifier(nsPkg, nw.Worker.Package, nw.Line, nw.Column, ns.SourceFile)
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
					File:   ns.SourceFile,
				})
			}
		}
	}

	// End-of-run import diagnostics: an external import's warning at every
	// line binding it (subsuming UNUSED_IMPORT), else UNUSED_IMPORT at every
	// line of a qualifier no file of the package used. Sinks report nothing.
	for _, b := range s.imports {
		for _, l := range b.lines {
			switch {
			case b.sink:
			case b.warning != nil:
				w := *b.warning
				w.Line, w.Column, w.File = l.line, l.column, l.file
				s.errs = append(s.errs, &w)
			case !b.used:
				s.errs = append(s.errs, &ResolveError{
					Msg:      fmt.Sprintf("unused import: %q is never referenced", b.qualifier),
					Severity: "warning",
					Line:     l.line,
					Column:   l.column,
					Kind:     ErrUnusedImport,
					Name:     b.qualifier,
					File:     l.file,
				})
			}
		}
	}

	return s.errs
}

// notePackage records that package identity p, declared as name, holds a
// definition. A package with no path (a virtual source's, or one an unstamped
// AST names by its declared name) is reachable by name.
func (s *state) notePackage(p, name string) {
	s.packages[p] = true
	if p == "" {
		return
	}
	if _, ok := s.names[p]; !ok {
		if name == "" {
			name = p
		}
		s.names[p] = name
	}
	if s.pathOf[p] == "" {
		s.byName[s.names[p]] = p
	}
}

// packageLabel names a package in a message: "package <name>", with its path
// when another package shares the name, or "the default package".
func (s *state) packageLabel(id string) string {
	if id == "" {
		return "the default package"
	}
	name := s.names[id]
	for other, n := range s.names {
		if other != id && n == name {
			return "package " + name + " (" + id + ")"
		}
	}
	return "package " + name
}

// bind records b as package x's binding for its qualifier.
func (s *state) bind(x string, b *importBinding) {
	if s.bindings[x] == nil {
		s.bindings[x] = map[string]*importBinding{}
	}
	s.bindings[x][b.qualifier] = b
	s.imports = append(s.imports, b)
}

// bindImport checks one import line of its package, in spec 14's order, and
// binds its qualifier. The first failing check reports and the line fails.
func (s *state) bindImport(file *ast.File, imp *ast.ImportDecl) {
	x := effPkg(ast.ImportPackageIDOf(imp, nil), s.filePkg)
	own := s.names[x]
	p := imp.Path
	at := lineRef{imp.Line, imp.Column, imp.SourceFile}
	qual := imp.Alias
	if qual == "" {
		if an := module.AssumedName(p); module.Usable(an) {
			qual = an
		}
	}
	report := func(kind ErrorKind, severity, msg string) {
		name := qual
		if name == "" {
			name = p
		}
		s.errs = append(s.errs, &ResolveError{Msg: msg, Severity: severity, Line: at.line, Column: at.column, Kind: kind, Name: name, File: at.file})
	}
	// fail reports a failed line; its qualifier, if it formed one and it is
	// not already bound, becomes a sink.
	fail := func(kind ErrorKind, msg string) {
		report(kind, "", msg)
		switch {
		case qual == "":
			s.noQualifier[x] = append(s.noQualifier[x], at)
		case qual == own || s.bindings[x][qual] != nil:
		default:
			s.bind(x, &importBinding{qualifier: qual, path: p, sink: true, lines: []lineRef{at}})
		}
	}
	aliasHint := func() string {
		if imp.Alias != "" {
			return fmt.Sprintf("use a different alias for %q", p)
		}
		return fmt.Sprintf("alias %q", p)
	}

	if module.IsLocal(p) {
		example := "example.com/x"
		if m := s.moduleOf[x]; m != "" {
			example = m + "/…"
		}
		fail(ErrInvalidImportPath, fmt.Sprintf("invalid import path %q: %q is a local import path; use a module path such as %q", p, p, example))
		return
	}
	if err := module.CheckPath(p); err != nil {
		fail(ErrInvalidImportPath, fmt.Sprintf("invalid import path %q: %v", p, err))
		return
	}
	if path := s.pathOf[x]; path != "" && path == p {
		fail(ErrSelfImport, fmt.Sprintf("package %s imports itself", p))
		return
	}
	if qual == "" {
		fail(ErrImportNeedsAlias, fmt.Sprintf("import %q needs an alias: its assumed name %s cannot be a package name", p, module.AssumedName(p)))
		return
	}
	if own != "" && qual == own {
		report(ErrDuplicateImportName, "", fmt.Sprintf("import name %s is this package's own name; %s", qual, aliasHint()))
		return
	}
	if b := s.bindings[x][qual]; b != nil {
		if b.path == p {
			b.lines = append(b.lines, at) // the same binding again
			if b.failure != nil {
				f := *b.failure
				f.Line, f.Column, f.File = at.line, at.column, at.file
				s.errs = append(s.errs, &f)
			}
			return
		}
		first := b.lines[0]
		report(ErrDuplicateImportName, "", fmt.Sprintf("import name %s is already bound to %q in %s (%s:%d); %s", qual, b.path, s.packageLabel(x), first.file, first.line, aliasHint()))
		return
	}

	b := &importBinding{qualifier: qual, path: p, lines: []lineRef{at}}
	out, looked := file.ImportOutcomes[imp]
	switch {
	case s.paths[p] != "":
		b.targetPkg = s.paths[p]
	case looked && out.Kind == ast.ImportSink:
		b.sink = true
	case looked && out.Kind == ast.ImportNotFound:
		report(ErrImportNotFound, "", fmt.Sprintf("import %q: %s", p, out.Detail))
		b.failure = s.errs[len(s.errs)-1]
		b.sink = true
	case looked && out.Kind == ast.ImportNotLoaded:
		b.external = true
		b.warning = &ResolveError{Msg: fmt.Sprintf("import %q is not among the inputs; %s; treated as external", p, out.Detail), Severity: "warning", Kind: ErrImportNotLoaded, Name: qual}
	case s.byName[module.AssumedName(p)] != "":
		// A package with no path, reached by its name.
		b.targetPkg = s.byName[module.AssumedName(p)]
	default:
		b.external = true
		msg := fmt.Sprintf("import %q is unresolved (no package %q in the tree); treated as external", p, module.AssumedName(p))
		var elsewhere []string
		for id, name := range s.names {
			if name == module.AssumedName(p) && s.pathOf[id] != "" {
				elsewhere = append(elsewhere, s.pathOf[id])
			}
		}
		if len(elsewhere) > 0 {
			slices.Sort(elsewhere)
			msg += fmt.Sprintf(" (package %s is at %s)", module.AssumedName(p), strings.Join(elsewhere, ", "))
		}
		b.warning = &ResolveError{Msg: msg, Severity: "warning", Kind: ErrUnresolvedImport, Name: qual}
	}
	s.bind(x, b)
}

// readOperationMentions reads a two-segment worker entry `nexus service Svc.Op`
// as an operation of a same-package service rather than a package-qualified
// service, when that is the only sensible reading: the qualifier is not the
// worker's package or a bound import, it names a nexus service declared in the
// worker's package, and that service has the operation. The entry is rewritten
// to the whole service (so coverage and the graph see what the fix-it says to
// register) and the operation is recorded for checkOperationMention. Any other
// qualified entry is left for resolveQualifier, unchanged.
func (s *state) readOperationMentions(w *ast.WorkerDef, wPkg string) {
	for i := range w.Services {
		ref := &w.Services[i]
		if ref.Package == "" || ref.Package == s.names[wPkg] || s.bindings[wPkg][ref.Package] != nil {
			continue
		}
		svc, found := s.nexusServices[pkgKey{wPkg, ref.Package}]
		if !found || !hasOperation(svc, ref.Name) {
			continue
		}
		w.OperationMentions = append(w.OperationMentions, ast.OperationMention{Pos: ref.Pos, ServiceIndex: i, Op: ref.Name})
		ref.Package, ref.Name = "", ref.Package
	}
}

// checkOperationMention reports each operation named by worker w's entry
// Services[i], after that entry is resolved. The operation is confirmed only
// when the service resolved and has it.
func (s *state) checkOperationMention(w *ast.WorkerDef, i int) {
	for _, m := range w.OperationMentions {
		if m.ServiceIndex != i {
			continue
		}
		ref := w.Services[i]
		svc := ref.Name
		if ref.Package != "" {
			svc = ref.Package + "." + ref.Name
		}
		written := svc + "." + m.Op // the entry as written: `Svc.Op` or `pkg.Svc.Op`
		msg := fmt.Sprintf("a worker registers a whole nexus service; %s names %s under service %s — register `nexus service %s`", written, m.Op, svc, svc)
		if ref.Resolved != nil && hasOperation(ref.Resolved, m.Op) {
			msg = fmt.Sprintf("a worker registers a whole nexus service; %s names operation %s of %s — register `nexus service %s`, or move %s into a service of its own", written, m.Op, svc, svc, m.Op)
		}
		s.errs = append(s.errs, &ResolveError{
			Msg:    msg,
			Line:   m.Line,
			Column: m.Column,
			Kind:   ErrWorkerRegistersOperation,
			Name:   w.Name,
			File:   w.SourceFile,
		})
	}
}

// hasOperation reports whether svc declares an operation named op.
func hasOperation(svc *ast.NexusServiceDef, op string) bool {
	return slices.ContainsFunc(svc.Operations, func(o *ast.NexusOperation) bool { return o.Name == op })
}

// resolveQualifier maps a reference's package qualifier to the package its name
// should be looked up in, for a reference written in ownPkg.
//
//   - empty or ownPkg → same package (targetPkg = ownPkg, not external).
//   - a bound import qualifier → its target package; external is true when that
//     package is absent from the tree. The binding is marked used.
//   - anything else → QUALIFIED_REF_WITHOUT_IMPORT error; ok is false so the
//     caller leaves the reference unresolved without a second diagnostic.
func (s *state) resolveQualifier(ownPkg, q string, line, column int, file string) (targetPkg string, external, ok bool) {
	if q == "" || (ownPkg != "" && q == s.names[ownPkg]) {
		return ownPkg, false, true
	}
	if b := s.bindings[ownPkg][q]; b != nil {
		b.used = true
		return b.targetPkg, b.external || b.sink, true
	}
	msg := fmt.Sprintf("qualified reference uses package %q with no matching import in %s", q, s.packageLabel(ownPkg))
	if lines := s.noQualifier[ownPkg]; len(lines) > 0 {
		var at []string
		for _, l := range lines {
			at = append(at, fmt.Sprintf("%s:%d", l.file, l.line))
		}
		msg += fmt.Sprintf(" (the import at %s binds no qualifier)", strings.Join(at, ", "))
	}
	s.errs = append(s.errs, &ResolveError{
		Msg:    msg,
		Line:   line,
		Column: column,
		Kind:   ErrQualifiedRefWithoutImport,
		Name:   q,
		File:   file,
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
	file       string // SourceFile of the enclosing definition (#136)
	signals    map[string]*ast.SignalDecl
	queries    map[string]*ast.QueryDecl
	updates    map[string]*ast.UpdateDecl
	conditions map[string]*ast.ConditionDecl
	promises   map[string]*ast.PromiseStmt
	params     map[string]bool // the sender's own params: the runnable's, plus a handler's
}

// withParams returns a copy of c whose params also include a handler's.
func (c *resolveCtx) withParams(handlerParams string) *resolveCtx {
	hc := *c
	hc.params = ast.ParamNames(handlerParams)
	for name := range c.params {
		hc.params[name] = true
	}
	return &hc
}

// withPromises returns a copy of c whose promises also include extra.
func (c *resolveCtx) withPromises(extra map[string]*ast.PromiseStmt) *resolveCtx {
	pc := *c
	pc.promises = maps.Clone(c.promises)
	maps.Copy(pc.promises, extra)
	return &pc
}

// topLevelPromises returns the promises bound directly in a body, outside any
// nested block: the ones a workflow's handlers see.
func topLevelPromises(body []ast.Statement) map[string]*ast.PromiseStmt {
	promises := make(map[string]*ast.PromiseStmt)
	for _, s := range body {
		if p, ok := s.(*ast.PromiseStmt); ok {
			promises[p.Name] = p
		}
	}
	return promises
}

// resolveStatements resolves one block. A promise is in scope from its binding
// to the end of the block that binds it, nested blocks included; a later
// binding of the same name shadows it from there on.
func (c *resolveCtx) resolveStatements(stmts []ast.Statement) {
	bc := c.withPromises(nil)
	for _, s := range stmts {
		bc.resolveStatement(s)
		if p, ok := s.(*ast.PromiseStmt); ok {
			bc.promises[p.Name] = p
		}
	}
}

// resolveStatement resolves one statement's references, then its nested blocks.
func (c *resolveCtx) resolveStatement(s ast.Statement) {
	switch s := s.(type) {
	case *ast.ActivityCall:
		resolvePkgRef(c.s, c.ownPkg, &s.Activity, c.s.activities, "activity", ErrUndefinedActivity, c.file)
	case *ast.WorkflowCall:
		resolvePkgRef(c.s, c.ownPkg, &s.Workflow, c.s.workflows, "workflow", ErrUndefinedWorkflow, c.file)
	case *ast.NexusCall:
		c.resolveNexusRefs(&s.Endpoint, &s.Service, &s.Operation)
	case *ast.SetStmt:
		resolveLocalRef(&s.Condition, c.conditions, "condition", ErrUndefinedCondition, c.file, &c.s.errs)
	case *ast.UnsetStmt:
		resolveLocalRef(&s.Condition, c.conditions, "condition", ErrUndefinedCondition, c.file, &c.s.errs)
	case *ast.SignalSendStmt:
		c.resolveSignalSend(s)
	}
	if target := ast.AsyncTargetOf(s); target != nil {
		c.resolveAsyncTarget(target, s.NodeLine(), s.NodeColumn())
	}
	for _, block := range ast.ChildBlocks(s) {
		c.resolveStatements(block)
	}
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
			File:   c.file,
		})
	}

	targetPkg, external, ok := c.s.resolveQualifier(c.ownPkg, service.Package, service.Line, service.Column, c.file)
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
			File:   c.file,
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
		File:   c.file,
	})
}

// resolveAsyncTarget resolves references inside an async target.
func (c *resolveCtx) resolveAsyncTarget(target ast.AsyncTarget, line, column int) {
	switch t := target.(type) {
	case *ast.SignalTarget:
		resolveLocalRef(&t.Signal, c.signals, "signal", ErrUndefinedSignal, c.file, &c.s.errs)
	case *ast.UpdateTarget:
		resolveLocalRef(&t.Update, c.updates, "update", ErrUndefinedUpdate, c.file, &c.s.errs)
	case *ast.ActivityTarget:
		resolvePkgRef(c.s, c.ownPkg, &t.Activity, c.s.activities, "activity", ErrUndefinedActivity, c.file)
	case *ast.WorkflowTarget:
		resolvePkgRef(c.s, c.ownPkg, &t.Workflow, c.s.workflows, "workflow", ErrUndefinedWorkflow, c.file)
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
				File:   c.file,
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
				File:   c.file,
			})
		}
	case *ast.TimerTarget:
		// No resolution needed for timers
	}
}

// resolveSignalSend resolves a cross-workflow signal send. The parser classified
// the head by shape; here a bare head that names an in-scope promise is a handle
// (the local handle shadows a same-named type) and any other bare head is a type.
func (c *resolveCtx) resolveSignalSend(s *ast.SignalSendStmt) {
	h := &s.Head
	if h.Type.Package == "" {
		name := h.Type.Name
		if h.Kind == ast.SendHeadHandle {
			name = h.Handle.Name
		}
		_, isPromise := c.promises[name]
		switch {
		case isPromise && h.Kind == ast.SendHeadType:
			c.errorf(ErrHandleTakesNoID, h.Address.Pos, name, "%s is a handle; a send to a handle takes no address", name)
			h.Kind, h.Handle, h.Type, h.Address = ast.SendHeadHandle, ast.Ref[*ast.PromiseStmt]{Pos: h.Pos, Name: name}, ast.Ref[*ast.WorkflowDef]{}, nil
		case !isPromise && h.Kind == ast.SendHeadHandle:
			h.Kind, h.Type, h.Handle = ast.SendHeadType, ast.Ref[*ast.WorkflowDef]{Pos: h.Pos, Name: name}, ast.Ref[*ast.PromiseStmt]{}
		}
	}
	if h.Kind == ast.SendHeadHandle {
		c.resolveHandleSend(s)
		return
	}
	c.resolveTypeSend(s)
}

// resolveTypeSend resolves a send headed by a workflow type: the type and its
// handler, then the address against the type's id_scheme.
func (c *resolveCtx) resolveTypeSend(s *ast.SignalSendStmt) {
	h := &s.Head
	if h.Address == nil {
		if _, ok := c.s.workflows[pkgKey{c.ownPkg, h.Type.Name}]; ok || h.Type.Package != "" {
			c.errorf(ErrTypeNeedsID, h.Pos, h.Type.Name, "a send to workflow type %s needs an id: line naming the instance", h.Type.Name)
		} else {
			c.errorf(ErrUndefinedPromiseOrCondition, h.Pos, h.Type.Name, "undefined handle or workflow type: %s", h.Type.Name)
			return
		}
	}

	targetPkg, external, ok := c.s.resolveQualifier(c.ownPkg, h.Type.Package, h.Line, h.Column, c.file)
	if !ok {
		return
	}
	if external {
		h.External = true
		return
	}
	wf, found := c.s.workflows[pkgKey{targetPkg, h.Type.Name}]
	if !found {
		e := c.errorf(ErrUndefinedWorkflow, h.Pos, h.Type.Name, "undefined workflow: %s", h.Type.Name)
		if targetPkg != c.ownPkg {
			e.Qualifier = h.Type.Package
		}
		return
	}
	h.Type.Resolved = wf

	if !wf.DeclaresSignal(s.Signal) {
		c.errorf(ErrUndefinedSignal, s.Pos, s.Signal, "signal %q is not declared by workflow %s", s.Signal, wf.Name)
	}
	if h.Address != nil && h.Address.ID.Kind == ast.IDLiteral {
		c.checkMirror(wf, h.Address.ID)
	}
}

// checkMirror checks a literal id: against the type's id_scheme: the same fixed
// text and hole count, with the sender's own names in the holes.
func (c *resolveCtx) checkMirror(wf *ast.WorkflowDef, id ast.IDValue) {
	if wf.IDScheme == nil {
		c.errorf(ErrNoIDScheme, id.Pos, wf.Name, "workflow %s declares no id_scheme, so a literal id: has nothing to mirror; send to a name holding the whole ID", wf.Name)
		return
	}
	scheme := wf.IDScheme
	schemeFixed, _, _ := ast.ParseIDTemplate(scheme.Template)
	litFixed, _, _ := ast.ParseIDTemplate(id.Literal)
	if !slices.Equal(schemeFixed, litFixed) {
		c.errorf(ErrIDMirrorMismatch, id.Pos, wf.Name, "id %q does not mirror workflow %s's id_scheme %q: fixed text and hole count must match", id.Literal, wf.Name, scheme.Template)
		return
	}
	if len(id.Parts) == 0 || !slices.Equal(id.Parts, scheme.Holes) {
		return
	}
	for _, part := range id.Parts {
		if c.params[ast.IDPathRoot(part)] {
			return
		}
	}
	err := c.errorf(ErrMirrorCopiedFromScheme, id.Pos, wf.Name, "id %q repeats workflow %s's own param names; fill the holes with the sender's names", id.Literal, wf.Name)
	err.Severity = "hint"
}

// resolveHandleSend resolves a send headed by a handle. The handle must be a
// workflow-bound promise, and the target workflow must declare the named signal.
// On full success the handle's Resolved pointer is linked to the promise so the
// graph and JSON layers can reach the target workflow.
func (c *resolveCtx) resolveHandleSend(s *ast.SignalSendStmt) {
	handle := &s.Head.Handle
	promise := c.promises[handle.Name]

	wt, ok := promise.Target.(*ast.WorkflowTarget)
	if !ok {
		c.errorf(ErrSignalSendHandleNotWorkflow, handle.Pos, handle.Name, "signal-send handle %q is not a workflow-bound promise; the handle must come from `promise %s <- workflow X(args)`", handle.Name, handle.Name)
		return
	}

	// The target workflow name itself is unresolved — the promise's own
	// workflow-call resolution already reported it. Degrade gracefully rather
	// than double-reporting or verifying the signal against a nil target.
	if wt.Workflow.Resolved == nil {
		return
	}

	if wt.Workflow.Resolved.DeclaresSignal(s.Signal) {
		handle.Resolved = promise
		return
	}
	c.errorf(ErrSignalSendUndefinedSignal, s.Pos, s.Signal, "signal %q is not declared by workflow %s", s.Signal, wt.Workflow.Resolved.Name)
}

// errorf appends an error-severity ResolveError attributed to the enclosing
// definition's file and returns it so a caller can lower its severity.
func (c *resolveCtx) errorf(kind ErrorKind, pos ast.Pos, name, format string, args ...any) *ResolveError {
	err := &ResolveError{
		Msg:    fmt.Sprintf(format, args...),
		Line:   pos.Line,
		Column: pos.Column,
		Kind:   kind,
		Name:   name,
		File:   c.file,
	}
	c.s.errs = append(c.s.errs, err)
	return err
}

// reservedName is the one name a model may not declare: `id: parent` must mean
// the parent execution, never a variable.
const reservedName = "parent"

// paramList is an opaque parameter list and where it is declared.
type paramList struct {
	ast.Pos
	params string
}

// checkReservedNames reports `parent` declared anywhere in a workflow — its
// params, a handler's params, a condition, or anything its bodies bind.
func (s *state) checkReservedNames(wf *ast.WorkflowDef) {
	params := []paramList{{wf.Pos, wf.Params}}
	var conditions []*ast.ConditionDecl
	if wf.State != nil {
		conditions = wf.State.Conditions
	}
	var bodies [][]ast.Statement
	for _, sig := range wf.Signals {
		params = append(params, paramList{sig.Pos, sig.Params})
		bodies = append(bodies, sig.Body)
	}
	for _, q := range wf.Queries {
		params = append(params, paramList{q.Pos, q.Params})
		bodies = append(bodies, q.Body)
	}
	for _, u := range wf.Updates {
		params = append(params, paramList{u.Pos, u.Params})
		bodies = append(bodies, u.Body)
	}
	s.checkReservedIn(wf.SourceFile, params, conditions, append(bodies, wf.Body))
}

// checkReservedIn reports `parent` named by a param, a condition, a promise, a
// loop variable, or a `->` binding in bodies.
func (s *state) checkReservedIn(file string, params []paramList, conditions []*ast.ConditionDecl, bodies [][]ast.Statement) {
	report := func(pos ast.Pos, what string) {
		s.errs = append(s.errs, &ResolveError{
			Msg:    fmt.Sprintf("%q is reserved and cannot name a %s; `id: parent` addresses the parent execution", reservedName, what),
			Line:   pos.Line,
			Column: pos.Column,
			Kind:   ErrReservedName,
			Name:   reservedName,
			File:   file,
		})
	}
	checkBinding := func(pos ast.Pos, binding string) {
		if binding != "" && ast.IDPathRoot(binding) == reservedName {
			report(pos, "binding")
		}
	}

	for _, pl := range params {
		if ast.ParamNames(pl.params)[reservedName] {
			report(pl.Pos, "param")
		}
	}
	for _, cond := range conditions {
		if cond.Name == reservedName {
			report(cond.Pos, "condition")
		}
	}
	for _, body := range bodies {
		ast.WalkStatements(body, func(st ast.Statement) bool {
			switch st := st.(type) {
			case *ast.PromiseStmt:
				if st.Name == reservedName {
					report(st.Pos, "promise")
				}
			case *ast.ForStmt:
				if ast.ParamNames(st.Variable)[reservedName] {
					report(st.Pos, "loop variable")
				}
			case *ast.ActivityCall:
				checkBinding(st.Pos, st.Result)
			case *ast.WorkflowCall:
				checkBinding(st.Pos, st.Result)
			case *ast.NexusCall:
				checkBinding(st.Pos, st.Result)
			}
			return true
		}, ast.WithAsyncTargets(func(target ast.AsyncTarget, parent ast.Statement) bool {
			pos := ast.Pos{Line: parent.NodeLine(), Column: parent.NodeColumn()}
			switch t := target.(type) {
			case *ast.ActivityTarget:
				checkBinding(pos, t.Result)
			case *ast.WorkflowTarget:
				checkBinding(pos, t.Result)
			case *ast.NexusTarget:
				checkBinding(pos, t.Result)
			case *ast.IdentTarget:
				checkBinding(pos, t.Result)
			case *ast.SignalTarget:
				if ast.ParamNames(t.Params)[reservedName] {
					report(pos, "binding")
				}
			case *ast.UpdateTarget:
				if ast.ParamNames(t.Params)[reservedName] {
					report(pos, "binding")
				}
			}
			return true
		}))
	}
}

// collectInto registers a definition under its (package, name) key, appending a
// duplicate error (per key, so same-named defs in different packages coexist)
// if the key already exists.
func collectInto[T any](m map[pkgKey]T, key pkgKey, def T, kind string, errKind ErrorKind, line, column int, file string, errs *[]*ResolveError) {
	if _, exists := m[key]; exists {
		*errs = append(*errs, &ResolveError{
			Msg:    fmt.Sprintf("duplicate %s definition: %s", kind, key.name),
			Line:   line,
			Column: column,
			Kind:   errKind,
			Name:   key.name,
			File:   file,
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
func resolvePkgRef[T any](s *state, ownPkg string, ref *ast.Ref[T], defs map[pkgKey]T, kind string, errKind ErrorKind, file string) {
	targetPkg, external, ok := s.resolveQualifier(ownPkg, ref.Package, ref.Line, ref.Column, file)
	if !ok {
		return
	}
	if external {
		if b := s.bindings[ownPkg][ref.Package]; b != nil {
			ref.External = b.path
		}
		return
	}
	if def, found := defs[pkgKey{targetPkg, ref.Name}]; found {
		ref.Resolved = def
		return
	}
	msg := fmt.Sprintf("undefined %s: %s", kind, ref.Name)
	qualifier := ""
	if ref.Package != "" && targetPkg != ownPkg {
		qualifier = ref.Package
		msg = fmt.Sprintf("undefined %s: %s.%s", kind, ref.Package, ref.Name)
		if path := s.pathOf[targetPkg]; path != "" {
			msg += fmt.Sprintf(" (package %s)", path)
		}
	}
	s.errs = append(s.errs, &ResolveError{
		Msg:       msg,
		Line:      ref.Line,
		Column:    ref.Column,
		Kind:      errKind,
		Name:      ref.Name,
		File:      file,
		Qualifier: qualifier,
	})
}

// resolveLocalRef resolves a workflow-local reference (signal / update /
// condition) against a bare-name map. These names are never package-qualified,
// so any qualifier is ignored.
func resolveLocalRef[T any](ref *ast.Ref[T], defs map[string]T, kind string, errKind ErrorKind, file string, errs *[]*ResolveError) {
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
		File:   file,
	})
}

// paramsNotIn returns the members of need that are absent from have, preserving
// need's order. Used for the endpoint-⊇-namespace superset check: need is the
// namespace params, have is the endpoint params.
func paramsNotIn(need, have []string) []string {
	if len(need) == 0 {
		return nil
	}
	set := make(map[string]bool, len(have))
	for _, p := range have {
		set[p] = true
	}
	var missing []string
	for _, p := range need {
		if !set[p] {
			missing = append(missing, p)
		}
	}
	return missing
}

// endpointTaskQueue extracts the task_queue value from an options block, or ""
// if absent. Nil-safe. Mirrors graph.taskQueue / validator.extractTaskQueue —
// kept local so the resolver package doesn't take a cross-package dependency.
func endpointTaskQueue(opts *ast.OptionsBlock) string {
	if e := taskQueueEntry(opts); e != nil {
		return e.Value
	}
	return ""
}

// taskQueueEntry returns the task_queue entry of an options block, or nil if
// absent. Nil-safe.
func taskQueueEntry(opts *ast.OptionsBlock) *ast.OptionEntry {
	if opts == nil {
		return nil
	}
	for _, e := range opts.Entries {
		if e.Key == "task_queue" {
			return e
		}
	}
	return nil
}
