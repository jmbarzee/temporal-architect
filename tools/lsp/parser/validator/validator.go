package validator

import (
	"cmp"
	"fmt"
	"slices"
	"strings"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
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
	ErrIDPolicyIncompatible
	ErrIDPolicyWithoutIDScheme
	ErrChildStartConflictMismatch
	ErrNexusRunWithoutIDScheme
	ErrTaskQueueOverlap
	ErrInstanceQueueNoStartTimeout
	ErrInstanceFamilyHostsWorkflow
	ErrInstanceFamilyHostsNexusService
	ErrInstanceFamilyVersioned
	ErrNexusCallerNotAllowed
	ErrWorkerDuplicateTypeName
	ErrWorkerMultiSDK
	ErrImplNotFound
	ErrCrossSDKCall
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
	case ErrIDPolicyIncompatible:
		return "ID_POLICY_INCOMPATIBLE"
	case ErrIDPolicyWithoutIDScheme:
		return "ID_POLICY_WITHOUT_ID_SCHEME"
	case ErrChildStartConflictMismatch:
		return "CHILD_START_CONFLICT_MISMATCH"
	case ErrNexusCallerNotAllowed:
		return "NEXUS_CALLER_NOT_ALLOWED"
	case ErrNexusRunWithoutIDScheme:
		return "NEXUS_RUN_WITHOUT_ID_SCHEME"
	case ErrTaskQueueOverlap:
		return "TASK_QUEUE_OVERLAP"
	case ErrInstanceQueueNoStartTimeout:
		return "INSTANCE_QUEUE_NO_START_TIMEOUT"
	case ErrInstanceFamilyHostsWorkflow:
		return "INSTANCE_FAMILY_HOSTS_WORKFLOW"
	case ErrInstanceFamilyHostsNexusService:
		return "INSTANCE_FAMILY_HOSTS_NEXUS_SERVICE"
	case ErrInstanceFamilyVersioned:
		return "INSTANCE_FAMILY_VERSIONED"
	case ErrWorkerDuplicateTypeName:
		return "WORKER_DUPLICATE_TYPE_NAME"
	case ErrWorkerMultiSDK:
		return "WORKER_MULTI_SDK"
	case ErrImplNotFound:
		return "IMPL_NOT_FOUND"
	case ErrCrossSDKCall:
		return "CROSS_SDK_CALL"
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

type validationCtx struct {
	file          *ast.File
	workflows     map[pkgKey]*ast.WorkflowDef
	activities    map[pkgKey]*ast.ActivityDef
	workers       map[pkgKey]*ast.WorkerDef
	namespaces    map[pkgKey]*ast.NamespaceDef
	nexusServices map[pkgKey]*ast.NexusServiceDef
	// nsDefs is every namespace in namespaces, in definition order, so queue
	// checks that report per placement run in source order.
	nsDefs []*ast.NamespaceDef
	// crossings are the SDKs on each side of every call site between SDKs.
	crossings map[callSite]*sdkSides
	errs      []*Error
}

// key returns the (package, name) key for a definition: its package identity
// (ast.PackageIDOf, folding in the file-package fallback) and name.
func (v *validationCtx) key(def ast.Packaged, name string) pkgKey {
	return pkgKey{ast.PackageIDOf(def, v.file), name}
}

// keepFirst sets m[k] to v unless k is already set, and reports whether it did.
func keepFirst[V any](m map[pkgKey]V, k pkgKey, v V) bool {
	if _, ok := m[k]; ok {
		return false
	}
	m[k] = v
	return true
}

// refKey returns the (package, name) key a worker registration or call-site
// reference resolves to: the resolved target's own package when resolved (so a
// ref in package P to a same-named def keys to the package that actually holds
// the def). A ref that did not resolve keys under a prefix no package identity
// has, so it never matches — and never covers — a real definition: an external
// one by the import path it reaches (so two aliases of one path compare equal),
// an undefined one by its written qualifier. Mirrors graph.hostedRefQName.
func refKey[T interface {
	comparable
	ast.Packaged
}](v *validationCtx, r ast.Ref[T]) pkgKey {
	var zero T
	if r.Resolved != zero {
		return pkgKey{ast.PackageIDOf(r.Resolved, v.file), r.Name}
	}
	if r.External != "" {
		return pkgKey{unresolvedPkg + r.External, r.Name}
	}
	return pkgKey{unresolvedPkg + r.Package, r.Name}
}

// unresolvedPkg prefixes the package element of an unresolved ref's key.
const unresolvedPkg = "\x00"

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
		file:          file,
		workflows:     make(map[pkgKey]*ast.WorkflowDef),
		activities:    make(map[pkgKey]*ast.ActivityDef),
		workers:       make(map[pkgKey]*ast.WorkerDef),
		namespaces:    make(map[pkgKey]*ast.NamespaceDef),
		nexusServices: make(map[pkgKey]*ast.NexusServiceDef),
	}

	// Build definition maps from the AST, keyed by (package, name). A key
	// declared twice (a DUPLICATE_* resolve error) is its first declaration's,
	// as the resolver keeps it.
	for _, def := range file.Definitions {
		switch d := def.(type) {
		case *ast.WorkflowDef:
			keepFirst(v.workflows, v.key(d, d.Name), d)
		case *ast.ActivityDef:
			keepFirst(v.activities, v.key(d, d.Name), d)
		case *ast.WorkerDef:
			keepFirst(v.workers, v.key(d, d.Name), d)
		case *ast.NamespaceDef:
			if keepFirst(v.namespaces, v.key(d, d.Name), d) {
				v.nsDefs = append(v.nsDefs, d)
			}
		case *ast.NexusServiceDef:
			keepFirst(v.nexusServices, v.key(d, d.Name), d)
		}
	}

	// 1. Empty definition warnings, registrations colliding by name, and
	// workers implemented in several SDKs.
	v.checkEmptyDefinitions(file.Definitions)
	v.checkWorkerTypeNames(file.Definitions)
	v.checkMultiSDK(file.Definitions)

	// 2. Task queue requirements.
	v.checkTaskQueueRequirements()

	// 3. Coverage warnings.
	v.checkCoverage()

	// 4. Task queue coherence, then the queue hazards coherence cannot see.
	v.checkTaskQueueCoherence()
	v.checkTaskQueueOverlap()
	v.checkInstanceFamilies()

	// 5-6. Call routing, endpoint-service linkage, and endpoint caller
	// allowlists (walks resolved bodies).
	v.walkAllBodies(file.Definitions)

	// 7. id: parent claims, id_scheme overlap and ID policies (definition order).
	v.checkParentSends(file.Definitions)
	v.checkIDSchemeOverlap()
	v.checkIDPolicies(file.Definitions)

	// Checks walk definition maps, so sort for an order that holds run to run;
	// the stable sort keeps same-code errors at one position in emission order
	// (#237).
	slices.SortStableFunc(v.errs, func(a, b *Error) int {
		return cmp.Or(cmp.Compare(a.File, b.File), cmp.Compare(a.Line, b.Line), cmp.Compare(a.Column, b.Column), cmp.Compare(a.Code(), b.Code()))
	})
	return v.errs
}

