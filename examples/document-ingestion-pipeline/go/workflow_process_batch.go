package pipeline

import (
	"time"

	"go.temporal.io/sdk/workflow"
)

func ProcessBatch(ctx workflow.Context, batch Batch) (BatchResult, error) {
	completedCount := 0

	err := workflow.SetQueryHandler(ctx, "GetBatchProgress", func() (BatchProgress, error) {
		return BatchProgress{Total: len(batch.Submissions), Completed: completedCount}, nil
	})
	if err != nil {
		return BatchResult{}, err
	}

	actCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 30 * time.Second,
	})
	var batchRecord BatchRecord
	err = workflow.ExecuteActivity(actCtx, "AcknowledgeBatch", batch).Get(actCtx, &batchRecord)
	if err != nil {
		return BatchResult{}, err
	}

	// Fan out: launch all child workflows
	futures := make([]workflow.ChildWorkflowFuture, len(batch.Submissions))
	for i, submission := range batch.Submissions {
		futures[i] = workflow.ExecuteChildWorkflow(ctx, ProcessDocument, submission)
	}

	// Await all results
	results := make([]ProcessingResult, len(futures))
	for i, f := range futures {
		err = f.Get(ctx, &results[i])
		if err != nil {
			return BatchResult{}, err
		}
		completedCount++
	}

	return BatchResult{BatchRecord: batchRecord, Results: results}, nil
}
