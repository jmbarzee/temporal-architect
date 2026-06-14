//go:build integration

package integration

import (
	"go.temporal.io/sdk/worker"
	"go.temporal.io/sdk/workflow"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
)

// Child-workflow cases: the workflowCall edge and the coarsened (worker- and
// namespace-tier) edges that cross-deployment dispatch projects up to.
//   parent-child-same-queue                same queue
//   parent-child-same-queue-dedup          two calls dedup to one edge
//   parent-child-cross-queue               worker-tier coarsened edge
//   parent-child-cross-namespace           namespace-tier coarsened edge
//   cross-namespace-multi-namespace-graph  A->B->C chain, two namespace-tier edges

const (
	// Cross-queue child (same namespace, second worker).
	s8ParentQueue = "s8-parent-tq"
	s8ChildQueue  = "s8-child-tq"

	// Cross-namespace child.
	s9ParentQueue    = "s9-parent-tq"
	s9ChildNamespace = "s9-ns2"
	s9ChildQueue     = "s9-child-tq"

	// Three-namespace chain (A -> B -> C).
	r6NamespaceA = "default"
	r6NamespaceB = "r6-ns-b"
	r6NamespaceC = "r6-ns-c"
	r6QueueA     = "r6-tq-a"
	r6QueueB     = "r6-tq-b"
	r6QueueC     = "r6-tq-c"
)

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// ChildWorkflow is a leaf child started by a parent. The parent's
// START_CHILD_WORKFLOW_EXECUTION_INITIATED event alone yields the child node +
// workflowCall edge, so the child need not be independently sampled.
func ChildWorkflow(ctx workflow.Context) error { return nil }

// ParentWorkflow starts one child on the inherited (same) task queue.
func ParentWorkflow(ctx workflow.Context) error {
	ctx = workflow.WithChildOptions(ctx, workflow.ChildWorkflowOptions{})
	return workflow.ExecuteChildWorkflow(ctx, ChildWorkflow).Get(ctx, nil)
}

// DoubleChildParentWorkflow starts the same child type twice (distinct
// auto-generated child IDs). The two initiated events must dedup to a single
// workflowCall edge.
func DoubleChildParentWorkflow(ctx workflow.Context) error {
	ctx = workflow.WithChildOptions(ctx, workflow.ChildWorkflowOptions{})
	if err := workflow.ExecuteChildWorkflow(ctx, ChildWorkflow).Get(ctx, nil); err != nil {
		return err
	}
	return workflow.ExecuteChildWorkflow(ctx, ChildWorkflow).Get(ctx, nil)
}

// CrossQueueParentWorkflow starts a child on a different task queue in the same
// namespace, yielding a workflowCall edge plus a worker-tier coarsened edge
// between the two queues.
func CrossQueueParentWorkflow(ctx workflow.Context) error {
	ctx = workflow.WithChildOptions(ctx, workflow.ChildWorkflowOptions{
		TaskQueue: s8ChildQueue,
	})
	return workflow.ExecuteChildWorkflow(ctx, CrossQueueChildWorkflow).Get(ctx, nil)
}

func CrossQueueChildWorkflow(ctx workflow.Context) error { return nil }

// CrossNamespaceParentWorkflow starts a child in a different namespace, yielding
// a workflowCall edge plus a namespace-tier coarsened edge. The child node is
// reconstructed under the child namespace from the parent's
// START_CHILD_WORKFLOW_EXECUTION_INITIATED attributes alone.
func CrossNamespaceParentWorkflow(ctx workflow.Context) error {
	ctx = workflow.WithChildOptions(ctx, workflow.ChildWorkflowOptions{
		Namespace: s9ChildNamespace,
		TaskQueue: s9ChildQueue,
	})
	return workflow.ExecuteChildWorkflow(ctx, CrossNamespaceChildWorkflow).Get(ctx, nil)
}

func CrossNamespaceChildWorkflow(ctx workflow.Context) error { return nil }

// Chain{A,B,C}Workflow form a three-namespace chain: A in r6NamespaceA starts B
// in r6NamespaceB, which starts C in r6NamespaceC. Reconstructing both
// namespace-tier edges (A->B and B->C) requires sampling A's and B's histories,
// since each child-initiated event lives only in its own parent's history.
func ChainAWorkflow(ctx workflow.Context) error {
	ctx = workflow.WithChildOptions(ctx, workflow.ChildWorkflowOptions{
		Namespace: r6NamespaceB,
		TaskQueue: r6QueueB,
	})
	return workflow.ExecuteChildWorkflow(ctx, ChainBWorkflow).Get(ctx, nil)
}

