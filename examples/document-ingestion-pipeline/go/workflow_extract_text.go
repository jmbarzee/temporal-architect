package pipeline

import (
	"time"

	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"
)

func ExtractText(ctx workflow.Context, document NormalizedDocument) (TextExtractionResult, error) {
	// Start OCR job with retry
	startCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 30 * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts:    10,
			InitialInterval:    2 * time.Second,
			BackoffCoefficient: 2.0,
			MaximumInterval:    30 * time.Second,
		},
	})
	var ocrJobID string
	err := workflow.ExecuteActivity(startCtx, "StartOCRJob", document).Get(startCtx, &ocrJobID)
	if err != nil {
		return TextExtractionResult{}, err
	}

	// Poll for result with retry-based backoff
	pollCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout:    30 * time.Second,
		ScheduleToCloseTimeout: 10 * time.Minute,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts:    30,
			InitialInterval:    5 * time.Second,
			BackoffCoefficient: 1.5,
			MaximumInterval:    60 * time.Second,
		},
	})
	var ocrResult TextExtractionResult
	err = workflow.ExecuteActivity(pollCtx, "PollOCRResult", ocrJobID).Get(pollCtx, &ocrResult)
	if err != nil {
		return TextExtractionResult{}, err
	}

	return ocrResult, nil
}