// checkEmptyDefinitions warns on each empty definition. It is body-local, so a
// dropped duplicate is checked too (see walkAllBodies).
func (v *validationCtx) checkEmptyDefinitions(defs []ast.Definition) {
	for _, def := range defs {
		switch d := def.(type) {
		case *ast.WorkflowDef:
			if !hasNonCommentStmts(d.Body) && len(d.Signals) == 0 && len(d.Queries) == 0 && len(d.Updates) == 0 && d.State == nil {
				v.errs = append(v.errs, &Error{
					Msg:      fmt.Sprintf("workflow %s has an empty body", d.Name),
					Line:     d.Line,
					Column:   d.Column,
					Severity: "warning",
					Kind:     ErrEmptyWorkflow,
					Name:     d.Name,
					File:     d.SourceFile,
				})
			}
		case *ast.ActivityDef:
			if !hasNonCommentStmts(d.Body) {
				msg := fmt.Sprintf("activity %s has an empty body", d.Name)
				if len(d.Body) > 0 {
					msg = fmt.Sprintf("activity %s body contains only comments — add at least one statement", d.Name)
				}
				v.errs = append(v.errs, &Error{
					Msg:      msg,
					Line:     d.Line,
					Column:   d.Column,
					Severity: "warning",
					Kind:     ErrEmptyActivity,
					Name:     d.Name,
					File:     d.SourceFile,
				})
			}
		case *ast.WorkerDef:
			if len(d.Workflows) == 0 && len(d.Activities) == 0 && len(d.Services) == 0 {
				v.errs = append(v.errs, &Error{
					Msg:      fmt.Sprintf("worker %s has no workflow, activity, or nexus service registrations", d.Name),
					Line:     d.Line,
					Column:   d.Column,
					Severity: "warning",
					Kind:     ErrEmptyWorker,
					Name:     d.Name,
					File:     d.SourceFile,
				})
			}
		case *ast.NamespaceDef:
			if len(d.Workers) == 0 && len(d.Endpoints) == 0 {
				v.errs = append(v.errs, &Error{
					Msg:      fmt.Sprintf("namespace %s has no worker or endpoint instantiations", d.Name),
					Line:     d.Line,
					Column:   d.Column,
					Severity: "warning",
					Kind:     ErrEmptyNamespace,
					Name:     d.Name,
					File:     d.SourceFile,
				})
			}
		}
	}
}

