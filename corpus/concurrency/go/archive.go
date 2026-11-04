package concurrency

import (
	"time"

	"go.temporal.io/sdk/workflow"
)

func Archive(ctx workflow.Context, items []string) error {
	ctx = workflow.WithActivityOptions(ctx, workflow.ActivityOptions{StartToCloseTimeout: time.Minute})
	return workflow.ExecuteActivity(ctx, Store, items).Get(ctx, nil)
}
