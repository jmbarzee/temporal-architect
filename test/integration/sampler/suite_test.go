//go:build integration

package integration

import (
	"testing"

	"go.temporal.io/sdk/worker"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
)

// TestSamplerSuite runs every case through the direct-call harness in parallel.
// Each case gets its own dev server, so cases cannot pollute one another.
func TestSamplerSuite(t *testing.T) {
	if testing.Short() {
		t.Skip("integration suite: skipped in -short mode")
	}
	for _, c := range cases() {
		c := c
		t.Run(c.Name, func(t *testing.T) { runCase(t, c) })
	}
}

// cases is the suite table. Add a scenario by appending a Case: a workflow set
// to run plus the graph structure it must produce.
func cases() []Case {
	return []Case{
		singleWorkflowActivity(),
	}
}

// singleWorkflowActivity: one workflow that calls one activity in one namespace.
func singleWorkflowActivity() Case {
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
				{Kind: graph.KindWorkflow, Name: graphTestWorkflowType},
				{Kind: graph.KindActivity, Name: graphTestActivityType},
				{Kind: graph.KindWorker, Name: graphTestQueue},
				{Kind: graph.KindNamespace, Name: defaultNamespace},
			},
			Edges: []ExpectEdge{
				{
					From: ExpectNode{Kind: graph.KindWorkflow, Name: graphTestWorkflowType},
					To:   ExpectNode{Kind: graph.KindActivity, Name: graphTestActivityType},
					Kind: graph.EdgeActivityCall,
				},
			},
		},
	}
}
