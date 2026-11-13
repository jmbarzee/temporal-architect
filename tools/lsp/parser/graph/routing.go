package graph

import (
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
)

// emitDispatchEdges walks every runnable body and emits dispatch edges
// per the resolution rules in README.md § "Dispatch edges":
//
//   - activityCall / workflowCall with explicit task_queue (call site,
//     else the callee's default_options): match
//     callee deployments in the caller deployment's namespace whose
//     queue matches the literal (spec 03).
//   - activityCall / workflowCall implicit: match callee deployments in
//     the caller deployment's namespace whose queue has the deploy key of
//     *this* caller deployment's queue. The walk runs once per caller
//     deployment, so a definition hosted on two workers resolves twice,
//     each against its own queue — not against the union.
//   - nexusCall: match callee deployments whose queue == endpoint.queue
//     AND whose namespace == endpoint.namespace; routing.nexusEndpoint
//     carries the endpoint deployment ID. A templated endpoint routes
//     nowhere and draws nothing.
//   - asyncBacking: emitted by the nexus service walk — operation
//     deployment → workflow deployment on the same deploy key and
//     namespace.
//
// One edge per (caller deployment, matching callee deployment) pair; a
// worker instantiated twice in one namespace reaching one callee is one edge.
// When no callee matches, no edge; a DISPATCH_NO_REACHABLE_DEPLOYMENT
// diagnostic is added so the consumer knows the call landed nowhere.
func (g *Graph) emitDispatchEdges(idx *astIndex) {
	for _, wf := range idx.workflows {
		wfQName := idx.defQName(wf, wf.Name)
		for _, callerDep := range idx.deploymentsHosting(KindWorkflow, wfQName) {
			callerID := HostedID(KindWorkflow, wfQName, callerDep.WorkerName, callerDep.NamespaceName, false)
			g.walkRunnable(idx, callerID, callerDep, wf.SourceFile, wf.Body)
			for _, s := range ast.FirstDeclared(wf.Signals) {
				g.walkRunnable(idx, callerID, callerDep, wf.SourceFile, s.Body)
			}
			for _, q := range ast.FirstDeclared(wf.Queries) {
				g.walkRunnable(idx, callerID, callerDep, wf.SourceFile, q.Body)
			}
			for _, u := range ast.FirstDeclared(wf.Updates) {
				g.walkRunnable(idx, callerID, callerDep, wf.SourceFile, u.Body)
			}
		}
	}

	for _, svc := range idx.nexusServices {
		svcQName := idx.defQName(svc, svc.Name)
		serviceDeployments := idx.deploymentsHosting(KindNexusService, svcQName)
		for _, op := range ast.FirstDeclared(svc.Operations) {
			opName := NexusOpQualifiedName(svcQName, op.Name)
			site := ast.SiteOf(svc.SourceFile, op)
			switch op.OpType {
			case ast.NexusOpAsync:
				if op.Workflow.Resolved == nil {
					g.recordUnresolved(opName, op.Workflow.Name, EdgeAsyncBacking, site, serviceDeployments)
					continue
				}
				targetName := idx.defQName(op.Workflow.Resolved, op.Workflow.Resolved.Name)
				for _, opDep := range serviceDeployments {
					fromID := HostedID(KindNexusOperation, opName, opDep.WorkerName, opDep.NamespaceName, false)
					g.emitAsyncBacking(idx, fromID, opDep, targetName, site)
				}
			case ast.NexusOpSync:
				for _, opDep := range serviceDeployments {
					fromID := HostedID(KindNexusOperation, opName, opDep.WorkerName, opDep.NamespaceName, false)
					g.walkRunnable(idx, fromID, opDep, svc.SourceFile, op.Body)
				}
			}
		}
	}
}

