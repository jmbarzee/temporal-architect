package failure

import (
	"time"

	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"
)

const (
	ProceedSignal = "Proceed"
	AttemptUpdate = "Attempt"
)

func Job(ctx workflow.Context, item string) error {
	proceeding := false

	if err := workflow.SetUpdateHandler(ctx, AttemptUpdate, func(ctx workflow.Context) error {
		return rejectAndProcess(ctx, item)
	}); err != nil {
		return err
	}
	proceedCh := workflow.GetSignalChannel(ctx, ProceedSignal)
	workflow.Go(ctx, func(gCtx workflow.Context) {
		for {
			proceedCh.Receive(gCtx, nil)
			proceeding = true
		}
	})

	if err := workflow.Await(ctx, func() bool { return proceeding }); err != nil {
		return err
	}
	return rejectAndProcess(ctx, item)
}

// rejectAndProcess is the design's await all over Reject and Process.
func rejectAndProcess(ctx workflow.Context, item string) error {
	ctx = workflow.WithActivityOptions(ctx, workflow.ActivityOptions{StartToCloseTimeout: time.Minute})
	rejectCtx := workflow.WithRetryPolicy(ctx, temporal.RetryPolicy{MaximumAttempts: 1})
	return awaitAll(ctx,
		workflow.ExecuteActivity(rejectCtx, Reject, item),
		workflow.ExecuteActivity(ctx, Process, item),
	)
}