// checkWorkerTypeNames reports, per worker definition in order, a name
// registered twice for one kind: the same entry repeated, or two types from
// different packages. Temporal keys registrations by name, and a package has
// no runtime meaning, so one worker holds each name once. Each collision
// reports at the later entry.
func (v *validationCtx) checkWorkerTypeNames(defs []ast.Definition) {
	for _, def := range defs {
		w, ok := def.(*ast.WorkerDef)
		if !ok {
			continue
		}
		checkTypeNames(v, w, "workflow", w.Workflows)
		checkTypeNames(v, w, "activity", w.Activities)
		checkTypeNames(v, w, "nexus service", w.Services)
	}
}

// checkMultiSDK warns at the second `@sdk` of each worker implemented in more
// than one SDK: every implementation must replay the worker's workflows
// identically, a significant risk of nondeterminism errors.
func (v *validationCtx) checkMultiSDK(defs []ast.Definition) {
	for _, def := range defs {
		w, ok := def.(*ast.WorkerDef)
		if !ok || len(w.SDKs) < 2 {
			continue
		}
		second := w.SDKs[1]
		v.errs = append(v.errs, &Error{
			Msg:      fmt.Sprintf("worker %s has implementations in %d SDKs; every implementation must replay its workflows identically, so justify the pattern explicitly next to the annotations", w.Name, len(w.SDKs)),
			Line:     second.Line,
			Column:   second.Column,
			Severity: "warning",
			Kind:     ErrWorkerMultiSDK,
			Name:     w.Name,
			File:     w.SourceFile,
		})
	}
}

