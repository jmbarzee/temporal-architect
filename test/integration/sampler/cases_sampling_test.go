//go:build integration

package integration

import (
	"context"
	"time"

	"go.temporal.io/sdk/worker"
	"go.temporal.io/sdk/workflow"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
)

// Sampling-coverage cases: per-type enumeration and the union-across-the-sample
// reconstruction that the expansion ladder drives.
//   multi-type-single-namespace        per-type enumeration loop
//   varied-call-patterns-per-type       union across branches
//   varied-call-patterns-rare-branch    rare branch surfaces at full sample
//   low-volume-type-min-per-type        MinPerType floor on a tiny type
//   high-volume-sampling-sufficiency    sampled subset reconstructs the union

// Workflow/activity type names shared across the branching cases. They mirror
// the fixture function names (the SDK derives the type from the func name) and
// let the Expect side reference each name exactly once.
const (
	branchingWorkflowType = "BranchingWorkflow"
	branchActivityAType   = "BranchActivityA"
	branchActivityBType   = "BranchActivityB"
	branchActivityCType   = "BranchActivityC"
)

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// MultiType{Alpha..Echo} are five distinct leaf workflow types on one worker,
// exercising sampling.Sample's per-type enumeration loop.
func MultiTypeAlpha(ctx workflow.Context) error   { return nil }
func MultiTypeBravo(ctx workflow.Context) error   { return nil }
func MultiTypeCharlie(ctx workflow.Context) error { return nil }
func MultiTypeDelta(ctx workflow.Context) error   { return nil }
func MultiTypeEcho(ctx workflow.Context) error    { return nil }

// BranchingWorkflow is one workflow type whose history depends on its input:
// each execution shows only a subset of the activities, so only the union
// across the sample reconstructs the full edge set {A,B,C}. branch 0 calls A;
// 1 calls B; anything else calls A, B and C.
func BranchingWorkflow(ctx workflow.Context, branch int) error {
	ctx = workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: time.Minute,
	})
	switch branch {
	case 0:
		return workflow.ExecuteActivity(ctx, BranchActivityA).Get(ctx, nil)
	case 1:
		return workflow.ExecuteActivity(ctx, BranchActivityB).Get(ctx, nil)
	default:
		if err := workflow.ExecuteActivity(ctx, BranchActivityA).Get(ctx, nil); err != nil {
			return err
		}
		if err := workflow.ExecuteActivity(ctx, BranchActivityB).Get(ctx, nil); err != nil {
			return err
		}
		return workflow.ExecuteActivity(ctx, BranchActivityC).Get(ctx, nil)
	}
}

func BranchActivityA(ctx context.Context) error { return nil }
func BranchActivityB(ctx context.Context) error { return nil }
func BranchActivityC(ctx context.Context) error { return nil }

