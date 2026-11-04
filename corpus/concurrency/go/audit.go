package concurrency

import "go.temporal.io/sdk/workflow"

func Audit(ctx workflow.Context, items []string) (bool, error) {
	return len(items) > 0, nil
}
