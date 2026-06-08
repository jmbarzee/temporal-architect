package graph

import (
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
)

// emitDispatchEdges walks every runnable body and emits dispatch edges
// per the resolution rules in REVISIONS_003 § "Dispatch edges":
//
//   - activityCall / workflowCall with explicit task_queue: match
//     callee deployments whose queue equals the literal.
//   - activityCall / workflowCall implicit: match callee deployments
//     whose queue is any queue the caller's definition is hosted on.
//   - nexusCall: match callee deployments whose queue == endpoint.queue
//     AND whose namespace == endpoint.namespace; routing.nexusEndpoint
//     carries the endpoint deployment ID.
//   - asyncBacking: emitted by the nexus service walk — operation
//     deployment → workflow deployment on same queue and namespace.
//
// One edge per (caller deployment, matching callee deployment) pair.
// When no callee matches, no edge; a DISPATCH_NO_REACHABLE_DEPLOYMENT
// diagnostic is added so the consumer knows the call landed nowhere.
func (g *Graph) emitDispatchEdges(idx *astIndex) {
	for _, wf := range idx.workflows {
		for _, callerDep := range idx.deploymentsHosting(KindWorkflow, wf.Name) {
			callerID := HostedID(KindWorkflow, wf.Name, callerDep.WorkerName, callerDep.NamespaceName, false)
			g.walkRunnable(idx, callerID, callerDep, wf.Body)
			for _, s := range wf.Signals {
				g.walkRunnable(idx, callerID, callerDep, s.Body)
			}
			for _, q := range wf.Queries {
				g.walkRunnable(idx, callerID, callerDep, q.Body)
			}
			for _, u := range wf.Updates {
				g.walkRunnable(idx, callerID, callerDep, u.Body)
			}
		}
	}

	for _, svc := range idx.nexusServices {
		serviceDeployments := idx.deploymentsHosting(KindNexusService, svc.Name)
		for _, op := range svc.Operations {
			opName := nexusOpQualifiedName(svc.Name, op.Name)
			switch op.OpType {
			case ast.NexusOpAsync:
				if op.Workflow.Resolved == nil {
					g.recordUnresolved(opName, op.Workflow.Name, EdgeAsyncBacking, op.Line, serviceDeployments)
					continue
				}
				targetName := op.Workflow.Resolved.Name
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
			g.emitActivityCall(idx, callerID, callerDep, n.Activity, n.Options, n.Line)
		case *ast.WorkflowCall:
			g.emitWorkflowCall(idx, callerID, callerDep, n.Workflow, n.Options, n.Line)
		case *ast.NexusCall:
			g.emitNexusCall(idx, callerID, n.Endpoint, n.Service, n.Operation, n.Line)
		case *ast.SignalSendStmt:
			g.emitSignalSend(idx, callerID, callerDep, n.Handle, n.Line)
		}
		return true
	}, ast.WithAsyncTargets(func(target ast.AsyncTarget, parent ast.Statement) bool {
		line := parent.NodeLine()
		switch t := target.(type) {
		case *ast.ActivityTarget:
			g.emitActivityCall(idx, callerID, callerDep, t.Activity, nil, line)
		case *ast.WorkflowTarget:
			g.emitWorkflowCall(idx, callerID, callerDep, t.Workflow, nil, line)
		case *ast.NexusTarget:
			g.emitNexusCall(idx, callerID, t.Endpoint, t.Service, t.Operation, line)
		}
		return true
	}))
}

func (g *Graph) emitActivityCall(
	idx *astIndex, callerID string, callerDep workerDeployment,
	ref ast.Ref[*ast.ActivityDef], opts *ast.OptionsBlock, line int,
) {
	if ref.Resolved == nil {
		g.Unresolved = append(g.Unresolved, Unresolved{
			From: callerID, Name: ref.Name, Kind: EdgeActivityCall, Line: line,
		})
		return
	}
	g.emitQueuedCall(idx, callerID, callerDep, EdgeActivityCall, KindActivity, ref.Resolved.Name, opts, line)
}

