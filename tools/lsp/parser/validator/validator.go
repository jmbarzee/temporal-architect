package validator

import (
	"cmp"
	"fmt"
	"slices"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
)

// ErrorKind classifies a validation error for structured handling.
type ErrorKind int

const (
	ErrEmptyWorkflow ErrorKind = iota + 1
	ErrEmptyActivity
	ErrEmptyWorker
	ErrEmptyNamespace
	ErrMissingTaskQueue
	ErrMissingEndpointTaskQueue
	ErrUncoveredWorkflow
	ErrUncoveredActivity
	ErrUncoveredService
	ErrUninstantiatedWorker
	ErrTaskQueueIdentical
	ErrTaskQueueMismatch
	ErrExplicitRoutingMismatch
	ErrImplicitRoutingMismatch
	ErrEndpointServiceLinkage
	ErrNotAParent
	ErrStarterLacksSignal
	ErrIDSchemeOverlap
)

// Error represents a validation error with position info.
type Error struct {
	Msg      string
	Line     int
	Column   int
	Severity string // "error" (default), "warning", or "hint"
	Kind     ErrorKind
	Name     string // primary entity referenced by this error
	// File is the base name of the source file this error is attributed to
	// (issue #238): the SourceFile of the definition enclosing the error's
	// position — the calling definition for a call-site error, the definition
	// itself for an error about a definition. It is the reference-site file even
	// when Name points at a symbol defined elsewhere, so consumers must prefer it
	// over reverse-engineering the file from Name. Empty when the merge left that
	// definition's SourceFile unstamped (e.g. a raw single-file parse).
	File string
}

func (e *Error) Error() string {
	return fmt.Sprintf("validation error at %d:%d: %s", e.Line, e.Column, e.Msg)
}

// Code returns the symbolic, stable identifier for this validation kind.
// Mirrors resolver.ResolveError.Code for the same downstream tooling contract.
func (e *Error) Code() string { return e.Kind.String() }

// String returns the symbolic name of a validator ErrorKind
// (e.g. "MISSING_TASK_QUEUE"). Part of the diagnostic contract.
func (k ErrorKind) String() string {
	switch k {
	case ErrEmptyWorkflow:
		return "EMPTY_WORKFLOW"
	case ErrEmptyActivity:
		return "EMPTY_ACTIVITY"
	case ErrEmptyWorker:
		return "EMPTY_WORKER"
	case ErrEmptyNamespace:
		return "EMPTY_NAMESPACE"
	case ErrMissingTaskQueue:
		return "MISSING_TASK_QUEUE"
	case ErrMissingEndpointTaskQueue:
		return "MISSING_ENDPOINT_TASK_QUEUE"
	case ErrUncoveredWorkflow:
		return "UNCOVERED_WORKFLOW"
	case ErrUncoveredActivity:
		return "UNCOVERED_ACTIVITY"
	case ErrUncoveredService:
		return "UNCOVERED_SERVICE"
	case ErrUninstantiatedWorker:
		return "UNINSTANTIATED_WORKER"
	case ErrTaskQueueIdentical:
		return "TASK_QUEUE_IDENTICAL"
	case ErrTaskQueueMismatch:
		return "TASK_QUEUE_MISMATCH"
	case ErrExplicitRoutingMismatch:
		return "EXPLICIT_ROUTING_MISMATCH"
	case ErrImplicitRoutingMismatch:
		return "IMPLICIT_ROUTING_MISMATCH"
	case ErrEndpointServiceLinkage:
		return "ENDPOINT_SERVICE_LINKAGE"
	case ErrNotAParent:
		return "NOT_A_PARENT"
	case ErrStarterLacksSignal:
		return "STARTER_LACKS_SIGNAL"
	case ErrIDSchemeOverlap:
		return "ID_SCHEME_OVERLAP"
	}
	return "UNKNOWN"
}

// pkgKey is the composite (package, name) key under which package-scoped
// definitions — workflows, activities, workers, namespaces, nexus services —
// are stored. It mirrors resolver.pkgKey and ast.QualifiedName's encoding so
// the validator judges coverage and duplication by the same (package, name)
// identity the resolver and graph use (issue #113): two same-named definitions
// in different packages are distinct keys. The empty package string is the
// implicit default package, so an unpackaged tree keys by bare name and its
// diagnostics stay byte-identical.
type pkgKey struct {
	pkg  string
	name string
}

