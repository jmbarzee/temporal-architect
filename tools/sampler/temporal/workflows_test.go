package temporal

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/stretchr/testify/mock"
	"go.temporal.io/sdk/testsuite"
	"go.temporal.io/sdk/workflow"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/observe"
	"github.com/jmbarzee/temporal-architect/tools/sampler/sampling"
)

// partial builds a tiny one-node ObservedGraph standing in for a folded batch,
// so a test can assert the fan-in union by node identity. Each distinct nodeID
// contributes one node to the merged graph.
func partial(nodeID string) *observe.ObservedGraph {
	g := observe.New()
	g.Nodes = append(g.Nodes, graph.Node{
		ID:         nodeID,
		Definition: graph.DefKey(graph.KindWorkflow, nodeID),
	})
	observe.Finalize(g)
	return g
}

// testActivities is an Activities whose Connect never runs — every activity is
// mocked in the test environment, so no real backend is needed.
func testActivities() *Activities {
	return &Activities{Connect: func(string) (sampling.Backend, func(), error) {
		return nil, nil, fmt.Errorf("no backend in test")
	}}
}

func registerAll(env interface {
	RegisterWorkflow(interface{})
	RegisterActivity(interface{})
}, a *Activities) {
	env.RegisterWorkflow(SampleNamespaceWorkflow)
	env.RegisterWorkflow(EnumerateTypesWorkflow)
	env.RegisterWorkflow(SampleTypeWorkflow)
	env.RegisterActivity(a)
}

// The whole point: the parallel fan-out + observe.Merge fan-in reproduces the
// union of every per-execution partial. Two types (Foo=2 execs, Bar=1), each
// execution folded to a distinct node, must merge to exactly 3 nodes.
func TestSampleNamespaceWorkflow_MergesAllPartials(t *testing.T) {
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestWorkflowEnvironment()
	a := testActivities()
	registerAll(env, a)

	env.OnActivity(a.EnumerateTypes, mock.Anything, mock.Anything).Return(
		&TypeDiscovery{
			TypeCounts: []sampling.TypeCount{{WorkflowType: "Foo", Count: 2}, {WorkflowType: "Bar", Count: 1}},
			Coverage: TypeCoverage{
				Types: 2, Exhaustive: true, Rounds: 1, Calls: 3, Source: CoverageDiscovered,
			},
		}, nil)

	env.OnActivity(a.SelectCandidates, mock.Anything, mock.MatchedBy(func(r SelectRequest) bool { return r.WorkflowType == "Foo" })).
		Return(execs("foo-0", "foo-1"), nil)
	env.OnActivity(a.SelectCandidates, mock.Anything, mock.MatchedBy(func(r SelectRequest) bool { return r.WorkflowType == "Bar" })).
		Return(execs("bar-0"), nil)

	// One node per execution → distinct nodes prove every partial folded in.
	env.OnActivity(a.FetchFoldHistory, mock.Anything, mock.Anything).Return(
		func(_ context.Context, req FetchRequest) (*observe.ObservedGraph, error) {
			return partial("n:" + req.Executions[0].WorkflowID), nil
		})

	env.ExecuteWorkflow(SampleNamespaceWorkflow, SampleRequest{
		Namespace:       "target",
		SamplePercent:   100,
		MinPerType:      1,
		BatchSize:       1, // one execution per fetch → 3 leaf activities total
		TypeConcurrency: 2,
		ExecConcurrency: 2,
	})

	if !env.IsWorkflowCompleted() {
		t.Fatal("workflow did not complete")
	}
	if err := env.GetWorkflowError(); err != nil {
		t.Fatalf("workflow error: %v", err)
	}

	var res SampleResult
	if err := env.GetWorkflowResult(&res); err != nil {
		t.Fatalf("get result: %v", err)
	}
	og := res.Graph
	if og.Summary.Nodes != 3 {
		t.Fatalf("merged nodes=%d, want 3", og.Summary.Nodes)
	}
	// The coverage assurance must survive the trip from the discovery activity
	// out to the caller — a graph without it can't be told apart from a partial.
	if !res.Coverage.Exhaustive || res.Coverage.Types != 2 {
		t.Fatalf("coverage = %+v, want exhaustive with 2 types", res.Coverage)
	}
	got := map[string]bool{}
	for _, n := range og.Nodes {
		got[n.ID] = true
	}
	for _, want := range []string{"n:foo-0", "n:foo-1", "n:bar-0"} {
		if !got[want] {
			t.Fatalf("merged graph missing node %q (have %v)", want, got)
		}
	}

	// GetProgress reflects the finished fan-in.
	encoded, err := env.QueryWorkflow(GetProgressQuery)
	if err != nil {
		t.Fatalf("query progress: %v", err)
	}
	var prog SampleProgress
	if err := encoded.Get(&prog); err != nil {
		t.Fatalf("decode progress: %v", err)
	}
	if prog.TypesTotal != 2 || prog.TypesDone != 2 {
		t.Fatalf("progress types total/done = %d/%d, want 2/2", prog.TypesTotal, prog.TypesDone)
	}
	if !prog.Coverage.Exhaustive {
		t.Error("progress query should expose coverage so a run can be judged mid-flight")
	}
	if prog.ExecutionsSampled != 3 {
		t.Fatalf("progress executionsSampled=%d, want 3", prog.ExecutionsSampled)
	}
	if prog.PerType["Foo"].Sampled != 2 || prog.PerType["Bar"].Sampled != 1 {
		t.Fatalf("perType = %+v", prog.PerType)
	}
	env.AssertExpectations(t)
}