// checkTypeNames reports each of refs whose name an earlier ref already
// registers on w. An unresolved ref is skipped: it is external or already
// reported as undefined.
func checkTypeNames[T interface {
	comparable
	ast.Packaged
}](v *validationCtx, w *ast.WorkerDef, kind string, refs []ast.Ref[T]) {
	var zero T
	first := make(map[string]pkgKey)
	for _, r := range refs {
		if r.Resolved == zero {
			continue
		}
		at := refKey(v, r)
		prev, seen := first[r.Name]
		if !seen {
			first[r.Name] = at
			continue
		}
		packages := ast.PackageRefs(v.file)
		msg := fmt.Sprintf("worker %s registers %s %s and %s %s under one name, %q; Temporal registers types by name, not package, so one worker can hold only one of them", w.Name, kind, ast.Label(packages, prev.pkg, prev.name), kind, ast.Label(packages, at.pkg, at.name), r.Name)
		if prev == at {
			msg = fmt.Sprintf("worker %s registers %s %s twice; Temporal registers each name once per worker", w.Name, kind, ast.Label(packages, at.pkg, at.name))
		}
		v.errs = append(v.errs, &Error{
			Msg:    msg,
			Line:   r.Line,
			Column: r.Column,
			Kind:   ErrWorkerDuplicateTypeName,
			Name:   w.Name,
			File:   w.SourceFile,
		})
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
			instantiatedWorkers[v.key(w, w.Name)] = true
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

	checkUncovered(v.workflows, coveredWorkflows, ast.PackageRefs(v.file), "workflow %s is not registered on any instantiated worker", ErrUncoveredWorkflow, &v.errs)
	checkUncovered(v.activities, coveredActivities, ast.PackageRefs(v.file), "activity %s is not registered on any instantiated worker", ErrUncoveredActivity, &v.errs)
	checkUncovered(v.nexusServices, coveredServices, ast.PackageRefs(v.file), "nexus service %s is not referenced by any worker", ErrUncoveredService, &v.errs)
	checkUncovered(v.workers, instantiatedWorkers, ast.PackageRefs(v.file), "worker %s is not instantiated in any namespace", ErrUninstantiatedWorker, &v.errs)
}

// checkTaskQueueCoherence reports workers that share a (namespace, deploy key)
// pair: one key is one queue or one family of queues, so its placements must
// register the same types. The namespace is keyed by deploy name, so two
// packages that each declare the same namespace share its queues. Namespaces
// are walked in the merged definition order — source order — so the first
// instantiation on a key is the reference and each later one is where a report
// lands (#248). A malformed queue has no key and is not compared.
//
// Every worker polls the queue's workflow and activity tasks, so their type
// sets must match. Only a worker registering a nexus service polls its Nexus
// tasks, so service sets are compared only among those workers: a poller
// lacking a requested service fails the call with a non-retryable NotFound.
func (v *validationCtx) checkTaskQueueCoherence() {
	type queueInfo struct {
		workerName string
		queue      string
		workflows  map[pkgKey]bool
		activities map[pkgKey]bool
		services   map[pkgKey]bool
		file       string // SourceFile of the namespace holding the instantiation
		ast.Pos           // the worker instantiation inside that namespace
	}
	type groupKey struct{ namespace, key string }
	var order []groupKey
	queueWorkers := make(map[groupKey][]queueInfo)
	for _, ns := range v.nsDefs {
		for _, nw := range ns.Workers {
			tq := extractTaskQueue(nw.Options)
			key, ok := ast.ParseDeployQueue(tq).Key()
			w := nw.Worker.Resolved
			if tq == "" || !ok || w == nil {
				continue
			}
			at := groupKey{ns.Name, key}
			if _, seen := queueWorkers[at]; !seen {
				order = append(order, at)
			}
			queueWorkers[at] = append(queueWorkers[at], queueInfo{
				workerName: w.Name,
				queue:      tq,
				workflows:  refSet(v, w.Workflows),
				activities: refSet(v, w.Activities),
				services:   refSet(v, w.Services),
				file:       ns.SourceFile,
				Pos:        nw.Pos,
			})
		}
	}
	for _, at := range order {
		infos := queueWorkers[at]
		first := infos[0]
		svcAnchor := -1
		if len(first.services) > 0 {
			svcAnchor = 0
		}
		for i := 1; i < len(infos); i++ {
			other := infos[i]
			report := func(kind ErrorKind, severity, format string, a queueInfo) {
				queues := fmt.Sprintf("task queue %q", a.queue)
				if other.queue != a.queue {
					queues = fmt.Sprintf("task queues %q and %q", a.queue, other.queue)
				}
				v.errs = append(v.errs, &Error{
					Msg:      fmt.Sprintf(format, a.workerName, other.workerName, queues, at.namespace),
					Line:     other.Line,
					Column:   other.Column,
					Severity: severity,
					Kind:     kind,
					Name:     a.queue,
					File:     other.file,
				})
			}
			if !sameSet(first.workflows, other.workflows) || !sameSet(first.activities, other.activities) {
				report(ErrTaskQueueMismatch, "", "workers %s and %s on %s in namespace %s have different type sets", first)
			}
			if len(other.services) > 0 {
				if svcAnchor < 0 {
					svcAnchor = i
				} else if !sameSet(infos[svcAnchor].services, other.services) {
					report(ErrTaskQueueMismatch, "", "workers %s and %s on %s in namespace %s register different nexus service sets", infos[svcAnchor])
				}
			}
			for _, earlier := range infos[:i] {
				if sameSet(earlier.workflows, other.workflows) && sameSet(earlier.activities, other.activities) && sameSet(earlier.services, other.services) {
					report(ErrTaskQueueIdentical, "warning", "workers %s and %s on %s in namespace %s have identical type sets (redundant)", earlier)
					break
				}
			}
		}
	}
}

// refSet returns the resolved (package, name) keys of refs.
func refSet[T interface {
	comparable
	ast.Packaged
}](v *validationCtx, refs []ast.Ref[T]) map[pkgKey]bool {
	set := make(map[pkgKey]bool, len(refs))
	for _, ref := range refs {
		set[refKey(v, ref)] = true
	}
	return set
}

// checkTaskQueueOverlap hints at two placements in one namespace whose deploy
// keys differ, at least one a family, that could still name the same queue: a
// static "sandbox-pool" beside "sandbox-{sandboxId}" shares a queue with the
// sandbox whose ID is "pool", and coherence cannot see it. A bare family
// overlaps everything by construction and is exempt. Each pair reports once, at
// the later placement's task_queue entry.
func (v *validationCtx) checkTaskQueueOverlap() {
	type placed struct {
		worker string
		queue  ast.Queue
		entry  *ast.OptionEntry
		file   string
	}
	var order []string
	byNamespace := make(map[string][]placed)
	for _, ns := range v.nsDefs {
		for _, nw := range ns.Workers {
			e := optionEntry(nw.Options, "task_queue")
			if e == nil {
				continue
			}
			if _, seen := byNamespace[ns.Name]; !seen {
				order = append(order, ns.Name)
			}
			byNamespace[ns.Name] = append(byNamespace[ns.Name], placed{nw.Worker.Name, ast.ParseDeployQueue(e.Value), e, ns.SourceFile})
		}
	}
	for _, name := range order {
		all := byNamespace[name]
		for i, a := range all {
			for _, b := range all[i+1:] {
				// Two opaque queues overlap only when equal, which is one key, so
				// an overlapping pair with two keys holds a family. A malformed
				// queue overlaps nothing.
				if a.queue.SameKey(b.queue) || a.queue.Bare() || b.queue.Bare() || !a.queue.Overlaps(b.queue) {
					continue
				}
				v.errs = append(v.errs, &Error{
					Msg:      fmt.Sprintf("task_queue %q of worker %s and %q of worker %s could name the same queue in namespace %s", b.queue.Spelling, b.worker, a.queue.Spelling, a.worker, name),
					Line:     b.entry.Line,
					Column:   b.entry.Column,
					Severity: "hint",
					Kind:     ErrTaskQueueOverlap,
					Name:     name,
					File:     b.file,
				})
			}
		}
	}
}

// checkInstanceFamilies reports, per family placement in source order, the
// hazards of hosting on per-instance queues: workflows whose executions stall
// when their instance is gone, nexus services no static endpoint can reach,
// and versioning whose per-queue caps a churning family exhausts. The first and
// last are hints, since a long-lived family may do either on purpose.
func (v *validationCtx) checkInstanceFamilies() {
	for _, ns := range v.nsDefs {
		for _, nw := range ns.Workers {
			tq := extractTaskQueue(nw.Options)
			if ast.ParseDeployQueue(tq).Form != ast.QueueParsed {
				continue
			}
			if w := nw.Worker.Resolved; w != nil {
				var workflows, services []string
				for _, r := range w.Workflows {
					if r.Resolved != nil {
						workflows = append(workflows, r.Resolved.Name)
					}
				}
				for _, r := range w.Services {
					if r.Resolved != nil {
						services = append(services, r.Resolved.Name)
					}
				}
				if len(workflows) > 0 {
					v.errs = append(v.errs, &Error{
						Msg:      fmt.Sprintf("worker %s hosts workflow %s on the per-instance queue family %q in namespace %s: if an instance goes away for good, its executions stall until their own timeout; short-lived families should host workflows on a shared queue", nw.Worker.Name, sortedList(workflows), tq, ns.Name),
						Line:     nw.Line,
						Column:   nw.Column,
						Severity: "hint",
						Kind:     ErrInstanceFamilyHostsWorkflow,
						Name:     ns.Name,
						File:     ns.SourceFile,
					})
				}
				if len(services) > 0 {
					v.errs = append(v.errs, &Error{
						Msg:      fmt.Sprintf("worker %s registers nexus service %s on the per-instance queue family %q in namespace %s, but a .twf endpoint targets one static queue, so no endpoint in this design reaches it; put the service on a static queue and route on from an async operation's workflow", nw.Worker.Name, sortedList(services), tq, ns.Name),
						Line:     nw.Line,
						Column:   nw.Column,
						Severity: "warning",
						Kind:     ErrInstanceFamilyHostsNexusService,
						Name:     ns.Name,
						File:     ns.SourceFile,
					})
				}
			}
			e := optionEntry(nw.Options, "versioning")
			if e == nil {
				continue
			}
			var cost string
			switch e.Value {
			case "deployment":
				cost = "a deployment version accepts at most 100 distinct task queues over its life, so new instance queues are refused once that many have registered"
			case "build_id":
				cost = "every new instance queue needs its own versioning API call (off by default, not on Cloud)"
			default:
				continue
			}
			v.errs = append(v.errs, &Error{
				Msg:      fmt.Sprintf("worker %s in namespace %s is a per-instance family on %q with versioning: %s; %s", nw.Worker.Name, ns.Name, tq, e.Value, cost),
				Line:     e.Line,
				Column:   e.Column,
				Severity: "hint",
				Kind:     ErrInstanceFamilyVersioned,
				Name:     ns.Name,
				File:     ns.SourceFile,
			})
		}
	}
}

// sortedList joins names sorted and deduplicated, comma-separated.
func sortedList(names []string) string {
	slices.Sort(names)
	return strings.Join(slices.Compact(names), ", ")
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
	file string          // SourceFile of the calling definition (#238)
	def  string          // graph definition key of the workflow or sync operation
	body ast.BodyContext // what the body holding the call runs in
}

// in returns c as seen from a body that runs in body.
func (c caller) in(body ast.BodyContext) caller {
	c.body = body
	return c
}

// walkAllBodies walks all workflow and nexus service sync op bodies, in
// definition order, checking call routing, endpoint-service linkage, and
// endpoint caller allowlists.
//
// A name declared twice (a DUPLICATE_* resolve error), whether a definition
// or a handler or operation in one, keeps its first declaration, as the
// resolver does, and the validator applies one rule to the later ones. The
// empty-definition check runs on every declaration. Body-local checks on a
// workflow, handler, activity or nexus service body (ID policies on a start)
// run on every body, kept or dropped, so the code the user wrote is still
// checked. A dropped worker or namespace gets nothing more: its
// registrations stay unresolved, and placement checks range only kept
// namespaces. Cross-definition checks, relating one definition to others
// (routing, linkage, allowlists, parent sends, coherence, overlaps), see only
// the kept declaration: hence the filters here (with ast.FirstDeclared),
// keptWorkflows, and nsDefs.
func (v *validationCtx) walkAllBodies(defs []ast.Definition) {
	if len(v.namespaces) == 0 {
		return
	}
	v.crossings = sdkCrossings(graph.Extract(v.file))

	for _, def := range defs {
		switch d := def.(type) {
		case *ast.WorkflowDef:
			key := v.key(d, d.Name)
			if v.workflows[key] != d {
				continue
			}
			from := caller{kind: "workflow", key: key, file: d.SourceFile, def: graph.DefKey(graph.KindWorkflow, ast.QualifiedName(key.pkg, key.name))}
			v.walkStatements(d.Body, from.in(d.Context))
			for _, s := range ast.FirstDeclared(d.Signals) {
				v.walkStatements(s.Body, from.in(s.Context))
			}
			for _, q := range ast.FirstDeclared(d.Queries) {
				v.walkStatements(q.Body, from.in(q.Context))
			}
			for _, u := range ast.FirstDeclared(d.Updates) {
				v.walkStatements(u.Body, from.in(u.Context))
			}
		case *ast.NexusServiceDef:
			key := v.key(d, d.Name)
			if v.nexusServices[key] != d {
				continue
			}
			for _, op := range ast.FirstDeclared(d.Operations) {
				if op.OpType == ast.NexusOpSync {
					def := graph.DefKey(graph.KindNexusOperation, graph.NexusOpQualifiedName(ast.QualifiedName(key.pkg, key.name), op.Name))
					v.walkStatements(op.Body, caller{kind: "nexus service", key: key, file: d.SourceFile, def: def}.in(op.Context))
				}
			}
		}
	}
}

// walkStatements walks a statement body, checking each call in it as made
// from the hosted definition from.
func (v *validationCtx) walkStatements(stmts []ast.Statement, from caller) {
	ast.WalkStatements(stmts, func(s ast.Statement) bool {
		v.checkCrossSDK(s, from)
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
				v.checkEndpointServiceLinkage(n.Endpoint.Resolved, refKey(v, n.Service), n.Line, n.Column, from.file)
			}
			v.checkCallerAllowed(n.Endpoint.Resolved, from, n.Line, n.Column)
		case *ast.SignalSendStmt:
			// A signal send is a *use* of its handle promise — no routing
			// check applies (a signal is delivered by workflow ID, not
			// task-queue-matched; see graph.emitSignalSend).
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
			v.checkEndpointServiceLinkage(t.Endpoint.Resolved, refKey(v, t.Service), line, column, from.file)
		}
		v.checkCallerAllowed(t.Endpoint.Resolved, from, line, column)
	}
}

