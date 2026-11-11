package failure

import "go.temporal.io/sdk/workflow"

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
