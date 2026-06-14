//go:build integration

package integration

import (
	"context"
	"time"

	"go.temporal.io/sdk/worker"
	"go.temporal.io/sdk/workflow"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
)

// Task-queue routing: one definition scheduled onto more than one queue yields
// one deployment-keyed node per queue.
//   same-definition-two-queues  one activity definition, two queues, two nodes

const (
	s10WorkflowQueue = "s10-wf-tq"
	s10QueueA        = "s10-a-tq"
	s10QueueB        = "s10-b-tq"
)

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// QueueRoutedWorkflow schedules one activity definition onto whichever task
// queue its input names. Across executions that target different queues, the
// single definition resolves to one deployment-keyed activity node per queue
// (two nodes, same definition) — the core "two queues -> two nodes" rule.
func QueueRoutedWorkflow(ctx workflow.Context, queue string) error {
	ctx = workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		TaskQueue:           queue,
		StartToCloseTimeout: time.Minute,
	})
	return workflow.ExecuteActivity(ctx, RoutedActivity).Get(ctx, nil)
}

func RoutedActivity(ctx context.Context) error { return nil }

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

// sameDefinitionTwoQueues: one workflow schedules a single activity definition
// onto queue A in one execution and queue B in another. The definition resolves
// to two distinct deployment-keyed activity nodes (same definition, different
// worker parents) with an activityCall edge into each. Both executions must be
// sampled to surface both queues, so the exact counts are checked at full sample.
func sameDefinitionTwoQueues() Case {
	wf := ExpectNode{Kind: graph.KindWorkflow, Name: "QueueRoutedWorkflow"}
	act := ExpectNode{Kind: graph.KindActivity, Name: "RoutedActivity"}
	return Case{
		Name: "same-definition-two-queues",
		Namespaces: []NamespaceSet{
			{
				Name: defaultNamespace,
				Workers: []WorkerSpec{
					{
						TaskQueue: s10WorkflowQueue,
						Register:  func(w worker.Worker) { w.RegisterWorkflow(QueueRoutedWorkflow) },
					},
					{
						TaskQueue: s10QueueA,
						Register:  func(w worker.Worker) { w.RegisterActivity(RoutedActivity) },
					},
					{
						TaskQueue: s10QueueB,
						Register:  func(w worker.Worker) { w.RegisterActivity(RoutedActivity) },
					},
				},
				Starts: starts(
					"s10-wf", s10WorkflowQueue, QueueRoutedWorkflow,
					[]interface{}{s10QueueA},
					[]interface{}{s10QueueB},
				),
			},
		},
		Expect: Expect{
			Nodes: []ExpectNode{
				wf, act,
				{Kind: graph.KindWorker, Name: s10QueueA},
				{Kind: graph.KindWorker, Name: s10QueueB},
			},
			Edges:      []ExpectEdge{{From: wf, To: act, Kind: graph.EdgeActivityCall}},
			NodeCounts: []NodeCount{{Node: act, Want: 2}}, // one node per queue, same definition
			EdgeCounts: []EdgeCount{{Edge: ExpectEdge{From: wf, To: act, Kind: graph.EdgeActivityCall}, Want: 2}},
		},
	}
}