// walkRunnable visits each statement of a body in file once, dispatching
// call edges through the appropriate resolver. Async targets attached to
// await / promise / await-one-case nodes are handled via the AST
// walker's WithAsyncTargets option so the resolution logic stays in
// one place.
func (g *Graph) walkRunnable(idx *astIndex, callerID string, callerDep workerDeployment, file string, stmts []ast.Statement) {
	ast.WalkStatements(stmts, func(s ast.Statement) bool {
		switch n := s.(type) {
		case *ast.ActivityCall:
			g.emitActivityCall(idx, callerID, callerDep, n.Activity, n.Options, ast.SiteOf(file, n))
		case *ast.WorkflowCall:
			g.emitWorkflowCall(idx, callerID, callerDep, n.Workflow, n.Options, ast.SiteOf(file, n))
		case *ast.NexusCall:
			g.emitNexusCall(idx, callerID, n.Endpoint, n.Service, n.Operation, ast.SiteOf(file, n))
		case *ast.SignalSendStmt:
			g.emitSignalSend(idx, callerID, callerDep, ast.SiteOf(file, n), n)
		}
		return true
	}, ast.WithAsyncTargets(func(target ast.AsyncTarget, parent ast.Statement) bool {
		site := ast.SiteOf(file, parent)
		switch t := target.(type) {
		case *ast.ActivityTarget:
			g.emitActivityCall(idx, callerID, callerDep, t.Activity, nil, site)
		case *ast.WorkflowTarget:
			g.emitWorkflowCall(idx, callerID, callerDep, t.Workflow, nil, site)
		case *ast.NexusTarget:
			g.emitNexusCall(idx, callerID, t.Endpoint, t.Service, t.Operation, site)
		}
		return true
	}))
}

func (g *Graph) emitActivityCall(
	idx *astIndex, callerID string, callerDep workerDeployment,
	ref ast.Ref[*ast.ActivityDef], opts *ast.OptionsBlock, site ast.Site,
) {
	if ref.Resolved == nil {
		g.addUnresolved(Unresolved{
			From: callerID, Name: ref.Name, Kind: EdgeActivityCall, Site: site,
		})
		return
	}
	g.emitQueuedCall(idx, callerID, callerDep, EdgeActivityCall, KindActivity, idx.defQName(ref.Resolved, ref.Resolved.Name), opts, ref.Resolved.DefaultOptions, site)
}

func (g *Graph) emitWorkflowCall(
	idx *astIndex, callerID string, callerDep workerDeployment,
	ref ast.Ref[*ast.WorkflowDef], opts *ast.OptionsBlock, site ast.Site,
) {
	if ref.Resolved == nil {
		g.addUnresolved(Unresolved{
			From: callerID, Name: ref.Name, Kind: EdgeWorkflowCall, Site: site,
		})
		return
	}
	g.emitQueuedCall(idx, callerID, callerDep, EdgeWorkflowCall, KindWorkflow, idx.defQName(ref.Resolved, ref.Resolved.Name), opts, ref.Resolved.DefaultOptions, site)
}

// emitSignalSend emits the cross-workflow signal-send edge. Unlike a
// workflow call, a signal is delivered by workflow ID — not dispatched by
// task-queue matching. So the edge does not reuse the queue-routed
// emitQueuedCall path: it fans out to every deployment of the target workflow
// in the caller's namespace and carries a present-but-empty Routing block
// (fire-and-forget, no task_queue override), mirroring the asyncBacking edge.
//
// The target is the type head's resolved type, or the workflow a handle's
// promise was started against, and only when it declares the signal.
// When it is unresolved no edge is drawn and an Unresolved entry is recorded
// instead of silently dropping the send; a type head through an import of a
// package absent from the tree is recorded with Reason "external".
func (g *Graph) emitSignalSend(idx *astIndex, callerID string, callerDep workerDeployment, site ast.Site, s *ast.SignalSendStmt) {
	target := s.Target()
	if target == nil {
		u := Unresolved{From: callerID, Name: s.Head.Handle.Name, Kind: EdgeSignalSend, Site: site}
		if s.Head.Kind == ast.SendHeadType {
			u.Name = s.Head.Type.Name
			if s.Head.External {
				u.Name = s.Head.Type.Package + "." + u.Name
				u.Reason = UnresolvedExternal
			}
		}
		g.addUnresolved(u)
		return
	}
	targetQName := idx.defQName(target, target.Name)
	for _, calleeDep := range idx.deploymentsHosting(KindWorkflow, targetQName) {
		if calleeDep.NamespaceName != callerDep.NamespaceName {
			continue
		}
		g.addEdge(Edge{
			From:    callerID,
			To:      HostedID(KindWorkflow, targetQName, calleeDep.WorkerName, calleeDep.NamespaceName, false),
			Kind:    EdgeSignalSend,
			Site:    site,
			Routing: &Routing{},
		})
	}
}