func ChainBWorkflow(ctx workflow.Context) error {
	ctx = workflow.WithChildOptions(ctx, workflow.ChildWorkflowOptions{
		Namespace: r6NamespaceC,
		TaskQueue: r6QueueC,
	})
	return workflow.ExecuteChildWorkflow(ctx, ChainCWorkflow).Get(ctx, nil)
}

func ChainCWorkflow(ctx workflow.Context) error { return nil }

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

// parentChildSameQueue: parent starts a child on the inherited queue; the
// workflowCall edge is reconstructed from the parent's history alone.
func parentChildSameQueue() Case {
	const tq = "s7-tq"
	parent := ExpectNode{Kind: graph.KindWorkflow, Name: "ParentWorkflow"}
	child := ExpectNode{Kind: graph.KindWorkflow, Name: "ChildWorkflow"}
	return Case{
		Name: "parent-child-same-queue",
		Namespaces: []NamespaceSet{
			{
				Name: defaultNamespace,
				Workers: []WorkerSpec{
					{
						TaskQueue: tq,
						Register: func(w worker.Worker) {
							w.RegisterWorkflow(ParentWorkflow)
							w.RegisterWorkflow(ChildWorkflow)
						},
					},
				},
				Starts: []StartSpec{
					{ID: "s7-parent-1", TaskQueue: tq, Workflow: ParentWorkflow},
				},
			},
		},
		Expect: Expect{
			Nodes: []ExpectNode{parent, child},
			Edges: []ExpectEdge{{From: parent, To: child, Kind: graph.EdgeWorkflowCall}},
		},
	}
}

// parentChildSameQueueDedup: parent starts the same child type twice; the two
// initiated events must dedup to a single workflowCall edge.
func parentChildSameQueueDedup() Case {
	const tq = "s7b-tq"
	parent := ExpectNode{Kind: graph.KindWorkflow, Name: "DoubleChildParentWorkflow"}
	child := ExpectNode{Kind: graph.KindWorkflow, Name: "ChildWorkflow"}
	return Case{
		Name: "parent-child-same-queue-dedup",
		Namespaces: []NamespaceSet{
			{
				Name: defaultNamespace,
				Workers: []WorkerSpec{
					{
						TaskQueue: tq,
						Register: func(w worker.Worker) {
							w.RegisterWorkflow(DoubleChildParentWorkflow)
							w.RegisterWorkflow(ChildWorkflow)
						},
					},
				},
				Starts: []StartSpec{
					{ID: "s7b-parent-1", TaskQueue: tq, Workflow: DoubleChildParentWorkflow},
				},
			},
		},
		Expect: Expect{
			Nodes:      []ExpectNode{parent, child},
			Edges:      []ExpectEdge{{From: parent, To: child, Kind: graph.EdgeWorkflowCall}},
			EdgeCounts: []EdgeCount{{Edge: ExpectEdge{From: parent, To: child, Kind: graph.EdgeWorkflowCall}, Want: 1}},
		},
	}
}

// parentChildCrossQueue: parent and child on distinct queues in one namespace.
// Yields a workflowCall edge plus a worker-tier coarsened edge between the two
// queues.
func parentChildCrossQueue() Case {
	parent := ExpectNode{Kind: graph.KindWorkflow, Name: "CrossQueueParentWorkflow"}
	child := ExpectNode{Kind: graph.KindWorkflow, Name: "CrossQueueChildWorkflow"}
	return Case{
		Name: "parent-child-cross-queue",
		Namespaces: []NamespaceSet{
			{
				Name: defaultNamespace,
				Workers: []WorkerSpec{
					{
						TaskQueue: s8ParentQueue,
						Register:  func(w worker.Worker) { w.RegisterWorkflow(CrossQueueParentWorkflow) },
					},
					{
						TaskQueue: s8ChildQueue,
						Register:  func(w worker.Worker) { w.RegisterWorkflow(CrossQueueChildWorkflow) },
					},
				},
				Starts: []StartSpec{
					{ID: "s8-parent-1", TaskQueue: s8ParentQueue, Workflow: CrossQueueParentWorkflow},
				},
				// Parent + child both land in this namespace.
				ExpectedVisible: 2,
			},
		},
		Expect: Expect{
			Nodes: []ExpectNode{parent, child},
			Edges: []ExpectEdge{{From: parent, To: child, Kind: graph.EdgeWorkflowCall}},
			Coarsened: []ExpectCoarsened{
				{
					From: ExpectNode{Kind: graph.KindWorker, Name: s8ParentQueue},
					To:   ExpectNode{Kind: graph.KindWorker, Name: s8ChildQueue},
					Tier: graph.TierWorker,
				},
			},
		},
	}
}