// effPkg returns a definition's effective package: its runtime package stamp
// when present (set by the envelope merge), otherwise the file's own package.
// Mirrors resolver.effPkg / graph.pkgOf so all three key in lockstep. A
// single-file parse that never went through the merge leaves the stamp empty
// and falls back to file.Package, keeping existing behaviour identical.
func effPkg(defPkg, filePkg string) string {
	if defPkg != "" {
		return defPkg
	}
	return filePkg
}

type validationCtx struct {
	filePkg       string
	workflows     map[pkgKey]*ast.WorkflowDef
	activities    map[pkgKey]*ast.ActivityDef
	workers       map[pkgKey]*ast.WorkerDef
	namespaces    map[pkgKey]*ast.NamespaceDef
	nexusServices map[pkgKey]*ast.NexusServiceDef
	allEndpoints  map[string]*ast.NamespaceEndpoint
	errs          []*Error
}

// key returns the (package, name) key for a definition given its runtime
// package stamp and name, folding in the file-package fallback.
func (v *validationCtx) key(defPkg, name string) pkgKey {
	return pkgKey{effPkg(defPkg, v.filePkg), name}
}

// refKey returns the (package, name) key a worker registration or call-site
// reference resolves to: the resolved target's own package when resolved (so a
// ref in package P to a same-named def keys to the package that actually holds
// the def), otherwise the file-package fallback (matching no real definition,
// which is correct — an unresolved ref hosts/routes to nothing). Mirrors
// graph.hostedRefQName so validator coverage/routing align with the graph.
func refKey[T interface {
	comparable
	ast.Packaged
}](v *validationCtx, r ast.Ref[T]) pkgKey {
	var zero T
	if r.Resolved != zero {
		return pkgKey{effPkg(r.Resolved.PackageName(), v.filePkg), r.Name}
	}
	return pkgKey{effPkg("", v.filePkg), r.Name}
}

// Validate runs deployment/routing validation on a resolved AST.
// Call after resolver.Resolve().
//
// Coverage, duplicate, and routing checks key by (package, name) in lockstep
// with the resolver and graph (issue #113): same-named definitions in different
// packages are distinct, so cross-package coverage and duplication are judged
// correctly and a shared short name is never a false collision. Endpoints stay
// flat-global (unqualified), matching Temporal's cluster-global endpoint
// registry.
func Validate(file *ast.File) []*Error {
	v := &validationCtx{
		filePkg:       file.Package,
		workflows:     make(map[pkgKey]*ast.WorkflowDef),
		activities:    make(map[pkgKey]*ast.ActivityDef),
		workers:       make(map[pkgKey]*ast.WorkerDef),
		namespaces:    make(map[pkgKey]*ast.NamespaceDef),
		nexusServices: make(map[pkgKey]*ast.NexusServiceDef),
		allEndpoints:  make(map[string]*ast.NamespaceEndpoint),
	}

	// Build definition maps from the AST, keyed by (package, name).
	for _, def := range file.Definitions {
		switch d := def.(type) {
		case *ast.WorkflowDef:
			v.workflows[v.key(d.Package, d.Name)] = d
		case *ast.ActivityDef:
			v.activities[v.key(d.Package, d.Name)] = d
		case *ast.WorkerDef:
			v.workers[v.key(d.Package, d.Name)] = d
		case *ast.NamespaceDef:
			v.namespaces[v.key(d.Package, d.Name)] = d
		case *ast.NexusServiceDef:
			v.nexusServices[v.key(d.Package, d.Name)] = d
		}
	}

	// Build the flat-global endpoint map. Endpoints are never package-scoped —
	// they share one cluster-global namespace, so a bare name is the key.
	for _, ns := range v.namespaces {
		for i := range ns.Endpoints {
			ep := &ns.Endpoints[i]
			v.allEndpoints[ep.EndpointName] = ep
		}
	}

	// 1. Empty definition warnings.
	v.checkEmptyDefinitions()

	// 2. Task queue requirements.
	v.checkTaskQueueRequirements()

	// 3. Coverage warnings.
	v.checkCoverage()

	// 4. Task queue coherence.
	v.checkTaskQueueCoherence()

	// 5-6. Call routing + endpoint-service linkage (walks resolved bodies).
	v.walkAllBodies()

	// 7. id: parent claims and id_scheme overlap (definition order, for stable output).
	v.checkParentSends(file.Definitions)
	v.checkIDSchemeOverlap(file.Definitions)

	return v.errs
}

