package pipeline

import (
	"time"

	"go.temporal.io/sdk/workflow"
)

func BulkReprocess(ctx workflow.Context, filter ReprocessFilter, cursor string, previouslyProcessed int) (ReprocessResult, error) {
	processedCount := previouslyProcessed

	err := workflow.SetQueryHandler(ctx, "GetProgress", func() (ReprocessProgress, error) {
		return ReprocessProgress{Filter: filter, Cursor: cursor, ProcessedCount: processedCount}, nil
	})
	if err != nil {
		return ReprocessResult{}, err
	}

	var a *PipelineActivities

	actCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 30 * time.Second,
	})

	var docBatch DocumentBatch
	err = workflow.ExecuteActivity(actCtx, a.FindDocumentBatch, filter, cursor).Get(actCtx, &docBatch)
	if err != nil {
		return ReprocessResult{}, err
	}

	if len(docBatch.Documents) == 0 {
		return ReprocessResult{Status: "complete", TotalProcessed: processedCount}, nil
	}

	// Fan out: launch child workflows for all documents
	futures := make([]workflow.ChildWorkflowFuture, len(docBatch.Documents))
	for i, doc := range docBatch.Documents {
		futures[i] = workflow.ExecuteChildWorkflow(ctx, ProcessDocument, doc.AsResubmission)
	}

	// Await all
	for _, f := range futures {
		var result ProcessingResult
		err = f.Get(ctx, &result)
		if err != nil {
			return ReprocessResult{}, err
		}
		processedCount++
	}

	// Continue as new with next cursor
	return ReprocessResult{}, workflow.NewContinueAsNewError(ctx, BulkReprocess, filter, docBatch.NextCursor, processedCount)
}
