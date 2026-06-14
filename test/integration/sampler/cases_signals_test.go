//go:build integration

package integration

import (
	"go.temporal.io/sdk/worker"
	"go.temporal.io/sdk/workflow"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
)

// Signal-send cases: the signalSend edge and its resolved/unresolved outcomes.
//   signal-send-resolved    target in sample -> edge
//   signal-send-unresolved  target absent    -> Unresolved entry, no edge

// signalName is the signal both the sender and receiver fixtures use.
const signalName = "sig"

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// SignalSenderWorkflow signals another workflow by ID. The
// SIGNAL_EXTERNAL_WORKFLOW_EXECUTION_INITIATED event yields a signalSend edge
// once the target is resolved against the sampled workflowID index.
func SignalSenderWorkflow(ctx workflow.Context, targetID string) error {
	return workflow.SignalExternalWorkflow(ctx, targetID, "", signalName, nil).Get(ctx, nil)
}

// SignalReceiverWorkflow is the resolved target: it parks until it receives the
// signal, so it must be started before the sender signals it.
func SignalReceiverWorkflow(ctx workflow.Context) error {
	workflow.GetSignalChannel(ctx, signalName).Receive(ctx, nil)
	return nil
}

// SignalMissingTargetWorkflow signals a workflow ID that is never started, then
// swallows the delivery error so the execution still completes. The INITIATED
// event still fires, so history.Build records an Unresolved signalSend (target
// absent from the index) and emits no edge.
func SignalMissingTargetWorkflow(ctx workflow.Context, targetID string) error {
	_ = workflow.SignalExternalWorkflow(ctx, targetID, "", signalName, nil).Get(ctx, nil)
	return nil
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

// signalSendResolved: a sender signals a receiver that is in the sample, so the
// target resolves via the workflowID index and a signalSend edge is drawn
// between the two workflow nodes. The receiver is started before the sender
// (and the harness starts both before awaiting either) so the signal can be
// delivered.
func signalSendResolved() Case {
	const tq = "s11-tq"
	const receiverID = "s11-receiver"
	sender := ExpectNode{Kind: graph.KindWorkflow, Name: "SignalSenderWorkflow"}
	receiver := ExpectNode{Kind: graph.KindWorkflow, Name: "SignalReceiverWorkflow"}
	return Case{
		Name: "signal-send-resolved",
		Namespaces: []NamespaceSet{
			{
				Name: defaultNamespace,
				Workers: []WorkerSpec{
					{
						TaskQueue: tq,
						Register: func(w worker.Worker) {
							w.RegisterWorkflow(SignalSenderWorkflow)
							w.RegisterWorkflow(SignalReceiverWorkflow)
						},
					},
				},
				Starts: []StartSpec{
					{ID: receiverID, TaskQueue: tq, Workflow: SignalReceiverWorkflow},
					{ID: "s11-sender", TaskQueue: tq, Workflow: SignalSenderWorkflow, Args: []interface{}{receiverID}},
				},
			},
		},
		Expect: Expect{
			Nodes: []ExpectNode{sender, receiver},
			Edges: []ExpectEdge{{From: sender, To: receiver, Kind: graph.EdgeSignalSend}},
		},
	}
}

// signalSendUnresolved: the sender signals a workflow ID that is never started.
// history.Build records an Unresolved signalSend (target absent from the index)
// and emits no edge. MaxEdges caps the graph to its two containment edges,
// asserting no signalSend edge slipped in.
func signalSendUnresolved() Case {
	const tq = "s12-tq"
	const ghostID = "s12-ghost"
	sender := ExpectNode{Kind: graph.KindWorkflow, Name: "SignalMissingTargetWorkflow"}
	return Case{
		Name: "signal-send-unresolved",
		Namespaces: []NamespaceSet{
			{
				Name: defaultNamespace,
				Workers: []WorkerSpec{
					{
						TaskQueue: tq,
						Register:  func(w worker.Worker) { w.RegisterWorkflow(SignalMissingTargetWorkflow) },
					},
				},
				Starts: []StartSpec{
					{ID: "s12-sender", TaskQueue: tq, Workflow: SignalMissingTargetWorkflow, Args: []interface{}{ghostID}},
				},
			},
		},
		Expect: Expect{
			Nodes: []ExpectNode{
				sender,
				{Kind: graph.KindWorker, Name: tq},
				{Kind: graph.KindNamespace, Name: defaultNamespace},
			},
			Unresolved: []ExpectUnresolved{
				{From: sender, Name: ghostID, Kind: graph.EdgeSignalSend},
			},
			// 3 nodes, only the 2 containment edges — no signalSend edge.
			MaxEdges: 2,
		},
	}
}