func (v *validationCtx) checkEmptyDefinitions() {
	for _, wf := range v.workflows {
		if !hasNonCommentStmts(wf.Body) && len(wf.Signals) == 0 && len(wf.Queries) == 0 && len(wf.Updates) == 0 && wf.State == nil {
			v.errs = append(v.errs, &Error{
				Msg:      fmt.Sprintf("workflow %s has an empty body", wf.Name),
				Line:     wf.Line,
				Column:   wf.Column,
				Severity: "warning",
				Kind:     ErrEmptyWorkflow,
				Name:     wf.Name,
				File:     wf.SourceFile,
			})
		}
	}
	for _, act := range v.activities {
		if !hasNonCommentStmts(act.Body) {
			msg := fmt.Sprintf("activity %s has an empty body", act.Name)
			if len(act.Body) > 0 {
				msg = fmt.Sprintf("activity %s body contains only comments — add at least one statement", act.Name)
			}
			v.errs = append(v.errs, &Error{
				Msg:      msg,
				Line:     act.Line,
				Column:   act.Column,
				Severity: "warning",
				Kind:     ErrEmptyActivity,
				Name:     act.Name,
				File:     act.SourceFile,
			})
		}
	}
	for _, w := range v.workers {
		if len(w.Workflows) == 0 && len(w.Activities) == 0 && len(w.Services) == 0 {
			v.errs = append(v.errs, &Error{
				Msg:      fmt.Sprintf("worker %s has no workflow, activity, or nexus service registrations", w.Name),
				Line:     w.Line,
				Column:   w.Column,
				Severity: "warning",
				Kind:     ErrEmptyWorker,
				Name:     w.Name,
				File:     w.SourceFile,
			})
		}
	}
	for _, ns := range v.namespaces {
		if len(ns.Workers) == 0 && len(ns.Endpoints) == 0 {
			v.errs = append(v.errs, &Error{
				Msg:      fmt.Sprintf("namespace %s has no worker or endpoint instantiations", ns.Name),
				Line:     ns.Line,
				Column:   ns.Column,
				Severity: "warning",
				Kind:     ErrEmptyNamespace,
				Name:     ns.Name,
				File:     ns.SourceFile,
			})
		}
	}
}

func (v *validationCtx) checkTaskQueueRequirements() {
	for _, ns := range v.namespaces {
		for _, nw := range ns.Workers {
			tq := extractTaskQueue(nw.Options)
			if tq == "" {
				v.errs = append(v.errs, &Error{
					Msg:    fmt.Sprintf("worker %s in namespace %s missing required task_queue option", nw.Worker.Name, ns.Name),
					Line:   nw.Line,
					Column: nw.Column,
					Kind:   ErrMissingTaskQueue,
					Name:   nw.Worker.Name,
					File:   ns.SourceFile,
				})
			}
		}
		for _, ep := range ns.Endpoints {
			tq := extractTaskQueue(ep.Options)
			if tq == "" {
				v.errs = append(v.errs, &Error{
					Msg:    fmt.Sprintf("nexus endpoint %s in namespace %s missing required task_queue option", ep.EndpointName, ns.Name),
					Line:   ep.Line,
					Column: ep.Column,
					Kind:   ErrMissingEndpointTaskQueue,
					Name:   ep.EndpointName,
					File:   ns.SourceFile,
				})
			}
		}
	}
}