// A single-run SampleTypeWorkflow (batchesPerRun unbounded) selects once and
// folds every candidate's partial into the per-type graph.
func TestSampleTypeWorkflow_FoldsAllBatches(t *testing.T) {
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestWorkflowEnvironment()
	a := testActivities()
	env.RegisterWorkflow(SampleTypeWorkflow)
	env.RegisterActivity(a)

	env.OnActivity(a.SelectCandidates, mock.Anything, mock.Anything).Return(execs("x-0", "x-1"), nil)
	env.OnActivity(a.FetchFoldHistory, mock.Anything, mock.Anything).Return(
		func(_ context.Context, req FetchRequest) (*observe.ObservedGraph, error) {
			return partial("n:" + req.Executions[0].WorkflowID), nil
		})

	env.ExecuteWorkflow(SampleTypeWorkflow, SampleTypeRequest{
		Namespace:       "target",
		WorkflowType:    "X",
		Target:          2,
		BatchSize:       1,
		BatchesPerRun:   0, // unbounded → both batches this run
		ExecConcurrency: 2,
	})

	if !env.IsWorkflowCompleted() {
		t.Fatal("did not complete")
	}
	if err := env.GetWorkflowError(); err != nil {
		t.Fatalf("error: %v", err)
	}
	var sample TypeSample
	if err := env.GetWorkflowResult(&sample); err != nil {
		t.Fatalf("result: %v", err)
	}
	if sample.Sampled != 2 || sample.Graph.Summary.Nodes != 2 {
		t.Fatalf("sample=%+v (nodes=%d)", sample, sample.Graph.Summary.Nodes)
	}
}

// With BatchesPerRun=1 and two candidates, SampleTypeWorkflow processes one
// batch then continues-as-new to bound its history — verifying the CAN cursor.
func TestSampleTypeWorkflow_ContinuesAsNew(t *testing.T) {
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestWorkflowEnvironment()
	a := testActivities()
	env.RegisterWorkflow(SampleTypeWorkflow)
	env.RegisterActivity(a)

	env.OnActivity(a.SelectCandidates, mock.Anything, mock.Anything).Return(execs("x-0", "x-1"), nil)
	env.OnActivity(a.FetchFoldHistory, mock.Anything, mock.Anything).Return(
		func(_ context.Context, req FetchRequest) (*observe.ObservedGraph, error) {
			return partial("n:" + req.Executions[0].WorkflowID), nil
		})

	env.ExecuteWorkflow(SampleTypeWorkflow, SampleTypeRequest{
		Namespace:     "target",
		WorkflowType:  "X",
		Target:        2,
		BatchSize:     1,
		BatchesPerRun: 1, // one batch then continue-as-new
	})

	if !env.IsWorkflowCompleted() {
		t.Fatal("did not complete")
	}
	err := env.GetWorkflowError()
	var canErr *workflow.ContinueAsNewError
	if !errors.As(err, &canErr) {
		t.Fatalf("expected ContinueAsNewError, got %v", err)
	}
}
