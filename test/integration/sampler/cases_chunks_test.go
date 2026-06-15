//go:build integration

package integration

import (
	"context"
	"testing"
	"time"

	"go.temporal.io/sdk/client"
	"go.temporal.io/sdk/worker"
	"go.temporal.io/sdk/workflow"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/decompose"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/history"
	"github.com/jmbarzee/temporal-architect/tools/sampler/sampling"
)

// Round-trip coverage for `twf graph chunks`: drive real executions, sample
// them, rebuild the graph with history.Build, and assert the decomposition over
// that same graph. This reuses the suite's dev-server + sampling rig rather than
// introducing a new one; there is no AST in this path, so the decomposition is
// purely structural (base complexity per node).
//
//   connected-component grouping  two independent workflow→activity pairs land
//                                 in two separate chunks
//   cycle collapse (no cut)       a bounded mutual recursion (A↔B) collapses to
//                                 one cyclic chunk that is never divided
//   oversized-tree cuts           a workflow over the ceiling yields a tree
//                                 division ordered by a dependency DAG

const chunksQueue = "chunks-it-tq"

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Two independent workflow→activity pairs — no call path between them, so they
// must reconstruct as two disconnected components.
func IndepOneWorkflow(ctx workflow.Context) error {
	return workflow.ExecuteActivity(activityOpts(ctx), IndepOneActivity).Get(ctx, nil)
}
func IndepOneActivity(ctx context.Context) error { return nil }

func IndepTwoWorkflow(ctx workflow.Context) error {
	return workflow.ExecuteActivity(activityOpts(ctx), IndepTwoActivity).Get(ctx, nil)
}
func IndepTwoActivity(ctx context.Context) error { return nil }

// BigTreeWorkflow fans to three distinct activities — an oversized tree once the
// ceiling is low enough.
func BigTreeWorkflow(ctx workflow.Context) error {
	ctx = activityOpts(ctx)
	for _, a := range []interface{}{BigTreeActivityA, BigTreeActivityB, BigTreeActivityC} {
		if err := workflow.ExecuteActivity(ctx, a).Get(ctx, nil); err != nil {
			return err
		}
	}
	return nil
}
func BigTreeActivityA(ctx context.Context) error { return nil }
func BigTreeActivityB(ctx context.Context) error { return nil }
func BigTreeActivityC(ctx context.Context) error { return nil }