func (v *validationCtx) checkCoverage() {
	if len(v.namespaces) == 0 {
		return
	}

	coveredWorkflows := make(map[pkgKey]bool)
	coveredActivities := make(map[pkgKey]bool)
	coveredServices := make(map[pkgKey]bool)
	instantiatedWorkers := make(map[pkgKey]bool)

	for _, ns := range v.namespaces {
		for _, nw := range ns.Workers {
			w := nw.Worker.Resolved
			if w == nil {
				continue
			}
			instantiatedWorkers[v.key(w.Package, w.Name)] = true
			for _, ref := range w.Workflows {
				coveredWorkflows[refKey(v, ref)] = true
			}
			for _, ref := range w.Activities {
				coveredActivities[refKey(v, ref)] = true
			}
			for _, ref := range w.Services {
				coveredServices[refKey(v, ref)] = true
			}
		}
	}

	checkUncovered(v.workflows, coveredWorkflows, "workflow %s is not registered on any instantiated worker", ErrUncoveredWorkflow, &v.errs)
	checkUncovered(v.activities, coveredActivities, "activity %s is not registered on any instantiated worker", ErrUncoveredActivity, &v.errs)
	checkUncovered(v.nexusServices, coveredServices, "nexus service %s is not referenced by any worker", ErrUncoveredService, &v.errs)
	checkUncovered(v.workers, instantiatedWorkers, "worker %s is not instantiated in any namespace", ErrUninstantiatedWorker, &v.errs)
}

// checkTaskQueueCoherence reports workers that share a (namespace, task queue)
// pair. The namespace is keyed by deploy name, so two packages that each
// declare the same namespace share its queues. Each report is positioned on the
// later of the two worker instantiations, in source order (issue #248).
func (v *validationCtx) checkTaskQueueCoherence() {
	type queueInfo struct {
		workerName string
		workflows  map[pkgKey]bool
		activities map[pkgKey]bool
		file       string // SourceFile of the namespace holding the instantiation
		ast.Pos           // the worker instantiation inside that namespace
	}
	queueWorkers := make(map[placement][]queueInfo)
	for _, ns := range v.namespaces {
		for _, nw := range ns.Workers {
			tq := extractTaskQueue(nw.Options)
			if tq == "" {
				continue
			}
			w := nw.Worker.Resolved
			if w == nil {
				continue
			}
			wfSet := make(map[pkgKey]bool)
			for _, ref := range w.Workflows {
				wfSet[refKey(v, ref)] = true
			}
			actSet := make(map[pkgKey]bool)
			for _, ref := range w.Activities {
				actSet[refKey(v, ref)] = true
			}
			at := placement{ns.Name, tq}
			queueWorkers[at] = append(queueWorkers[at], queueInfo{
				workerName: w.Name,
				workflows:  wfSet,
				activities: actSet,
				file:       ns.SourceFile,
				Pos:        nw.Pos,
			})
		}
	}
	for at, infos := range queueWorkers {
		if len(infos) < 2 {
			continue
		}
		// Namespaces come out of a map, so sort into source order: the first
		// instantiation is the reference, each later one is where a report lands.
		slices.SortFunc(infos, func(a, b queueInfo) int {
			return cmp.Or(cmp.Compare(a.file, b.file), cmp.Compare(a.Line, b.Line), cmp.Compare(a.Column, b.Column))
		})
		first := infos[0]
		for _, other := range infos[1:] {
			if sameSet(first.workflows, other.workflows) && sameSet(first.activities, other.activities) {
				v.errs = append(v.errs, &Error{
					Msg:      fmt.Sprintf("workers %s and %s on task queue %q in namespace %s have identical type sets (redundant)", first.workerName, other.workerName, at.queue, at.namespace),
					Line:     other.Line,
					Column:   other.Column,
					Severity: "warning",
					Kind:     ErrTaskQueueIdentical,
					Name:     at.queue,
					File:     other.file,
				})
			} else {
				v.errs = append(v.errs, &Error{
					Msg:    fmt.Sprintf("workers %s and %s on task queue %q in namespace %s have different type sets", first.workerName, other.workerName, at.queue, at.namespace),
					Line:   other.Line,
					Column: other.Column,
					Kind:   ErrTaskQueueMismatch,
					Name:   at.queue,
					File:   other.file,
				})
			}
		}
	}
}

