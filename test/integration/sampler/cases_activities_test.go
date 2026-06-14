//go:build integration

package integration

import (
	"context"
	"time"

	"go.temporal.io/sdk/worker"
	"go.temporal.io/sdk/workflow"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
)

// Activity-dispatch cases: the activityCall edge and its dedup / sharing rules.
//   single-workflow-activity               one workflow, one activity (smoke)
//   workflow-no-dispatch                    clean root, no spurious edges
//   workflow-multiple-distinct-activities   fan to distinct activities
//   workflow-repeated-activity              literal-repeat dedup
//   fan-out-same-activity                   runtime fan-out dedup
//   multiple-workflows-shared-activity      shared callee, per-caller edges

// graphTest* name the smoke-case fixtures, shared with the CLI command test in
// sampler_e2e_test.go.
const (
	graphTestQueue        = "graph-it-tq"
	graphTestWorkflowType = "GraphTestWorkflow"
	graphTestActivityType = "GraphTestActivity"
)

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// activityOpts applies a sensible default timeout for the simple activity
// fixtures below.
func activityOpts(ctx workflow.Context) workflow.Context {
	return workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: time.Minute,
	})
}

// GraphTestWorkflow runs one activity. The pair yields a workflow node, an
// activity node, and an activityCall edge in the reconstructed graph — the
// minimal shape that proves the event→graph mapping works end to end.
func GraphTestWorkflow(ctx workflow.Context) error {
	return workflow.ExecuteActivity(activityOpts(ctx), GraphTestActivity).Get(ctx, nil)
}

func GraphTestActivity(ctx context.Context) error { return nil }

// NoDispatchWorkflow is a leaf: it schedules nothing, so its history is
// root-only and must reconstruct to a clean workflow node with zero dispatch
// edges.
func NoDispatchWorkflow(ctx workflow.Context) error { return nil }

// MultiActivityWorkflow calls three distinct activities sequentially, yielding
// three activity nodes and three activityCall edges.
func MultiActivityWorkflow(ctx workflow.Context) error {
	ctx = activityOpts(ctx)
	if err := workflow.ExecuteActivity(ctx, ActivityA).Get(ctx, nil); err != nil {
		return err
	}
	if err := workflow.ExecuteActivity(ctx, ActivityB).Get(ctx, nil); err != nil {
		return err
	}
	return workflow.ExecuteActivity(ctx, ActivityC).Get(ctx, nil)
}

func ActivityA(ctx context.Context) error { return nil }
func ActivityB(ctx context.Context) error { return nil }
func ActivityC(ctx context.Context) error { return nil }

// RepeatedActivityWorkflow calls the same activity three times. Despite three
// ACTIVITY_TASK_SCHEDULED events, history.Build must dedup to exactly one
// activity node and one activityCall edge.
func RepeatedActivityWorkflow(ctx workflow.Context) error {
	ctx = activityOpts(ctx)
	for i := 0; i < 3; i++ {
		if err := workflow.ExecuteActivity(ctx, RepeatedActivity).Get(ctx, nil); err != nil {
			return err
		}
	}
	return nil
}

func RepeatedActivity(ctx context.Context) error { return nil }

// FanOutWorkflow schedules the same activity once per loop iteration and awaits
// them all. Like RepeatedActivityWorkflow it must dedup to one activity node and
// one activityCall edge, but the count is a runtime fan-out rather than a
// literal repetition — the edge collapses regardless of input size.
func FanOutWorkflow(ctx workflow.Context, count int) error {
	ctx = activityOpts(ctx)
	futures := make([]workflow.Future, 0, count)
	for i := 0; i < count; i++ {
		futures = append(futures, workflow.ExecuteActivity(ctx, FanOutActivity, i))
	}
	for _, f := range futures {
		if err := f.Get(ctx, nil); err != nil {
			return err
		}
	}
	return nil
}

func FanOutActivity(ctx context.Context, i int) error { return nil }

// SharedActivityCallerA / SharedActivityCallerB both call the same activity on
// one queue. The shared activity must collapse to a single node with one
// incoming activityCall edge per distinct caller — a callee never splits a node
// by caller.
func SharedActivityCallerA(ctx workflow.Context) error {
	return workflow.ExecuteActivity(activityOpts(ctx), SharedActivity).Get(ctx, nil)
}

func SharedActivityCallerB(ctx workflow.Context) error {
	return workflow.ExecuteActivity(activityOpts(ctx), SharedActivity).Get(ctx, nil)
}