// CycleA/CycleB form a bounded mutual recursion. Both directions execute, so the
// reconstructed graph carries workflowCall edges A→B and B→A — a cycle — while
// every execution still terminates.
func CycleAWorkflow(ctx workflow.Context, depth int) error {
	if depth >= 2 {
		return nil
	}
	ctx = workflow.WithChildOptions(ctx, workflow.ChildWorkflowOptions{})
	return workflow.ExecuteChildWorkflow(ctx, CycleBWorkflow, depth+1).Get(ctx, nil)
}
func CycleBWorkflow(ctx workflow.Context, depth int) error {
	if depth >= 2 {
		return nil
	}
	ctx = workflow.WithChildOptions(ctx, workflow.ChildWorkflowOptions{})
	return workflow.ExecuteChildWorkflow(ctx, CycleAWorkflow, depth+1).Get(ctx, nil)
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

func TestChunksRoundTrip(t *testing.T) {
	if testing.Short() {
		t.Skip("integration: skipped in -short mode")
	}
	t.Parallel()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	srv := startDevServer(ctx, t, []string{defaultNamespace})
	defer func() { _ = srv.Stop() }()

	cl, err := client.Dial(client.Options{HostPort: srv.FrontendHostPort(), Namespace: defaultNamespace})
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer cl.Close()

	w := worker.New(cl, chunksQueue, worker.Options{})
	w.RegisterWorkflow(IndepOneWorkflow)
	w.RegisterActivity(IndepOneActivity)
	w.RegisterWorkflow(IndepTwoWorkflow)
	w.RegisterActivity(IndepTwoActivity)
	w.RegisterWorkflow(BigTreeWorkflow)
	w.RegisterActivity(BigTreeActivityA)
	w.RegisterActivity(BigTreeActivityB)
	w.RegisterActivity(BigTreeActivityC)
	w.RegisterWorkflow(CycleAWorkflow)
	w.RegisterWorkflow(CycleBWorkflow)
	if err := w.Start(); err != nil {
		t.Fatalf("start worker: %v", err)
	}
	defer w.Stop()

	starts := []struct {
		id  string
		wf  interface{}
		arg []interface{}
	}{
		{"chunks-indep-one", IndepOneWorkflow, nil},
		{"chunks-indep-two", IndepTwoWorkflow, nil},
		{"chunks-big-tree", BigTreeWorkflow, nil},
		{"chunks-cycle", CycleAWorkflow, []interface{}{0}},
	}
	for _, s := range starts {
		run, err := cl.ExecuteWorkflow(ctx, client.StartWorkflowOptions{ID: s.id, TaskQueue: chunksQueue}, s.wf, s.arg...)
		if err != nil {
			t.Fatalf("execute %q: %v", s.id, err)
		}
		if err := run.Get(ctx, nil); err != nil {
			t.Fatalf("workflow %q: %v", s.id, err)
		}
	}

	// A→B→A is three executions; the four roots above start more. Wait for the
	// full set to be visible, then sample everything.
	waitForVisibleCount(ctx, t, cl, defaultNamespace, len(starts)+2)

	histories, err := sampling.Sample(ctx, cl, sampling.Options{
		Namespace:     defaultNamespace,
		SamplePercent: 100,
		MinPerType:    1 << 30,
	})
	if err != nil {
		t.Fatalf("sample: %v", err)
	}
	g := history.Build(histories, history.Context{})

	indepOne := graph.DefKey(graph.KindWorkflow, "IndepOneWorkflow")
	indepOneAct := graph.DefKey(graph.KindActivity, "IndepOneActivity")
	indepTwo := graph.DefKey(graph.KindWorkflow, "IndepTwoWorkflow")
	bigTree := graph.DefKey(graph.KindWorkflow, "BigTreeWorkflow")
	cycleA := graph.DefKey(graph.KindWorkflow, "CycleAWorkflow")
	cycleB := graph.DefKey(graph.KindWorkflow, "CycleBWorkflow")

	// --- Connected-component grouping + oversized-tree cut ---
	res := decompose.Decompose(nil, g, decompose.Options{Ceiling: 3, Floor: -1})

	cOne := chunkContaining(t, res, indepOne)
	cTwo := chunkContaining(t, res, indepTwo)
	if cOne.ID == cTwo.ID {
		t.Errorf("independent workflows must land in separate chunks; both in %s", cOne.ID)
	}
	if !memberOf(cOne, indepOneAct) {
		t.Errorf("IndepOneActivity should share IndepOneWorkflow's chunk %s; members %v", cOne.ID, cOne.Members)
	}

	cBig := chunkContaining(t, res, bigTree)
	if len(cBig.Divisions) == 0 {
		t.Fatalf("oversized BigTreeWorkflow chunk (complexity %d, ceiling %d) should have divisions", cBig.Complexity, res.Ceiling)
	}
	var tree *decompose.Division
	for i := range cBig.Divisions {
		if cBig.Divisions[i].Strategy == decompose.StrategyTree {
			tree = &cBig.Divisions[i]
			break
		}
	}
	if tree == nil {
		t.Fatalf("expected a tree division for the oversized chunk; got %+v", cBig.Divisions)
	}
	// root section + one per leaf activity.
	if len(tree.Sections) != 4 {
		t.Errorf("tree division sections = %d, want 4; %+v", len(tree.Sections), tree.Sections)
	}
	if len(tree.DAG) == 0 {
		t.Errorf("tree division should carry a dependency DAG")
	}

	// --- Cycle collapse (no cut) ---
	// A lower ceiling makes the loop chunk over-ceiling; it must still not be cut.
	resCycle := decompose.Decompose(nil, g, decompose.Options{Ceiling: 1, Floor: -1})
	cCycle := chunkContaining(t, resCycle, cycleA)
	if !memberOf(cCycle, cycleB) {
		t.Fatalf("CycleA and CycleB must collapse into one chunk; members %v", cCycle.Members)
	}
	if !cCycle.Cyclic {
		t.Errorf("the mutual-recursion chunk should be marked cyclic")
	}
	if cCycle.Complexity <= resCycle.Ceiling {
		t.Fatalf("loop chunk complexity %d should exceed ceiling %d for the exemption to matter", cCycle.Complexity, resCycle.Ceiling)
	}
	if len(cCycle.Divisions) != 0 {
		t.Errorf("loop chunk must be exempt from cutting; got %+v", cCycle.Divisions)
	}
}

// chunkContaining returns the chunk that lists key as a member, failing if none.
func chunkContaining(t *testing.T, res *decompose.Result, key string) decompose.Chunk {
	t.Helper()
	for _, c := range res.Chunks {
		if memberOf(c, key) {
			return c
		}
	}
	t.Fatalf("no chunk contains %q", key)
	return decompose.Chunk{}
}

func memberOf(c decompose.Chunk, key string) bool {
	for _, m := range c.Members {
		if m == key {
			return true
		}
	}
	return false
}
