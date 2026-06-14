//go:build integration

package integration

import (
	"context"
	"errors"
	"time"

	"go.temporal.io/sdk/worker"
	"go.temporal.io/sdk/workflow"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
)

// Failure case: edges survive a failed execution because history.Build reads
// scheduling events, not completion status.
//   failed-execution-still-yields-edges  activityCall survives a failed workflow

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// FailAfterActivityWorkflow schedules an activity, then fails. Because
// history.Build reads *_SCHEDULED events rather than completion status, the
// activityCall edge survives the workflow failure.
func FailAfterActivityWorkflow(ctx workflow.Context) error {
	ctx = workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: time.Minute,
	})
	if err := workflow.ExecuteActivity(ctx, PreFailureActivity).Get(ctx, nil); err != nil {
		return err
	}
	return errors.New("deliberate failure after scheduling activity")
}

func PreFailureActivity(ctx context.Context) error { return nil }

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

// failedExecutionStillYieldsEdges: a workflow schedules an activity and then
// deterministically fails. history.Build reads *_SCHEDULED events, not
// completion status, so the activityCall edge survives. StartSpec.ExpectError
// lets the harness drive the failure on purpose.
func failedExecutionStillYieldsEdges() Case {
	const tq = "r2-tq"
	wf := ExpectNode{Kind: graph.KindWorkflow, Name: "FailAfterActivityWorkflow"}
	act := ExpectNode{Kind: graph.KindActivity, Name: "PreFailureActivity"}
	return Case{
		Name: "failed-execution-still-yields-edges",
		Namespaces: []NamespaceSet{
			{
				Name: defaultNamespace,
				Workers: []WorkerSpec{
					{
						TaskQueue: tq,
						Register: func(w worker.Worker) {
							w.RegisterWorkflow(FailAfterActivityWorkflow)
							w.RegisterActivity(PreFailureActivity)
						},
					},
				},
				Starts: []StartSpec{
					{ID: "r2-wf-1", TaskQueue: tq, Workflow: FailAfterActivityWorkflow, ExpectError: true},
				},
			},
		},
		Expect: Expect{
			Nodes: []ExpectNode{wf, act},
			Edges: []ExpectEdge{{From: wf, To: act, Kind: graph.EdgeActivityCall}},
		},
	}
}