// parentChildCrossNamespace: parent in the default namespace starts a child in a
// second namespace. The child node is reconstructed under the child namespace
// from the parent's history, and a namespace-tier coarsened edge is drawn
// between the two namespaces.
func parentChildCrossNamespace() Case {
	parent := ExpectNode{Kind: graph.KindWorkflow, Name: "CrossNamespaceParentWorkflow"}
	child := ExpectNode{Kind: graph.KindWorkflow, Name: "CrossNamespaceChildWorkflow"}
	return Case{
		Name: "parent-child-cross-namespace",
		Namespaces: []NamespaceSet{
			{
				Name: defaultNamespace,
				Workers: []WorkerSpec{
					{
						TaskQueue: s9ParentQueue,
						Register:  func(w worker.Worker) { w.RegisterWorkflow(CrossNamespaceParentWorkflow) },
					},
				},
				Starts: []StartSpec{
					{ID: "s9-parent-1", TaskQueue: s9ParentQueue, Workflow: CrossNamespaceParentWorkflow},
				},
			},
			{
				Name: s9ChildNamespace,
				Workers: []WorkerSpec{
					{
						TaskQueue: s9ChildQueue,
						Register:  func(w worker.Worker) { w.RegisterWorkflow(CrossNamespaceChildWorkflow) },
					},
				},
				// No Starts of its own; it only hosts the child.
			},
		},
		Expect: Expect{
			Nodes: []ExpectNode{
				parent, child,
				{Kind: graph.KindNamespace, Name: defaultNamespace},
				{Kind: graph.KindNamespace, Name: s9ChildNamespace},
			},
			Edges: []ExpectEdge{{From: parent, To: child, Kind: graph.EdgeWorkflowCall}},
			Coarsened: []ExpectCoarsened{
				{
					From: ExpectNode{Kind: graph.KindNamespace, Name: defaultNamespace},
					To:   ExpectNode{Kind: graph.KindNamespace, Name: s9ChildNamespace},
					Tier: graph.TierNamespace,
				},
			},
		},
	}
}

// crossNamespaceMultiNamespaceGraph: a three-namespace chain (A -> B -> C)
// folded into a single history.Build. Both namespace-tier coarsened edges
// (A->B and B->C) must appear, which requires sampling both A's and B's
// histories — each child-initiated event lives only in its own parent. B and C
// run children with no Starts of their own, so ExpectedVisible drives the wait
// for those executions to become sampleable.
func crossNamespaceMultiNamespaceGraph() Case {
	a := ExpectNode{Kind: graph.KindWorkflow, Name: "ChainAWorkflow"}
	b := ExpectNode{Kind: graph.KindWorkflow, Name: "ChainBWorkflow"}
	cc := ExpectNode{Kind: graph.KindWorkflow, Name: "ChainCWorkflow"}
	return Case{
		Name: "cross-namespace-multi-namespace-graph",
		Namespaces: []NamespaceSet{
			{
				Name: r6NamespaceA,
				Workers: []WorkerSpec{
					{
						TaskQueue: r6QueueA,
						Register:  func(w worker.Worker) { w.RegisterWorkflow(ChainAWorkflow) },
					},
				},
				Starts: []StartSpec{
					{ID: "r6-a-1", TaskQueue: r6QueueA, Workflow: ChainAWorkflow},
				},
			},
			{
				Name: r6NamespaceB,
				Workers: []WorkerSpec{
					{
						TaskQueue: r6QueueB,
						Register:  func(w worker.Worker) { w.RegisterWorkflow(ChainBWorkflow) },
					},
				},
				ExpectedVisible: 1, // the B child started by A
			},
			{
				Name: r6NamespaceC,
				Workers: []WorkerSpec{
					{
						TaskQueue: r6QueueC,
						Register:  func(w worker.Worker) { w.RegisterWorkflow(ChainCWorkflow) },
					},
				},
				ExpectedVisible: 1, // the C grandchild started by B
			},
		},
		Expect: Expect{
			Nodes: []ExpectNode{a, b, cc},
			Edges: []ExpectEdge{
				{From: a, To: b, Kind: graph.EdgeWorkflowCall},
				{From: b, To: cc, Kind: graph.EdgeWorkflowCall},
			},
			Coarsened: []ExpectCoarsened{
				{
					From: ExpectNode{Kind: graph.KindNamespace, Name: r6NamespaceA},
					To:   ExpectNode{Kind: graph.KindNamespace, Name: r6NamespaceB},
					Tier: graph.TierNamespace,
				},
				{
					From: ExpectNode{Kind: graph.KindNamespace, Name: r6NamespaceB},
					To:   ExpectNode{Kind: graph.KindNamespace, Name: r6NamespaceC},
					Tier: graph.TierNamespace,
				},
			},
		},
	}
}