// checkCallRouting validates that an activity or workflow call can reach its
// target (identified by its resolved (package, name) key) from every
// namespace the caller is hosted in. A task queue is scoped to its namespace,
// so the target must be on a worker polling the routed queue in that same
// namespace. An explicit task_queue — on the call, else in the target's
// default_options — names a queue in each of the caller's namespaces and must
// match a placement (spec 03 § Queue matching); an implicit call inherits each
// (namespace, queue) placement of its calling workflow and needs a placement
// with the same deploy key. Implicit calls from a sync nexus operation are not
// checked (#241), nor from a placement missing its task_queue or whose queue is
// malformed, which have none to inherit. An unhosted caller is not checked — it
// has no namespace to route from and is already reported as uncovered.
// defaults is the target's default_options.
func (v *validationCtx) checkCallRouting(kind string, target pkgKey, opts, defaults *ast.OptionsBlock, from caller, line, column int) {
	explicitTQ, source := extractTaskQueue(opts), ""
	if explicitTQ == "" {
		explicitTQ, source = extractTaskQueue(defaults), " (from its default_options)"
	}
	if explicitTQ != "" {
		call := ast.ParseCallQueue(explicitTQ)
		var family ast.Queue // the first family placement the call reaches
		var familyNS string
		for _, ns := range v.callerNamespaces(from) {
			if hosts := v.hosts(kind, target, ns, call.Matches); len(hosts) > 0 {
				if i := slices.IndexFunc(hosts, isFamily); i >= 0 && familyNS == "" {
					family, familyNS = hosts[i], ns
				}
				continue
			}
			msg := fmt.Sprintf("%s %s has task_queue %q%s, but no worker on that queue in namespace %s registers it", kind, target.name, explicitTQ, source, ns)
			switch {
			case call.Bare():
				msg = fmt.Sprintf("%s %s has a learned task_queue %q%s, but no per-instance worker family in namespace %s registers it; a .twf learned queue names a family member (model a static set as a family or as static calls)", kind, target.name, explicitTQ, source, ns)
			case isFamily(call):
				msg = fmt.Sprintf("%s %s has task_queue %q%s, but no worker polling a queue of that shape in namespace %s registers it", kind, target.name, explicitTQ, source, ns)
			}
			v.errs = append(v.errs, &Error{
				Msg:    msg,
				Line:   line,
				Column: column,
				Kind:   ErrExplicitRoutingMismatch,
				Name:   target.name,
				File:   from.file,
			})
		}
		// A task on a queue nobody polls waits until something bounds it, and
		// a family's instance may be gone for good.
		if kind == "activity" && familyNS != "" && !boundsWait(opts) && !boundsWait(defaults) {
			v.errs = append(v.errs, &Error{
				Msg:      fmt.Sprintf("activity %s routes to the per-instance queue family %q in namespace %s with neither schedule_to_start_timeout nor schedule_to_close_timeout: if instances are short-lived, a task for a vanished instance waits until the calling workflow's own timeout or cancellation", target.name, family.Spelling, familyNS),
				Line:     line,
				Column:   column,
				Severity: "hint",
				Kind:     ErrInstanceQueueNoStartTimeout,
				Name:     target.name,
				File:     from.file,
			})
		}
		return
	}

	if from.body == ast.BodyNexusSync {
		return
	}
	for _, at := range v.placementsOf(from.kind, from.key) {
		inherited := ast.ParseDeployQueue(at.queue)
		if at.queue == "" || inherited.Form == ast.QueueMalformed || len(v.hosts(kind, target, at.namespace, inherited.SameKey)) > 0 {
			continue
		}
		msg := fmt.Sprintf("%s %s is not on any worker polling task queue %q in namespace %s (inherited from workflow %s)", kind, target.name, at.queue, at.namespace, from.key.name)
		if isFamily(inherited) {
			msg = fmt.Sprintf("%s %s is not on any worker polling a queue of the shape of %q in namespace %s (inherited from workflow %s)", kind, target.name, at.queue, at.namespace, from.key.name)
		}
		v.errs = append(v.errs, &Error{
			Msg:    msg,
			Line:   line,
			Column: column,
			Kind:   ErrImplicitRoutingMismatch,
			Name:   target.name,
			File:   from.file,
		})
	}
}

