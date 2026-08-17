package validator

import (
	"fmt"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
)

// ErrorKind classifies a validation error for structured handling.
type ErrorKind int

const (
	ErrEmptyWorkflow          ErrorKind = iota + 1
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
)

// Error represents a validation error with position info.
type Error struct {
	Msg      string
	Line     int
	Column   int
	Severity string // "error" (default) or "warning"
	Kind     ErrorKind
	Name     string // primary entity referenced by this error
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
	}
	return "UNKNOWN"
}

// pkgKey is the composite (package, name) key under which package-scoped
// definitions — workflows, activities, workers, namespaces, nexus services —
// are stored. It mirrors resolver.pkgKey and graph's QualifiedName encoding so
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

func (v *validationCtx) checkTaskQueueCoherence() {
	type queueInfo struct {
		workerName string
		workflows  map[pkgKey]bool
		activities map[pkgKey]bool
	}
	for _, ns := range v.namespaces {
		queueWorkers := make(map[string][]queueInfo)
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
			queueWorkers[tq] = append(queueWorkers[tq], queueInfo{
				workerName: w.Name,
				workflows:  wfSet,
				activities: actSet,
			})
		}
		for queue, infos := range queueWorkers {
			if len(infos) < 2 {
				continue
			}
			first := infos[0]
			for _, other := range infos[1:] {
				if sameSet(first.workflows, other.workflows) && sameSet(first.activities, other.activities) {
					v.errs = append(v.errs, &Error{
						Msg:      fmt.Sprintf("workers %s and %s on task queue %q in namespace %s have identical type sets (redundant)", first.workerName, other.workerName, queue, ns.Name),
						Severity: "warning",
						Kind:     ErrTaskQueueIdentical,
						Name:     queue,
					})
				} else {
					v.errs = append(v.errs, &Error{
						Msg:  fmt.Sprintf("workers %s and %s on task queue %q in namespace %s have different type sets", first.workerName, other.workerName, queue, ns.Name),
						Kind: ErrTaskQueueMismatch,
						Name: queue,
					})
				}
			}
		}
	}
}

// walkAllBodies walks all workflow and nexus service sync op bodies,
// checking call routing and endpoint-service linkage.
func (v *validationCtx) walkAllBodies() {
	if len(v.namespaces) == 0 {
		return
	}

	for _, wf := range v.workflows {
		v.walkStatements(wf.Body, wf)
		for _, s := range wf.Signals {
			v.walkStatements(s.Body, wf)
		}
		for _, q := range wf.Queries {
			v.walkStatements(q.Body, wf)
		}
		for _, u := range wf.Updates {
			v.walkStatements(u.Body, wf)
		}
	}

	for _, svc := range v.nexusServices {
		for _, op := range svc.Operations {
			if op.OpType == ast.NexusOpSync {
				v.walkStatements(op.Body, nil)
			}
		}
	}
}

// walkStatements walks a statement body. caller is the enclosing workflow whose
// task queue an unqualified call inherits, or nil inside a nexus sync operation
// (which has no inherited queue).
func (v *validationCtx) walkStatements(stmts []ast.Statement, caller *ast.WorkflowDef) {
	ast.WalkStatements(stmts, func(s ast.Statement) bool {
		switch n := s.(type) {
		case *ast.ActivityCall:
			v.checkCallRouting("activity", refKey(v, n.Activity), n.Options, caller, n.Line, n.Column)
		case *ast.WorkflowCall:
			v.checkCallRouting("workflow", refKey(v, n.Workflow), n.Options, caller, n.Line, n.Column)
		case *ast.NexusCall:
			// Only a service that resolved to a local definition can be checked
			// for endpoint↔worker linkage. An unresolved service is either
			// external (resolved through an unresolved import — no error wanted,
			// issue #109) or genuinely undefined (the resolver already reported
			// UNDEFINED_SERVICE); either way the validator must not add a
			// linkage error on top.
			if n.Service.Resolved != nil {
				v.checkEndpointServiceLinkage(n.Endpoint.Name, refKey(v, n.Service), n.Line, n.Column)
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
				v.walkAsyncTarget(target, s.NodeLine(), s.NodeColumn())
			}
		}
		return true
	})
}

func (v *validationCtx) walkAsyncTarget(target ast.AsyncTarget, line, column int) {
	if nt, ok := target.(*ast.NexusTarget); ok && nt.Service.Resolved != nil {
		// See the NexusCall case in walkStatements: skip the linkage check for
		// an unresolved (external / already-reported) service.
		v.checkEndpointServiceLinkage(nt.Endpoint.Name, refKey(v, nt.Service), line, column)
	}
}