// placement is one (namespace, task queue) pair a definition is hosted on.
// A task queue is scoped to its namespace, so routing matches on the pair.
type placement struct {
	namespace string // the namespace's deploy name — its runtime identity
	queue     string
}

// caller is the hosted definition whose body holds a call site: a workflow,
// or the nexus service of a sync operation.
type caller struct {
	kind string // "workflow" or "nexus service"
	key  pkgKey
	file string // SourceFile of the calling definition (#238)
}

// walkAllBodies walks all workflow and nexus service sync op bodies,
// checking call routing and endpoint-service linkage.
func (v *validationCtx) walkAllBodies() {
	if len(v.namespaces) == 0 {
		return
	}

	for key, wf := range v.workflows {
		from := caller{"workflow", key, wf.SourceFile}
		v.walkStatements(wf.Body, from)
		for _, s := range wf.Signals {
			v.walkStatements(s.Body, from)
		}
		for _, q := range wf.Queries {
			v.walkStatements(q.Body, from)
		}
		for _, u := range wf.Updates {
			v.walkStatements(u.Body, from)
		}
	}

	for key, svc := range v.nexusServices {
		for _, op := range svc.Operations {
			if op.OpType == ast.NexusOpSync {
				v.walkStatements(op.Body, caller{"nexus service", key, svc.SourceFile})
			}
		}
	}
}

// walkStatements walks a statement body, checking each call in it as made
// from the hosted definition from.
func (v *validationCtx) walkStatements(stmts []ast.Statement, from caller) {
	ast.WalkStatements(stmts, func(s ast.Statement) bool {
		switch n := s.(type) {
		case *ast.ActivityCall:
			// An unresolved target is external or already reported as
			// undefined, as for a nexus service below; it has no workers to find.
			if a := n.Activity.Resolved; a != nil {
				v.checkCallRouting("activity", refKey(v, n.Activity), n.Options, a.DefaultOptions, from, n.Line, n.Column)
			}
		case *ast.WorkflowCall:
			if w := n.Workflow.Resolved; w != nil {
				v.checkCallRouting("workflow", refKey(v, n.Workflow), n.Options, w.DefaultOptions, from, n.Line, n.Column)
			}
		case *ast.NexusCall:
			// Only a service that resolved to a local definition can be checked
			// for endpoint↔worker linkage. An unresolved service is either
			// external (resolved through an unresolved import — no error wanted,
			// issue #109) or genuinely undefined (the resolver already reported
			// UNDEFINED_SERVICE); either way the validator must not add a
			// linkage error on top.
			if n.Service.Resolved != nil {
				v.checkEndpointServiceLinkage(n.Endpoint.Name, refKey(v, n.Service), n.Line, n.Column, from.file)
			}
		case *ast.SignalSendStmt:
			// A signal send is a *use* of its handle promise — no routing
			// check applies (a signal is delivered to a child the sender
			// already started, not task-queue-matched; see graph.emitSignalSend).
			// GUARD for future heuristics: there is no unused-promise /
			// "result never consumed" check today, but when one is added it
			// MUST treat `signal h.Name(...)` as consuming the promise `h`. A
			// workflow-bound promise used only as a signal target (never
			// awaited) is still used, and a fire-and-forget send is valid even
			// if the handle is never awaited. See TestSignalSendHandleCountsAsUse.
		default:
			if target := ast.AsyncTargetOf(s); target != nil {
				v.walkAsyncTarget(target, from, s.NodeLine(), s.NodeColumn())
			}
		}
		return true
	})
}

// walkAsyncTarget checks the call a promise, await, or await-one case makes.
// An async target carries no call-site options, so it names a queue only
// through its target's default_options.
func (v *validationCtx) walkAsyncTarget(target ast.AsyncTarget, from caller, line, column int) {
	switch t := target.(type) {
	case *ast.ActivityTarget:
		if a := t.Activity.Resolved; a != nil {
			v.checkCallRouting("activity", refKey(v, t.Activity), nil, a.DefaultOptions, from, line, column)
		}
	case *ast.WorkflowTarget:
		if w := t.Workflow.Resolved; w != nil {
			v.checkCallRouting("workflow", refKey(v, t.Workflow), nil, w.DefaultOptions, from, line, column)
		}
	case *ast.NexusTarget:
		// See the NexusCall case in walkStatements: skip the linkage check for
		// an unresolved (external / already-reported) service.
		if t.Service.Resolved != nil {
			v.checkEndpointServiceLinkage(t.Endpoint.Name, refKey(v, t.Service), line, column, from.file)
		}
	}
}