// callSite is a call in a body: its caller's graph definition key and its site.
type callSite struct {
	def  string
	site ast.Site
}

// sdkSides are the SDKs of a call site's callers and of its callees.
type sdkSides struct{ from, to []string }

// sdkCrossings indexes the graph's edges between SDKs by call site. A
// caller deployed on several workers makes the call from each, so its call
// site is between SDKs when any of its edges is, and names those edges' SDKs.
func sdkCrossings(g *graph.Graph) map[callSite]*sdkSides {
	sites := map[callSite]*sdkSides{}
	for _, c := range g.SDKCrossings() {
		k := callSite{c.Caller, c.Edge.Site}
		if sites[k] == nil {
			sites[k] = &sdkSides{}
		}
		sites[k].from = union(sites[k].from, c.From)
		sites[k].to = union(sites[k].to, c.To)
	}
	return sites
}

// union appends to a the entries of b it lacks.
func union(a, b []string) []string {
	for _, s := range b {
		if !slices.Contains(a, s) {
			a = append(a, s)
		}
	}
	return a
}

// checkCrossSDK hints at a call or signal send between SDKs, once per call site.
func (v *validationCtx) checkCrossSDK(s ast.Statement, from caller) {
	kind, name := callee(s)
	k := callSite{from.def, ast.SiteOf(from.file, s)}
	sides := v.crossings[k]
	if kind == "" || sides == nil {
		return
	}
	delete(v.crossings, k)
	v.errs = append(v.errs, &Error{
		Msg:      fmt.Sprintf("%s %s runs on %s and its caller on %s; read skills/temporal-architect/reference/cross-sdk.md", kind, name, strings.Join(sides.to, ", "), strings.Join(sides.from, ", ")),
		Line:     s.NodeLine(),
		Column:   s.NodeColumn(),
		Severity: "hint",
		Kind:     ErrCrossSDKCall,
		Name:     name,
		File:     from.file,
	})
}

