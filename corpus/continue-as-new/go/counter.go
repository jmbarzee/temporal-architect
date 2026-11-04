package continueasnew

import (
	"context"
	"time"

	"go.temporal.io/sdk/workflow"
)

func Counter(ctx workflow.Context, count, limit int) (int, error) {
	ctx = workflow.WithActivityOptions(ctx, workflow.ActivityOptions{StartToCloseTimeout: time.Minute})
	if err := workflow.Sleep(ctx, time.Minute); err != nil {
		return 0, err
	}
	var next int
	if err := workflow.ExecuteActivity(ctx, Increment, count).Get(ctx, &next); err != nil {
		return 0, err
	}
	if next >= limit {
		return next, nil
	}
	return 0, workflow.NewContinueAsNewError(ctx, Counter, next, limit)
}

func Increment(ctx context.Context, count int) (int, error) {
	return count + 1, nil
}