// checkCallRouting validates that an activity or workflow call can reach its
// target (identified by its resolved (package, name) key) via task queue
// routing.
func (v *validationCtx) checkCallRouting(kind string, target pkgKey, opts *ast.OptionsBlock, caller *ast.WorkflowDef, line, column int) {
	if len(v.namespaces) == 0 {
		return
	}

	explicitTQ := extractTaskQueue(opts)

	if explicitTQ != "" {
		if v.typeOnQueue(kind, target, explicitTQ) {
			return
		}
		v.errs = append(v.errs, &Error{
			Msg:    fmt.Sprintf("%s %s has task_queue %q, but no worker on that queue registers it", kind, target.name, explicitTQ),
			Line:   line,
			Column: column,
			Kind:   ErrExplicitRoutingMismatch,
			Name:   target.name,
		})
		return
	}

	// Implicit routing: the call inherits the calling workflow's task queue.
	if caller == nil {
		return
	}
	callerQueues := v.taskQueuesForType("workflow", v.key(caller.Package, caller.Name))
	if len(callerQueues) == 0 {
		return
	}

	for _, tq := range callerQueues {
		if !v.typeOnQueue(kind, target, tq) {
			v.errs = append(v.errs, &Error{
				Msg:    fmt.Sprintf("%s %s is not on any worker polling task queue %q (inherited from workflow %s)", kind, target.name, tq, caller.Name),
				Line:   line,
				Column: column,
				Kind:   ErrImplicitRoutingMismatch,
				Name:   target.name,
			})
		}
	}
}

// typeOnQueue checks if a workflow or activity (identified by its (package,
// name) key) is registered on any worker instantiated on the given task queue.
func (v *validationCtx) typeOnQueue(kind string, target pkgKey, taskQueue string) bool {
	for _, ns := range v.namespaces {
		for _, nw := range ns.Workers {
			nwTQ := extractTaskQueue(nw.Options)
			if nwTQ != taskQueue {
				continue
			}
			w := nw.Worker.Resolved
			if w == nil {
				continue
			}
			switch kind {
			case "activity":
				for _, ref := range w.Activities {
					if refKey(v, ref) == target {
						return true
					}
				}
			case "workflow":
				for _, ref := range w.Workflows {
					if refKey(v, ref) == target {
						return true
					}
				}
			}
		}
	}
	return false
}

// taskQueuesForType returns all task queues that a given workflow or activity
// (identified by its (package, name) key) is instantiated on across all
// namespaces.
func (v *validationCtx) taskQueuesForType(kind string, target pkgKey) []string {
	seen := make(map[string]bool)
	var queues []string
	for _, ns := range v.namespaces {
		for _, nw := range ns.Workers {
			w := nw.Worker.Resolved
			if w == nil {
				continue
			}
			var found bool
			switch kind {
			case "workflow":
				for _, ref := range w.Workflows {
					if refKey(v, ref) == target {
						found = true
						break
					}
				}
			case "activity":
				for _, ref := range w.Activities {
					if refKey(v, ref) == target {
						found = true
						break
					}
				}
			}
			if found {
				tq := extractTaskQueue(nw.Options)
				if tq != "" && !seen[tq] {
					seen[tq] = true
					queues = append(queues, tq)
				}
			}
		}
	}
	return queues
}

// checkEndpointServiceLinkage verifies that the endpoint's task queue has a
// worker that registers the given service (identified by its resolved
// (package, name) key). The endpoint is looked up flat-global by bare name.
func (v *validationCtx) checkEndpointServiceLinkage(endpoint string, service pkgKey, line, column int) {
	ep, ok := v.allEndpoints[endpoint]
	if !ok {
		return // endpoint not found — already reported by resolver
	}
	tq := extractTaskQueue(ep.Options)
	if tq == "" {
		return // missing task_queue — already reported in checkTaskQueueRequirements
	}

	for _, ns := range v.namespaces {
		for _, nw := range ns.Workers {
			nwTQ := extractTaskQueue(nw.Options)
			if nwTQ != tq {
				continue
			}
			w := nw.Worker.Resolved
			if w == nil {
				continue
			}
			for _, ref := range w.Services {
				if refKey(v, ref) == service {
					return // found a worker on the right queue with this service
				}
			}
		}
	}

	v.errs = append(v.errs, &Error{
		Msg:    fmt.Sprintf("nexus endpoint %s routes to task queue %q, but no worker on that queue has service %s", endpoint, tq, service.name),
		Line:   line,
		Column: column,
		Kind:   ErrEndpointServiceLinkage,
		Name:   endpoint,
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
func checkUncovered[T ast.Node](defs map[pkgKey]T, covered map[pkgKey]bool, msgFmt string, kind ErrorKind, errs *[]*Error) {
	for key, node := range defs {
		if !covered[key] {
			*errs = append(*errs, &Error{
				Msg:      fmt.Sprintf(msgFmt, key.name),
				Line:     node.NodeLine(),
				Column:   node.NodeColumn(),
				Severity: "warning",
				Kind:     kind,
				Name:     key.name,
			})
		}
	}
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