// registerBranching registers the branching workflow and its three activities —
// the identical worker setup every branching case needs.
func registerBranching(w worker.Worker) {
	w.RegisterWorkflow(BranchingWorkflow)
	w.RegisterActivity(BranchActivityA)
	w.RegisterActivity(BranchActivityB)
	w.RegisterActivity(BranchActivityC)
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

// multiTypeSingleNamespace: five distinct workflow types on one worker,
// exercising sampling.Sample's per-type enumeration. All five workflow nodes
// plus the worker and namespace must appear.
func multiTypeSingleNamespace() Case {
	const tq = "s13-tq"
	nodes := []ExpectNode{
		{Kind: graph.KindWorker, Name: tq},
		{Kind: graph.KindNamespace, Name: defaultNamespace},
		{Kind: graph.KindWorkflow, Name: "MultiTypeAlpha"},
		{Kind: graph.KindWorkflow, Name: "MultiTypeBravo"},
		{Kind: graph.KindWorkflow, Name: "MultiTypeCharlie"},
		{Kind: graph.KindWorkflow, Name: "MultiTypeDelta"},
		{Kind: graph.KindWorkflow, Name: "MultiTypeEcho"},
	}
	return Case{
		Name: "multi-type-single-namespace",
		Namespaces: []NamespaceSet{
			{
				Name: defaultNamespace,
				Workers: []WorkerSpec{
					{
						TaskQueue: tq,
						Register: func(w worker.Worker) {
							w.RegisterWorkflow(MultiTypeAlpha)
							w.RegisterWorkflow(MultiTypeBravo)
							w.RegisterWorkflow(MultiTypeCharlie)
							w.RegisterWorkflow(MultiTypeDelta)
							w.RegisterWorkflow(MultiTypeEcho)
						},
					},
				},
				Starts: []StartSpec{
					{ID: "s13-alpha", TaskQueue: tq, Workflow: MultiTypeAlpha},
					{ID: "s13-bravo", TaskQueue: tq, Workflow: MultiTypeBravo},
					{ID: "s13-charlie", TaskQueue: tq, Workflow: MultiTypeCharlie},
					{ID: "s13-delta", TaskQueue: tq, Workflow: MultiTypeDelta},
					{ID: "s13-echo", TaskQueue: tq, Workflow: MultiTypeEcho},
				},
			},
		},
		Expect: Expect{
			Nodes:    nodes,
			MinNodes: 7, // 5 workflows + worker + namespace
		},
	}
}

// variedCallPatternsPerType: one workflow type, many executions whose branch
// differs by input, so each history shows a subset of {A,B,C}. Only the union
// across the sample reconstructs all three activityCall edges — the expansion
// ladder must climb toward 100% to satisfy the expectation.
func variedCallPatternsPerType() Case {
	const tq = "r1-tq"
	wf := ExpectNode{Kind: graph.KindWorkflow, Name: branchingWorkflowType}
	a := ExpectNode{Kind: graph.KindActivity, Name: branchActivityAType}
	b := ExpectNode{Kind: graph.KindActivity, Name: branchActivityBType}
	c := ExpectNode{Kind: graph.KindActivity, Name: branchActivityCType}
	// Six executions spanning all three branches.
	argSets := [][]interface{}{{0}, {1}, {2}, {0}, {1}, {2}}
	return Case{
		Name: "varied-call-patterns-per-type",
		Namespaces: []NamespaceSet{
			{
				Name:    defaultNamespace,
				Workers: []WorkerSpec{{TaskQueue: tq, Register: registerBranching}},
				Starts:  starts("r1-wf", tq, BranchingWorkflow, argSets...),
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

// variedCallPatternsRareBranch: a skewed distribution — ten executions of the
// A-only branch and a single execution exercising A, B and C. The B and C edges
// only surface once the rare execution is sampled, which the expansion ladder
// guarantees at the full (100%) step. (Asserting *which* step first resolves C
// is not expressible with the current harness.)
func variedCallPatternsRareBranch() Case {
	const tq = "r1b-tq"
	wf := ExpectNode{Kind: graph.KindWorkflow, Name: branchingWorkflowType}
	a := ExpectNode{Kind: graph.KindActivity, Name: branchActivityAType}
	b := ExpectNode{Kind: graph.KindActivity, Name: branchActivityBType}
	c := ExpectNode{Kind: graph.KindActivity, Name: branchActivityCType}
	argSets := append(argN(10, 0), []interface{}{2})
	return Case{
		Name: "varied-call-patterns-rare-branch",
		Namespaces: []NamespaceSet{
			{
				Name:    defaultNamespace,
				Workers: []WorkerSpec{{TaskQueue: tq, Register: registerBranching}},
				Starts:  starts("r1b-wf", tq, BranchingWorkflow, argSets...),
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

// lowVolumeTypeMinPerType: a type with just two executions, each taking a
// different branch. The MinPerType floor and total cap mean both are sampled by
// the expansion ladder, so the union {A,B} is fully reconstructed despite the
// low volume.
func lowVolumeTypeMinPerType() Case {
	const tq = "r4-tq"
	wf := ExpectNode{Kind: graph.KindWorkflow, Name: branchingWorkflowType}
	a := ExpectNode{Kind: graph.KindActivity, Name: branchActivityAType}
	b := ExpectNode{Kind: graph.KindActivity, Name: branchActivityBType}
	return Case{
		Name: "low-volume-type-min-per-type",
		Namespaces: []NamespaceSet{
			{
				Name:    defaultNamespace,
				Workers: []WorkerSpec{{TaskQueue: tq, Register: registerBranching}},
				// Exactly two executions: branch 0 (A only) and branch 1 (B only).
				Starts: starts("r4-wf", tq, BranchingWorkflow,
					[]interface{}{0},
					[]interface{}{1},
				),
			},
		},
		Expect: Expect{
			Nodes: []ExpectNode{wf, a, b},
			Edges: []ExpectEdge{
				{From: wf, To: a, Kind: graph.EdgeActivityCall},
				{From: wf, To: b, Kind: graph.EdgeActivityCall},
			},
		},
	}
}

// highVolumeSamplingSufficiency: many executions of one type across all
// branches. The union of the *sampled* subset reconstructs the full edge set
// {A,B,C} — the expansion ladder (SamplePercent + MinPerType) need not pull
// every execution to satisfy the expectation. Documents the partial-by-design
// limitation in GRAPH_FROM_HISTORY.
func highVolumeSamplingSufficiency() Case {
	const tq = "r5-tq"
	wf := ExpectNode{Kind: graph.KindWorkflow, Name: branchingWorkflowType}
	a := ExpectNode{Kind: graph.KindActivity, Name: branchActivityAType}
	b := ExpectNode{Kind: graph.KindActivity, Name: branchActivityBType}
	c := ExpectNode{Kind: graph.KindActivity, Name: branchActivityCType}
	// 24 executions cycling through the three branches.
	var argSets [][]interface{}
	for i := 0; i < 24; i++ {
		argSets = append(argSets, []interface{}{i % 3})
	}
	return Case{
		Name: "high-volume-sampling-sufficiency",
		Namespaces: []NamespaceSet{
			{
				Name:    defaultNamespace,
				Workers: []WorkerSpec{{TaskQueue: tq, Register: registerBranching}},
				Starts:  starts("r5-wf", tq, BranchingWorkflow, argSets...),
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