func SharedActivity(ctx context.Context) error { return nil }

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

// singleWorkflowActivity: one workflow that calls one activity in one namespace
// — the suite smoke case.
func singleWorkflowActivity() Case {
	wf := ExpectNode{Kind: graph.KindWorkflow, Name: graphTestWorkflowType}
	act := ExpectNode{Kind: graph.KindActivity, Name: graphTestActivityType}
	return Case{
		Name: "single-workflow-activity",
		Namespaces: []NamespaceSet{
			{
				Name: defaultNamespace,
				Workers: []WorkerSpec{
					{
						TaskQueue: graphTestQueue,
						Register: func(w worker.Worker) {
							w.RegisterWorkflow(GraphTestWorkflow)
							w.RegisterActivity(GraphTestActivity)
						},
					},
				},
				Starts: []StartSpec{
					{ID: "graph-it-wf-1", TaskQueue: graphTestQueue, Workflow: GraphTestWorkflow},
				},
			},
		},
		Expect: Expect{
			Nodes: []ExpectNode{
				wf, act,
				{Kind: graph.KindWorker, Name: graphTestQueue},
				{Kind: graph.KindNamespace, Name: defaultNamespace},
			},
			Edges: []ExpectEdge{
				{From: wf, To: act, Kind: graph.EdgeActivityCall},
			},
		},
	}
}

// workflowNoDispatch: a leaf workflow that schedules nothing. Proves a
// root-only history yields a clean workflow node with only containment edges
// (worker→namespace, workflow→worker) and zero spurious dispatch edges. The
// MaxNodes/MaxEdges caps are the negative assertion.
func workflowNoDispatch() Case {
	const tq = "s2-tq"
	return Case{
		Name: "workflow-no-dispatch",
		Namespaces: []NamespaceSet{
			{
				Name: defaultNamespace,
				Workers: []WorkerSpec{
					{
						TaskQueue: tq,
						Register:  func(w worker.Worker) { w.RegisterWorkflow(NoDispatchWorkflow) },
					},
				},
				Starts: []StartSpec{
					{ID: "s2-wf-1", TaskQueue: tq, Workflow: NoDispatchWorkflow},
				},
			},
		},
		Expect: Expect{
			Nodes: []ExpectNode{
				{Kind: graph.KindWorkflow, Name: "NoDispatchWorkflow"},
				{Kind: graph.KindWorker, Name: tq},
				{Kind: graph.KindNamespace, Name: defaultNamespace},
			},
			// 3 nodes (namespace, worker, workflow); 2 containment edges only.
			MaxNodes: 3,
			MaxEdges: 2,
		},
	}
}

// workflowMultipleDistinctActivities: one workflow calling three distinct
// activities sequentially — three activity nodes and three activityCall edges.
func workflowMultipleDistinctActivities() Case {
	const tq = "s3-tq"
	wf := ExpectNode{Kind: graph.KindWorkflow, Name: "MultiActivityWorkflow"}
	a := ExpectNode{Kind: graph.KindActivity, Name: "ActivityA"}
	b := ExpectNode{Kind: graph.KindActivity, Name: "ActivityB"}
	c := ExpectNode{Kind: graph.KindActivity, Name: "ActivityC"}
	return Case{
		Name: "workflow-multiple-distinct-activities",
		Namespaces: []NamespaceSet{
			{
				Name: defaultNamespace,
				Workers: []WorkerSpec{
					{
						TaskQueue: tq,
						Register: func(w worker.Worker) {
							w.RegisterWorkflow(MultiActivityWorkflow)
							w.RegisterActivity(ActivityA)
							w.RegisterActivity(ActivityB)
							w.RegisterActivity(ActivityC)
						},
					},
				},
				Starts: []StartSpec{
					{ID: "s3-wf-1", TaskQueue: tq, Workflow: MultiActivityWorkflow},
				},
			},
		},
		Expect: Expect{
			Nodes: []ExpectNode{wf, a, b, c},
			Edges: []ExpectEdge{
				{From: wf, To: a, Kind: graph.EdgeActivityCall},
				{From: wf, To: b, Kind: graph.EdgeActivityCall},
				{From: wf, To: c, Kind: graph.EdgeActivityCall},
			},
		},
	}
}

