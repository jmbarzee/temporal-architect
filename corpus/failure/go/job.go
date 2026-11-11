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

// awaitAll waits for every future and returns at the first error, leaving the
// rest running.
func awaitAll(ctx workflow.Context, futures ...workflow.Future) error {
	var err error
	sel := workflow.NewSelector(ctx)
	for _, f := range futures {
		sel.AddFuture(f, func(f workflow.Future) { err = f.Get(ctx, nil) })
	}
	for range futures {
		sel.Select(ctx)
		if err != nil {
			return err
		}
	}
	return nil
}