// checkCallRouting validates that an activity or workflow call can reach its
// target (identified by its resolved (package, name) key) from every
// namespace the caller is hosted in. A task queue is scoped to its namespace,
// so the target must be on a worker polling the routed queue in that same
// namespace. An explicit task_queue — on the call, else in the target's
// default_options — names a queue in each of the caller's namespaces; an
// implicit call inherits each (namespace, queue) placement of its calling
// workflow. Implicit calls from a sync nexus operation are not checked (#241),
// nor from a placement missing its task_queue, which has none to inherit. An
// unhosted caller is not checked — it has no namespace to route from and is
// already reported as uncovered. defaults is the target's default_options.
func (v *validationCtx) checkCallRouting(kind string, target pkgKey, opts, defaults *ast.OptionsBlock, from caller, line, column int) {
	explicitTQ, source := extractTaskQueue(opts), ""
	if explicitTQ == "" {
		explicitTQ, source = extractTaskQueue(defaults), " (from its default_options)"
	}
	if explicitTQ != "" {
		for _, ns := range v.callerNamespaces(from) {
			if v.hostedOn(kind, target, placement{ns, explicitTQ}) {
				continue
			}
			v.errs = append(v.errs, &Error{
				Msg:    fmt.Sprintf("%s %s has task_queue %q%s, but no worker on that queue in namespace %s registers it", kind, target.name, explicitTQ, source, ns),
				Line:   line,
				Column: column,
				Kind:   ErrExplicitRoutingMismatch,
				Name:   target.name,
				File:   from.file,
			})
		}
		return
	}

	if from.kind != "workflow" {
		return
	}
	for _, at := range v.placementsOf(from.kind, from.key) {
		if at.queue == "" || v.hostedOn(kind, target, at) {
			continue
		}
		v.errs = append(v.errs, &Error{
			Msg:    fmt.Sprintf("%s %s is not on any worker polling task queue %q in namespace %s (inherited from workflow %s)", kind, target.name, at.queue, at.namespace, from.key.name),
			Line:   line,
			Column: column,
			Kind:   ErrImplicitRoutingMismatch,
			Name:   target.name,
			File:   from.file,
		})
	}
}

// placementsOf returns the distinct (namespace, task queue) pairs on which a
// workflow, activity, or nexus service (identified by its (package, name) key)
// is registered, sorted by namespace then queue. An instantiation without a
// task_queue yields an empty queue: it is already a MISSING_TASK_QUEUE error,
// but its namespace is still known.
func (v *validationCtx) placementsOf(kind string, target pkgKey) []placement {
	seen := make(map[placement]bool)
	var placements []placement
	for _, ns := range v.namespaces {
		for _, nw := range ns.Workers {
			if w := nw.Worker.Resolved; w == nil || !v.registers(w, kind, target) {
				continue
			}
			at := placement{ns.Name, extractTaskQueue(nw.Options)}
			if !seen[at] {
				seen[at] = true
				placements = append(placements, at)
			}
		}
	}
	slices.SortFunc(placements, func(a, b placement) int {
		return cmp.Or(cmp.Compare(a.namespace, b.namespace), cmp.Compare(a.queue, b.queue))
	})
	return placements
}

// hostedOn reports whether a workflow, activity, or nexus service (identified
// by its (package, name) key) is registered on a worker polling at.queue in
// namespace at.namespace.
func (v *validationCtx) hostedOn(kind string, target pkgKey, at placement) bool {
	for _, ns := range v.namespaces {
		if ns.Name != at.namespace {
			continue
		}
		for _, nw := range ns.Workers {
			if extractTaskQueue(nw.Options) != at.queue {
				continue
			}
			if w := nw.Worker.Resolved; w != nil && v.registers(w, kind, target) {
				return true
			}
		}
	}
	return false
}

