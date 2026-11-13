package graph

import (
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/effective"
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
	defer func() { g.walkFile = "" }()
	for _, wf := range idx.workflows {
		g.walkFile = wf.SourceFile
		wfQName := idx.defQName(wf, wf.Name)
		for _, callerDep := range idx.deploymentsHosting(KindWorkflow, wfQName) {
			callerID := HostedID(KindWorkflow, wfQName, callerDep.WorkerName, callerDep.NamespaceName, false)
			g.walkRunnable(idx, callerID, callerDep, wf.Body)
			for _, s := range ast.FirstDeclared(wf.Signals) {
				g.walkRunnable(idx, callerID, callerDep, s.Body)
			}
			for _, q := range ast.FirstDeclared(wf.Queries) {
				g.walkRunnable(idx, callerID, callerDep, q.Body)
			}
			for _, u := range ast.FirstDeclared(wf.Updates) {
				g.walkRunnable(idx, callerID, callerDep, u.Body)
			}
		}
	}

	for _, svc := range idx.nexusServices {
		g.walkFile = svc.SourceFile
		svcQName := idx.defQName(svc, svc.Name)
		serviceDeployments := idx.deploymentsHosting(KindNexusService, svcQName)
		for _, op := range ast.FirstDeclared(svc.Operations) {
			opName := NexusOpQualifiedName(svcQName, op.Name)
			switch op.OpType {
			case ast.NexusOpAsync:
				if op.Workflow.Resolved == nil {
					g.recordUnresolved(opName, op.Workflow.Name, EdgeAsyncBacking, op.Line, serviceDeployments)
					continue
				}
				targetName := idx.defQName(op.Workflow.Resolved, op.Workflow.Resolved.Name)
				for _, opDep := range serviceDeployments {
					fromID := HostedID(KindNexusOperation, opName, opDep.WorkerName, opDep.NamespaceName, false)
					g.emitAsyncBacking(idx, fromID, opDep, targetName, op.Line)
				}
			case ast.NexusOpSync:
				for _, opDep := range serviceDeployments {
					fromID := HostedID(KindNexusOperation, opName, opDep.WorkerName, opDep.NamespaceName, false)
					g.walkRunnable(idx, fromID, opDep, op.Body)
				}
			}
		}
	}
}

// walkRunnable visits each statement in a body once, dispatching call
// edges through the appropriate resolver. Async targets attached to
// await / promise / await-one-case nodes are handled via the AST
// walker's WithAsyncTargets option so the resolution logic stays in
// one place.
func (g *Graph) walkRunnable(idx *astIndex, callerID string, callerDep workerDeployment, stmts []ast.Statement) {
	ast.WalkStatements(stmts, func(s ast.Statement) bool {
		switch n := s.(type) {
		case *ast.ActivityCall:
			opts, _ := effective.Of(n)
			g.emitActivityCall(idx, callerID, callerDep, n.Activity, opts, n.Line)
		case *ast.WorkflowCall:
			opts, _ := effective.Of(n)
			g.emitWorkflowCall(idx, callerID, callerDep, n.Workflow, opts, n.Line)
		case *ast.NexusCall:
			g.emitNexusCall(idx, callerID, n.Endpoint, n.Service, n.Operation, n.Line)
		case *ast.SignalSendStmt:
			g.emitSignalSend(idx, callerID, callerDep, n)
		}
		return true
	}, ast.WithAsyncTargets(func(target ast.AsyncTarget, parent ast.Statement) bool {
		line := parent.NodeLine()
		opts, _ := effective.Of(parent)
		switch t := target.(type) {
		case *ast.ActivityTarget:
			g.emitActivityCall(idx, callerID, callerDep, t.Activity, opts, line)
		case *ast.WorkflowTarget:
			g.emitWorkflowCall(idx, callerID, callerDep, t.Workflow, opts, line)
		case *ast.NexusTarget:
			g.emitNexusCall(idx, callerID, t.Endpoint, t.Service, t.Operation, line)
		}
		return true
	}))
}

func (g *Graph) emitActivityCall(
	idx *astIndex, callerID string, callerDep workerDeployment,
	ref ast.Ref[*ast.ActivityDef], opts effective.Options, line int,
) {
	if ref.Resolved == nil {
		g.addUnresolved(Unresolved{
			From: callerID, Name: ref.Name, Kind: EdgeActivityCall, Line: line,
		})
		return
	}
	g.emitQueuedCall(idx, callerID, callerDep, EdgeActivityCall, KindActivity, idx.defQName(ref.Resolved, ref.Resolved.Name), opts, line)
}