func (g *Graph) emitWorkflowCall(
	idx *astIndex, callerID string, callerDep workerDeployment,
	ref ast.Ref[*ast.WorkflowDef], opts *ast.OptionsBlock, line int,
) {
	if ref.Resolved == nil {
		g.Unresolved = append(g.Unresolved, Unresolved{
			From: callerID, Name: ref.Name, Kind: EdgeWorkflowCall, Line: line,
		})
		return
	}
	g.emitQueuedCall(idx, callerID, callerDep, EdgeWorkflowCall, KindWorkflow, ref.Resolved.Name, opts, line)
}

// emitSignalSend emits the cross-workflow signal-send edge. Unlike a
// workflow call, a signal is delivered to a specific running child the
// sender already started — not dispatched by task-queue matching. So the
// edge does not reuse the queue-routed emitQueuedCall path: it fans out to
// every deployment of the target workflow in the caller's namespace and
// carries a present-but-empty Routing block (fire-and-forget, no
// task_queue override), mirroring the asyncBacking edge.
//
// The target workflow is reached through the resolved handle promise
// (set by the resolver only when the send is fully valid). When the handle
// is unresolved — undefined handle, non-workflow handle, undefined target
// workflow, or undeclared signal — no edge is drawn and an Unresolved entry
// is recorded instead of silently dropping the send.
func (g *Graph) emitSignalSend(
	idx *astIndex, callerID string, callerDep workerDeployment,
	handle ast.Ref[*ast.PromiseStmt], line int,
) {
	target := signalSendTarget(handle)
	if target == nil {
		g.Unresolved = append(g.Unresolved, Unresolved{
			From: callerID, Name: handle.Name, Kind: EdgeSignalSend, Line: line,
		})
		return
	}
	for _, calleeDep := range idx.deploymentsHosting(KindWorkflow, target.Name) {
		if calleeDep.NamespaceName != callerDep.NamespaceName {
			continue
		}
		g.Edges = append(g.Edges, Edge{
			From:    callerID,
			To:      HostedID(KindWorkflow, target.Name, calleeDep.WorkerName, calleeDep.NamespaceName, false),
			Kind:    EdgeSignalSend,
			Line:    line,
			Routing: &Routing{},
		})
	}
}

// signalSendTarget extracts the resolved target workflow definition from a
// signal-send handle. Returns nil when the handle did not fully resolve to a
// workflow-bound promise whose target workflow is itself resolved.
func signalSendTarget(handle ast.Ref[*ast.PromiseStmt]) *ast.WorkflowDef {
	if handle.Resolved == nil {
		return nil
	}
	wt, ok := handle.Resolved.Target.(*ast.WorkflowTarget)
	if !ok {
		return nil
	}
	return wt.Workflow.Resolved
}