// callee returns the kind and written name of the activity, workflow or Nexus
// operation s calls, or of the signal it sends under its receiver's type, or ""
// when it calls none.
func callee(s ast.Statement) (kind, name string) {
	switch n := s.(type) {
	case *ast.ActivityCall:
		return "activity", n.Activity.Name
	case *ast.WorkflowCall:
		return "workflow", n.Workflow.Name
	case *ast.NexusCall:
		return "nexus operation", n.Service.Name + "." + n.Operation.Name
	case *ast.SignalSendStmt:
		if wf := n.Target(); wf != nil {
			return "signal", wf.Name + "." + n.Signal
		}
		return "", ""
	}
	switch t := ast.AsyncTargetOf(s).(type) {
	case *ast.ActivityTarget:
		return "activity", t.Activity.Name
	case *ast.WorkflowTarget:
		return "workflow", t.Workflow.Name
	case *ast.NexusTarget:
		return "nexus operation", t.Service.Name + "." + t.Operation.Name
	}
	return "", ""
}

// isFamily reports whether q parses with parameters: a worker's per-instance
// family, or a call's interpolated queue.
func isFamily(q ast.Queue) bool { return q.Form == ast.QueueParsed }

// boundsWait reports whether opts bounds how long a scheduled activity task may
// wait for a poller.
func boundsWait(opts *ast.OptionsBlock) bool {
	return optionEntry(opts, "schedule_to_start_timeout") != nil || optionEntry(opts, "schedule_to_close_timeout") != nil
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

// hosts returns the worker queues, in definition then entry order, of the
// placements in namespace ns whose worker registers the workflow, activity, or
// nexus service identified by target and whose queue polls accepts. Each check
// passes its own comparison (spec 03 § Queue matching). A malformed placement
// hosts nothing: Matches and SameKey reject it, and an endpoint queue spelled
// like it has a parameter, so linkage skips that endpoint.
func (v *validationCtx) hosts(kind string, target pkgKey, ns string, polls func(ast.Queue) bool) []ast.Queue {
	var out []ast.Queue
	for _, def := range v.nsDefs {
		if def.Name != ns {
			continue
		}
		for _, nw := range def.Workers {
			q := ast.ParseDeployQueue(extractTaskQueue(nw.Options))
			if !polls(q) {
				continue
			}
			if w := nw.Worker.Resolved; w != nil && v.registers(w, kind, target) {
				out = append(out, q)
			}
		}
	}
	return out
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
// (identified by its resolved (package, name) key). The queues compare by
// spelling: an endpoint targets one static queue, so it never fronts a family.
// The endpoint is the one the call resolved to, the first declaration of a
// duplicated name. file is the calling definition's SourceFile.
func (v *validationCtx) checkEndpointServiceLinkage(ep *ast.NamespaceEndpoint, service pkgKey, line, column int, file string) {
	if ep == nil {
		return // endpoint not found — already reported by resolver
	}
	tq := extractTaskQueue(ep.Options)
	if tq == "" {
		return // missing task_queue — already reported in checkTaskQueueRequirements
	}
	if len(ast.ExtractTemplateParams(tq)) > 0 {
		return // templated — already reported as ENDPOINT_TASK_QUEUE_TEMPLATED
	}
	if len(v.hosts("nexus service", service, ep.Namespace, func(q ast.Queue) bool { return q.Spelling == tq })) > 0 {
		return
	}

	v.errs = append(v.errs, &Error{
		Msg:    fmt.Sprintf("nexus endpoint %s routes to task queue %q in namespace %s, but no worker on that queue has service %s", ep.EndpointName, tq, ep.Namespace, service.name),
		Line:   line,
		Column: column,
		Kind:   ErrEndpointServiceLinkage,
		Name:   ep.EndpointName,
		File:   file,
	})
}

// checkCallerAllowed reports each namespace a nexus call is made from that the
// endpoint's allowed_caller_namespaces omits. It needs only the endpoint and
// the caller's namespaces, not the service: a call into an external service is
// the cross-team case an allowlist exists for. Entries match namespace names
// by spelling, {param}s included. An endpoint without the option declares no
// policy and is not checked.
func (v *validationCtx) checkCallerAllowed(ep *ast.NamespaceEndpoint, from caller, line, column int) {
	if ep == nil {
		return // endpoint not found — already reported by resolver
	}
	allowed, declared := allowedCallers(ep.Options)
	if !declared {
		return
	}
	for _, ns := range v.callerNamespaces(from) {
		if slices.Contains(allowed, ns) {
			continue
		}
		msg := fmt.Sprintf("nexus call through endpoint %s originates in namespace %s, which is not in its allowed_caller_namespaces %s", ep.EndpointName, ns, formatList(allowed))
		if slices.ContainsFunc(allowed, func(e string) bool { return strings.HasPrefix(e, ns+".") }) {
			msg += fmt.Sprintf("; did you mean %q? entries are .twf namespace names, not Cloud namespace IDs", ns)
		}
		v.errs = append(v.errs, &Error{
			Msg:    msg,
			Line:   line,
			Column: column,
			Kind:   ErrNexusCallerNotAllowed,
			Name:   from.key.name,
			File:   from.file,
		})
	}
}

// allowedCallers returns an endpoint's allowed_caller_namespaces entries and
// whether the option is present at all (an empty list allows no caller).
func allowedCallers(opts *ast.OptionsBlock) ([]string, bool) {
	if opts == nil {
		return nil, false
	}
	for _, e := range opts.Entries {
		if e.Key == "allowed_caller_namespaces" {
			return e.Values, true
		}
	}
	return nil, false
}

// formatList renders list entries as they are written in .twf: ["a", "b"].
func formatList(entries []string) string {
	quoted := make([]string, len(entries))
	for i, e := range entries {
		quoted[i] = fmt.Sprintf("%q", e)
	}
	return "[" + strings.Join(quoted, ", ") + "]"
}

// extractTaskQueue walks an OptionsBlock to find the task_queue key.
func extractTaskQueue(opts *ast.OptionsBlock) string {
	if e := optionEntry(opts, "task_queue"); e != nil {
		return e.Value
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
// (package, name) key is not present in the covered set, naming it by its
// label in the message and by its bare name in Error.Name.
func checkUncovered[T ast.Definition](defs map[pkgKey]T, covered map[pkgKey]bool, packages map[string]ast.PackageRef, msgFmt string, kind ErrorKind, errs *[]*Error) {
	for key, node := range defs {
		if !covered[key] {
			*errs = append(*errs, &Error{
				Msg:      fmt.Sprintf(msgFmt, ast.Label(packages, key.pkg, key.name)),
				Line:     node.NodeLine(),
				Column:   node.NodeColumn(),
				Severity: "warning",
				Kind:     kind,
				Name:     key.name,
				File:     ast.SourceFileOf(node),
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