func (g *Graph) emitWorkflowCall(
	idx *astIndex, callerID string, callerDep workerDeployment,
	ref ast.Ref[*ast.WorkflowDef], opts effective.Options, line int,
) {
	if ref.Resolved == nil {
		g.addUnresolved(Unresolved{
			From: callerID, Name: ref.Name, Kind: EdgeWorkflowCall, Line: line,
		})
		return
	}
	g.emitQueuedCall(idx, callerID, callerDep, EdgeWorkflowCall, KindWorkflow, idx.defQName(ref.Resolved, ref.Resolved.Name), opts, line)
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
func (g *Graph) emitSignalSend(idx *astIndex, callerID string, callerDep workerDeployment, s *ast.SignalSendStmt) {
	target := s.Target()
	if target == nil {
		u := Unresolved{From: callerID, Name: s.Head.Handle.Name, Kind: EdgeSignalSend, Line: s.Line}
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
			Line:    s.Line,
			Routing: &Routing{},
		})
	}
}

// emitQueuedCall implements the shared activity/workflow dispatch
// resolution. A task queue is scoped to its namespace, so a callee
// deployment matches only within this caller deployment's namespace.
// Explicit effective task_queue: the queue is named, so we match callee
// deployments whose queue matches it (spec 03 § Queue matching). Implicit:
// the call inherits this caller deployment's queue and matches callee
// deployments with the same deploy key.
//
// When no callee deployment matches, no edge is emitted and a
// DISPATCH_NO_REACHABLE_DEPLOYMENT diagnostic is added so the consumer
// learns about the dead-end. Implicit calls inheriting the caller's
// queue are diagnosed against that queue; explicit calls are
// diagnosed against the literal the user wrote.
func (g *Graph) emitQueuedCall(
	idx *astIndex, callerID string, callerDep workerDeployment,
	edgeKind, calleeKind, calleeName string, opts effective.Options, line int,
) {
	var explicit string
	if tq := opts["task_queue"]; tq.Written() {
		explicit = tq.Value
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
			Line: line,
			Routing: &Routing{
				Explicit: explicit,
			},
		}
		g.addEdge(edge)
		matched = true
	}

	if !matched {
		g.addDiagnostic(warningDispatchNoReachable(callerID, calleeKind, g.calleeLabel(idx, calleeKind, calleeName), callerDep.NamespaceName, queue, line))
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
	opRef ast.Ref[*ast.NexusOperation], line int,
) {
	if epRef.Resolved == nil || svcRef.Resolved == nil || opRef.Resolved == nil {
		name := nexusOpCallName(svcRef, opRef)
		g.addUnresolved(Unresolved{
			From: callerID, Name: name, Kind: EdgeNexusCall, Line: line,
		})
		return
	}

	ep := idx.endpointsByName[epRef.Resolved.EndpointName]
	if ep == nil {
		// Resolved at the AST level but lost from our index — defensive.
		g.addUnresolved(Unresolved{
			From: callerID, Name: nexusOpCallName(svcRef, opRef), Kind: EdgeNexusCall, Line: line,
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
			Line: line,
			Routing: &Routing{
				NexusEndpoint: EndpointID(ep.Name, ep.Namespace),
			},
		}
		g.addEdge(edge)
		matched = true
	}

	if !matched && ep.Queue != "" {
		g.addDiagnostic(warningDispatchNoReachable(callerID, KindNexusOperation, g.calleeLabel(idx, KindNexusOperation, opName), ep.Namespace, ep.Queue, line))
	}
}

// emitAsyncBacking emits the operation → backing-workflow edge. The
// operation deployment's queue and namespace seed the lookup, matching
// the dispatch semantics of an async nexus operation: when the
// operation runs, Temporal starts the backing workflow on the same
// task queue, so the workflow deployment must have the same deploy key.
func (g *Graph) emitAsyncBacking(
	idx *astIndex, fromID string, opDep workerDeployment,
	workflowName string, line int,
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
			Line:    line,
			Routing: &Routing{},
		})
		matched = true
	}

	if !matched && opDep.Queue != "" {
		g.addDiagnostic(warningDispatchNoReachable(fromID, KindWorkflow, g.calleeLabel(idx, KindWorkflow, workflowName), opDep.NamespaceName, opDep.Queue, line))
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
func (g *Graph) recordUnresolved(opQualName, calleeName, kind string, line int, serviceDeployments []workerDeployment) {
	if len(serviceDeployments) == 0 {
		g.addUnresolved(Unresolved{
			From: HostedID(KindNexusOperation, opQualName, "", "", true),
			Name: calleeName, Kind: kind, Line: line,
		})
		return
	}
	for _, opDep := range serviceDeployments {
		g.addUnresolved(Unresolved{
			From: HostedID(KindNexusOperation, opQualName, opDep.WorkerName, opDep.NamespaceName, false),
			Name: calleeName, Kind: kind, Line: line,
		})
	}
}