// emitQueuedCall implements the shared activity/workflow dispatch
// resolution. A task queue is scoped to its namespace, so a callee
// deployment matches only within this caller deployment's namespace.
// Explicit task_queue — on the call site, else in the callee's
// default_options (defaults), as the validator resolves it: the queue is
// named, so we match callee deployments whose queue matches it (spec 03
// § Queue matching). Implicit: the call inherits this caller deployment's
// queue and matches callee deployments with the same deploy key.
//
// When no callee deployment matches, no edge is emitted and a
// DISPATCH_NO_REACHABLE_DEPLOYMENT diagnostic is added so the consumer
// learns about the dead-end. Implicit calls inheriting the caller's
// queue are diagnosed against that queue; explicit calls are
// diagnosed against the literal the user wrote.
func (g *Graph) emitQueuedCall(
	idx *astIndex, callerID string, callerDep workerDeployment,
	edgeKind, calleeKind, calleeName string, opts, defaults *ast.OptionsBlock, site ast.Site,
) {
	explicit := taskQueue(opts)
	if explicit == "" {
		explicit = taskQueue(defaults)
	}
	queue, polls := explicit, ast.ParseCallQueue(explicit).Matches
	if explicit == "" {
		queue, polls = callerDep.Queue, callerDep.queue.SameKey
		if callerDep.queue.Form == ast.QueueMalformed {
			// A malformed queue is already a resolve error and has no key
			// to inherit. Don't double-report.
			return
		}
	}
	if queue == "" {
		// No queue at all (caller deployment lacks task_queue,
		// already an error from the validator). Don't double-report.
		return
	}

	matched := false
	for _, calleeDep := range idx.deploymentsHosting(calleeKind, calleeName) {
		if calleeDep.NamespaceName != callerDep.NamespaceName || !polls(calleeDep.queue) {
			continue
		}
		edge := Edge{
			From: callerID,
			To:   HostedID(calleeKind, calleeName, calleeDep.WorkerName, calleeDep.NamespaceName, false),
			Kind: edgeKind,
			Site: site,
			Routing: &Routing{
				Explicit: explicit,
			},
		}
		g.addEdge(edge)
		matched = true
	}

	if !matched {
		g.addDiagnostic(warningDispatchNoReachable(callerID, calleeKind, g.calleeLabel(idx, calleeKind, calleeName), callerDep.NamespaceName, queue, site))
	}
}