// callerNamespaces returns the distinct namespaces c is hosted in, sorted. A
// call in c's body is made from each of them.
func (v *validationCtx) callerNamespaces(c caller) []string {
	var namespaces []string
	for _, at := range v.placementsOf(c.kind, c.key) {
		if len(namespaces) == 0 || namespaces[len(namespaces)-1] != at.namespace {
			namespaces = append(namespaces, at.namespace)
		}
	}
	return namespaces
}

// registers reports whether worker w registers the workflow, activity, or
// nexus service identified by target.
func (v *validationCtx) registers(w *ast.WorkerDef, kind string, target pkgKey) bool {
	switch kind {
	case "workflow":
		return hasRef(v, w.Workflows, target)
	case "activity":
		return hasRef(v, w.Activities, target)
	case "nexus service":
		return hasRef(v, w.Services, target)
	}
	return false
}

// hasRef reports whether any of refs resolves to target.
func hasRef[T interface {
	comparable
	ast.Packaged
}](v *validationCtx, refs []ast.Ref[T], target pkgKey) bool {
	return slices.ContainsFunc(refs, func(r ast.Ref[T]) bool { return refKey(v, r) == target })
}

// checkEndpointServiceLinkage verifies that a worker polling the endpoint's
// task queue in the endpoint's own namespace registers the given service
// (identified by its resolved (package, name) key). The endpoint is looked up
// flat-global by bare name. file is the calling definition's SourceFile.
func (v *validationCtx) checkEndpointServiceLinkage(endpoint string, service pkgKey, line, column int, file string) {
	ep, ok := v.allEndpoints[endpoint]
	if !ok {
		return // endpoint not found — already reported by resolver
	}
	tq := extractTaskQueue(ep.Options)
	if tq == "" {
		return // missing task_queue — already reported in checkTaskQueueRequirements
	}
	if v.hostedOn("nexus service", service, placement{ep.Namespace, tq}) {
		return
	}

	v.errs = append(v.errs, &Error{
		Msg:    fmt.Sprintf("nexus endpoint %s routes to task queue %q in namespace %s, but no worker on that queue has service %s", endpoint, tq, ep.Namespace, service.name),
		Line:   line,
		Column: column,
		Kind:   ErrEndpointServiceLinkage,
		Name:   endpoint,
		File:   file,
	})
}

// extractTaskQueue walks an OptionsBlock to find the task_queue key.
func extractTaskQueue(opts *ast.OptionsBlock) string {
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

func sameSet[K comparable](a, b map[K]bool) bool {
	if len(a) != len(b) {
		return false
	}
	for k := range a {
		if !b[k] {
			return false
		}
	}
	return true
}

// checkUncovered reports a warning for each definition in defs whose
// (package, name) key is not present in the covered set. The bare name (never
// the package-qualified form) is used in the message and Error.Name, keeping
// single-package diagnostics byte-identical.
func checkUncovered[T ast.Definition](defs map[pkgKey]T, covered map[pkgKey]bool, msgFmt string, kind ErrorKind, errs *[]*Error) {
	for key, node := range defs {
		if !covered[key] {
			*errs = append(*errs, &Error{
				Msg:      fmt.Sprintf(msgFmt, key.name),
				Line:     node.NodeLine(),
				Column:   node.NodeColumn(),
				Severity: "warning",
				Kind:     kind,
				Name:     key.name,
				File:     sourceFileOf(node),
			})
		}
	}
}

// sourceFileOf returns the SourceFile stamp of a top-level definition.
func sourceFileOf(def ast.Definition) string {
	switch d := def.(type) {
	case *ast.WorkflowDef:
		return d.SourceFile
	case *ast.ActivityDef:
		return d.SourceFile
	case *ast.WorkerDef:
		return d.SourceFile
	case *ast.NamespaceDef:
		return d.SourceFile
	case *ast.NexusServiceDef:
		return d.SourceFile
	}
	return ""
}

// hasNonCommentStmts returns true if the statement slice has at least one
// statement that is not a Comment.
func hasNonCommentStmts(stmts []ast.Statement) bool {
	for _, s := range stmts {
		if _, isComment := s.(*ast.Comment); !isComment {
			return true
		}
	}
	return false
}