// emitQueuedCall implements the shared activity/workflow dispatch
// resolution. Explicit task_queue: the caller named the queue, so we
// match callee deployments on that queue exactly. Implicit: the call
// inherits the caller's queue, so we match the union of queues any
// deployment of the caller's definition polls.
//
// When no callee deployment matches, no edge is emitted and a
// DISPATCH_NO_REACHABLE_DEPLOYMENT diagnostic is added so the consumer
// learns about the dead-end. Implicit calls inheriting the caller's
// queue are diagnosed against that queue; explicit calls are
// diagnosed against the literal the user wrote.
func (g *Graph) emitQueuedCall(
	idx *astIndex, callerID string, callerDep workerDeployment,
	edgeKind, calleeKind, calleeName string, opts *ast.OptionsBlock, line int,
) {
	explicit := taskQueue(opts)
	var queues []string
	if explicit != "" {
		queues = []string{explicit}
	} else {
		queues = []string{callerDep.Queue}
	}

	matched := false
	for _, q := range queues {
		if q == "" {
			continue
		}
		for _, calleeDep := range idx.deploymentsHosting(calleeKind, calleeName) {
			if calleeDep.NamespaceName != callerDep.NamespaceName {
				continue
			}
			if calleeDep.Queue != q {
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
			g.Edges = append(g.Edges, edge)
			matched = true
		}
	}

	if !matched {
		queue := explicit
		if queue == "" {
			queue = callerDep.Queue
		}
		if queue == "" {
			// No queue at all (caller deployment lacks task_queue,
			// already an error from the validator). Don't double-report.
			return
		}
		g.addDiagnostic(warningDispatchNoReachable(callerID, calleeKind, calleeName, queue, line))
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
		g.Unresolved = append(g.Unresolved, Unresolved{
			From: callerID, Name: name, Kind: EdgeNexusCall, Line: line,
		})
		return
	}

	ep := idx.endpointsByName[epRef.Resolved.EndpointName]
	if ep == nil {
		// Resolved at the AST level but lost from our index — defensive.
		g.Unresolved = append(g.Unresolved, Unresolved{
			From: callerID, Name: nexusOpCallName(svcRef, opRef), Kind: EdgeNexusCall, Line: line,
		})
		return
	}

	opName := nexusOpQualifiedName(svcRef.Resolved.Name, opRef.Resolved.Name)
	matched := false
	for _, opDep := range idx.deploymentsHosting(KindNexusService, svcRef.Resolved.Name) {
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
		g.Edges = append(g.Edges, edge)
		matched = true
	}

	if !matched && ep.Queue != "" {
		g.addDiagnostic(warningDispatchNoReachable(callerID, KindNexusOperation, opName, ep.Queue, line))
	}
}

// emitAsyncBacking emits the operation → backing-workflow edge. The
// operation deployment's queue and namespace seed the lookup, matching
// the dispatch semantics of an async nexus operation: when the
// operation runs, Temporal starts the backing workflow on the same
// task queue.
func (g *Graph) emitAsyncBacking(
	idx *astIndex, fromID string, opDep workerDeployment,
	workflowName string, line int,
) {
	matched := false
	for _, calleeDep := range idx.deploymentsHosting(KindWorkflow, workflowName) {
		if calleeDep.NamespaceName != opDep.NamespaceName {
			continue
		}
		if calleeDep.Queue != opDep.Queue {
			continue
		}
		g.Edges = append(g.Edges, Edge{
			From:    fromID,
			To:      HostedID(KindWorkflow, workflowName, calleeDep.WorkerName, calleeDep.NamespaceName, false),
			Kind:    EdgeAsyncBacking,
			Line:    line,
			Routing: &Routing{},
		})
		matched = true
	}

	if !matched && opDep.Queue != "" {
		g.addDiagnostic(warningDispatchNoReachable(fromID, KindWorkflow, workflowName, opDep.Queue, line))
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
	return nexusOpQualifiedName(svcName, opName)
}

// recordUnresolved emits one Unresolved entry per caller deployment,
// matching the per-deployment fan-out the dispatch emitter would have
// produced. Without this, an unresolved async-backing workflow would
// show up once instead of once-per-service-deployment, making it
// inconsistent with how unresolved call-site refs are recorded.
func (g *Graph) recordUnresolved(opQualName, calleeName, kind string, line int, serviceDeployments []workerDeployment) {
	if len(serviceDeployments) == 0 {
		g.Unresolved = append(g.Unresolved, Unresolved{
			From: HostedID(KindNexusOperation, opQualName, "", "", true),
			Name: calleeName, Kind: kind, Line: line,
		})
		return
	}
	for _, opDep := range serviceDeployments {
		g.Unresolved = append(g.Unresolved, Unresolved{
			From: HostedID(KindNexusOperation, opQualName, opDep.WorkerName, opDep.NamespaceName, false),
			Name: calleeName, Kind: kind, Line: line,
		})
	}
}