// emitNexusCall resolves an endpoint+service+operation call site to
// concrete operation deployment(s). The endpoint's queue and namespace
// determine which operation deployments receive the call; routing
// metadata carries the endpoint deployment ID so consumers can
// surface "this call routes through endpoint X".
func (g *Graph) emitNexusCall(
	idx *astIndex, callerID string,
	epRef ast.Ref[*ast.NamespaceEndpoint], svcRef ast.Ref[*ast.NexusServiceDef],
	opRef ast.Ref[*ast.NexusOperation], site ast.Site,
) {
	if epRef.Resolved == nil || svcRef.Resolved == nil || opRef.Resolved == nil {
		name := nexusOpCallName(svcRef, opRef)
		g.addUnresolved(Unresolved{
			From: callerID, Name: name, Kind: EdgeNexusCall, Site: site,
		})
		return
	}

	ep := idx.endpointsByName[epRef.Resolved.EndpointName]
	if ep == nil {
		// Resolved at the AST level but lost from our index — defensive.
		g.addUnresolved(Unresolved{
			From: callerID, Name: nexusOpCallName(svcRef, opRef), Kind: EdgeNexusCall, Site: site,
		})
		return
	}
	if ep.templated {
		return
	}

	svcQName := idx.defQName(svcRef.Resolved, svcRef.Resolved.Name)
	opName := NexusOpQualifiedName(svcQName, opRef.Resolved.Name)
	matched := false
	for _, opDep := range idx.deploymentsHosting(KindNexusService, svcQName) {
		if opDep.NamespaceName != ep.Namespace {
			continue
		}
		if opDep.Queue != ep.Queue {
			continue
		}
		edge := Edge{
			From: callerID,
			To:   HostedID(KindNexusOperation, opName, opDep.WorkerName, opDep.NamespaceName, false),
			Kind: EdgeNexusCall,
			Site: site,
			Routing: &Routing{
				NexusEndpoint: EndpointID(ep.Name, ep.Namespace),
			},
		}
		g.addEdge(edge)
		matched = true
	}

	if !matched && ep.Queue != "" {
		g.addDiagnostic(warningDispatchNoReachable(callerID, KindNexusOperation, g.calleeLabel(idx, KindNexusOperation, opName), ep.Namespace, ep.Queue, site))
	}
}

// emitAsyncBacking emits the operation → backing-workflow edge. The
// operation deployment's queue and namespace seed the lookup, matching
// the dispatch semantics of an async nexus operation: when the
// operation runs, Temporal starts the backing workflow on the same
// task queue, so the workflow deployment must have the same deploy key.
func (g *Graph) emitAsyncBacking(
	idx *astIndex, fromID string, opDep workerDeployment,
	workflowName string, site ast.Site,
) {
	if opDep.queue.Form == ast.QueueMalformed {
		return // already a resolve error; it hosts nothing
	}
	matched := false
	for _, calleeDep := range idx.deploymentsHosting(KindWorkflow, workflowName) {
		if calleeDep.NamespaceName != opDep.NamespaceName || !opDep.queue.SameKey(calleeDep.queue) {
			continue
		}
		g.addEdge(Edge{
			From:    fromID,
			To:      HostedID(KindWorkflow, workflowName, calleeDep.WorkerName, calleeDep.NamespaceName, false),
			Kind:    EdgeAsyncBacking,
			Site:    site,
			Routing: &Routing{},
		})
		matched = true
	}

	if !matched && opDep.Queue != "" {
		g.addDiagnostic(warningDispatchNoReachable(fromID, KindWorkflow, g.calleeLabel(idx, KindWorkflow, workflowName), opDep.NamespaceName, opDep.Queue, site))
	}
}

// nexusOpCallName produces a best-effort display name for an
// unresolved nexus call, preferring resolved names when available and
// falling back to the parsed identifiers otherwise.
func nexusOpCallName(svc ast.Ref[*ast.NexusServiceDef], op ast.Ref[*ast.NexusOperation]) string {
	svcName := svc.Name
	if svc.Resolved != nil {
		svcName = svc.Resolved.Name
	}
	opName := op.Name
	if op.Resolved != nil {
		opName = op.Resolved.Name
	}
	return NexusOpQualifiedName(svcName, opName)
}

// recordUnresolved emits one Unresolved entry per caller deployment node,
// matching the per-deployment fan-out the dispatch emitter would have
// produced. Without this, an unresolved async-backing workflow would
// show up once instead of once-per-service-deployment, making it
// inconsistent with how unresolved call-site refs are recorded.
func (g *Graph) recordUnresolved(opQualName, calleeName, kind string, site ast.Site, serviceDeployments []workerDeployment) {
	if len(serviceDeployments) == 0 {
		g.addUnresolved(Unresolved{
			From: HostedID(KindNexusOperation, opQualName, "", "", true),
			Name: calleeName, Kind: kind, Site: site,
		})
		return
	}
	for _, opDep := range serviceDeployments {
		g.addUnresolved(Unresolved{
			From: HostedID(KindNexusOperation, opQualName, opDep.WorkerName, opDep.NamespaceName, false),
			Name: calleeName, Kind: kind, Site: site,
		})
	}
}