// workflowRepeatedActivity: one workflow calls the same activity three times.
// Exercises history.Build edge/node dedup — exactly one activity node and one
// activityCall edge despite three schedules.
func workflowRepeatedActivity() Case {
	const tq = "s4-tq"
	wf := ExpectNode{Kind: graph.KindWorkflow, Name: "RepeatedActivityWorkflow"}
	act := ExpectNode{Kind: graph.KindActivity, Name: "RepeatedActivity"}
	return Case{
		Name: "workflow-repeated-activity",
		Namespaces: []NamespaceSet{
			{
				Name: defaultNamespace,
				Workers: []WorkerSpec{
					{
						TaskQueue: tq,
						Register: func(w worker.Worker) {
							w.RegisterWorkflow(RepeatedActivityWorkflow)
							w.RegisterActivity(RepeatedActivity)
						},
					},
				},
				Starts: []StartSpec{
					{ID: "s4-wf-1", TaskQueue: tq, Workflow: RepeatedActivityWorkflow},
				},
			},
		},
		Expect: Expect{
			Nodes:      []ExpectNode{wf, act},
			Edges:      []ExpectEdge{{From: wf, To: act, Kind: graph.EdgeActivityCall}},
			NodeCounts: []NodeCount{{Node: act, Want: 1}},
			EdgeCounts: []EdgeCount{{Edge: ExpectEdge{From: wf, To: act, Kind: graph.EdgeActivityCall}, Want: 1}},
		},
	}
}

// fanOutSameActivity: a workflow fans out the same activity across a runtime
// loop and awaits all. Despite N schedules the graph must collapse to one
// activity node and one activityCall edge — fan-out count never inflates the
// edge set.
func fanOutSameActivity() Case {
	const tq = "s5-tq"
	wf := ExpectNode{Kind: graph.KindWorkflow, Name: "FanOutWorkflow"}
	act := ExpectNode{Kind: graph.KindActivity, Name: "FanOutActivity"}
	return Case{
		Name: "fan-out-same-activity",
		Namespaces: []NamespaceSet{
			{
				Name: defaultNamespace,
				Workers: []WorkerSpec{
					{
						TaskQueue: tq,
						Register: func(w worker.Worker) {
							w.RegisterWorkflow(FanOutWorkflow)
							w.RegisterActivity(FanOutActivity)
						},
					},
				},
				Starts: []StartSpec{
					{ID: "s5-wf-1", TaskQueue: tq, Workflow: FanOutWorkflow, Args: []interface{}{5}},
				},
			},
		},
		Expect: Expect{
			Nodes:      []ExpectNode{wf, act},
			Edges:      []ExpectEdge{{From: wf, To: act, Kind: graph.EdgeActivityCall}},
			NodeCounts: []NodeCount{{Node: act, Want: 1}},
			EdgeCounts: []EdgeCount{{Edge: ExpectEdge{From: wf, To: act, Kind: graph.EdgeActivityCall}, Want: 1}},
		},
	}
}

// multipleWorkflowsSharedActivity: two distinct workflows call the same
// activity on one queue. The activity is a single shared node with one incoming
// activityCall edge per caller — the callee is never split by caller.
func multipleWorkflowsSharedActivity() Case {
	const tq = "s6-tq"
	callerA := ExpectNode{Kind: graph.KindWorkflow, Name: "SharedActivityCallerA"}
	callerB := ExpectNode{Kind: graph.KindWorkflow, Name: "SharedActivityCallerB"}
	shared := ExpectNode{Kind: graph.KindActivity, Name: "SharedActivity"}
	return Case{
		Name: "multiple-workflows-shared-activity",
		Namespaces: []NamespaceSet{
			{
				Name: defaultNamespace,
				Workers: []WorkerSpec{
					{
						TaskQueue: tq,
						Register: func(w worker.Worker) {
							w.RegisterWorkflow(SharedActivityCallerA)
							w.RegisterWorkflow(SharedActivityCallerB)
							w.RegisterActivity(SharedActivity)
						},
					},
				},
				Starts: []StartSpec{
					{ID: "s6-wf-a", TaskQueue: tq, Workflow: SharedActivityCallerA},
					{ID: "s6-wf-b", TaskQueue: tq, Workflow: SharedActivityCallerB},
				},
			},
		},
		Expect: Expect{
			Nodes: []ExpectNode{callerA, callerB, shared},
			Edges: []ExpectEdge{
				{From: callerA, To: shared, Kind: graph.EdgeActivityCall},
				{From: callerB, To: shared, Kind: graph.EdgeActivityCall},
			},
			NodeCounts: []NodeCount{{Node: shared, Want: 1}},
		},
	}
}
