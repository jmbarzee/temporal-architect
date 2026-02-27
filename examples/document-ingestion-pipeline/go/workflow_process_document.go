package pipeline

import (
	"time"

	enumspb "go.temporal.io/api/enums/v1"
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"
)

func ProcessDocument(ctx workflow.Context, submission Submission) (ProcessingResult, error) {
	stage := "received"

	err := workflow.SetQueryHandler(ctx, "GetStatus", func() (DocumentStatus, error) {
		return DocumentStatus{Stage: stage}, nil
	})
	if err != nil {
		return ProcessingResult{}, err
	}

	var a *PipelineActivities

	defaultOpts := workflow.ActivityOptions{
		StartToCloseTimeout: 30 * time.Second,
	}
	ctx = workflow.WithActivityOptions(ctx, defaultOpts)

	// Ingest: persist raw bytes, create record
	ingestCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 2 * time.Minute,
	})
	var document Document
	err = workflow.ExecuteActivity(ingestCtx, a.IngestDocument, submission).Get(ingestCtx, &document)
	if err != nil {
		return ProcessingResult{}, err
	}
	stage = "scanning"

	// Malware scan
	scanCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 60 * time.Second,
	})
	var scanResult ScanResult
	err = workflow.ExecuteActivity(scanCtx, a.ScanMalware, document).Get(scanCtx, &scanResult)
	if err != nil {
		return ProcessingResult{}, err
	}
	if scanResult.Infected {
		_ = workflow.ExecuteActivity(ctx, a.QuarantineDocument, document, scanResult).Get(ctx, nil)
		return ProcessingResult{Document: document, Status: "quarantined"}, nil
	}

	// Normalize
	stage = "normalizing"
	normalizeCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 5 * time.Minute,
	})
	var normResult NormalizationResult
	err = workflow.ExecuteActivity(normalizeCtx, a.NormalizeDocument, document).Get(normalizeCtx, &normResult)
	if err != nil {
		return ProcessingResult{}, err
	}

	// Sub-documents enter pipeline independently (fire-and-forget)
	for _, subDoc := range normResult.SubDocuments {
		childCtx := workflow.WithChildOptions(ctx, workflow.ChildWorkflowOptions{
			ParentClosePolicy: enumspb.PARENT_CLOSE_POLICY_ABANDON,
		})
		childFuture := workflow.ExecuteChildWorkflow(childCtx, ProcessDocument, subDoc.AsSubmission)
		// Confirm child started — without this, child may never spawn if parent completes first
		if err := childFuture.GetChildWorkflowExecution().Get(ctx, nil); err != nil {
			return ProcessingResult{}, err
		}
	}

	// OCR / text extraction
	stage = "extracting_text"
	var textResult TextExtractionResult
	err = workflow.ExecuteChildWorkflow(ctx, ExtractText, normResult.NormalizedDoc).Get(ctx, &textResult)
	if err != nil {
		return ProcessingResult{}, err
	}

	// Classify
	stage = "classifying"
	var classification ClassificationResult
	err = workflow.ExecuteActivity(ctx, a.ClassifyDocument, normResult.NormalizedDoc, textResult).Get(ctx, &classification)
	if err != nil {
		return ProcessingResult{}, err
	}

	if classification.Confidence < 0.80 {
		stage = "awaiting_classification_review"
		reviewCtx := workflow.WithChildOptions(ctx, workflow.ChildWorkflowOptions{
			TaskQueue: "review",
		})
		var classReview ReviewResult
		err = workflow.ExecuteChildWorkflow(reviewCtx, HumanReview, document, "classification", classification).Get(reviewCtx, &classReview)
		if err != nil {
			return ProcessingResult{}, err
		}
		err = workflow.ExecuteActivity(ctx, a.ApplyClassificationReview, classification, classReview).Get(ctx, &classification)
		if err != nil {
			return ProcessingResult{}, err
		}
	}

	// Extract fields
	stage = "extracting_fields"
	var extraction ExtractionResult
	err = workflow.ExecuteActivity(ctx, a.ExtractFields, normResult.NormalizedDoc, textResult, classification).Get(ctx, &extraction)
	if err != nil {
		return ProcessingResult{}, err
	}

	if extraction.NeedsReview {
		stage = "awaiting_extraction_review"
		reviewCtx := workflow.WithChildOptions(ctx, workflow.ChildWorkflowOptions{
			TaskQueue: "review",
		})
		var extractReview ReviewResult
		err = workflow.ExecuteChildWorkflow(reviewCtx, HumanReview, document, "extraction", extraction).Get(reviewCtx, &extractReview)
		if err != nil {
			return ProcessingResult{}, err
		}
		err = workflow.ExecuteActivity(ctx, a.ApplyExtractionReview, extraction, extractReview).Get(ctx, &extraction)
		if err != nil {
			return ProcessingResult{}, err
		}
	}

	// Validate
	stage = "validating"
	var validation ValidationResult
	err = workflow.ExecuteActivity(ctx, a.ValidateExtraction, extraction, classification).Get(ctx, &validation)
	if err != nil {
		return ProcessingResult{}, err
	}

	if validation.HasFailures {
		stage = "awaiting_validation_review"
		reviewCtx := workflow.WithChildOptions(ctx, workflow.ChildWorkflowOptions{
			TaskQueue: "review",
		})
		var validReview ReviewResult
		err = workflow.ExecuteChildWorkflow(reviewCtx, HumanReview, document, "validation", validation).Get(reviewCtx, &validReview)
		if err != nil {
			return ProcessingResult{}, err
		}
		err = workflow.ExecuteActivity(ctx, a.ApplyValidationReview, validation, validReview).Get(ctx, &validation)
		if err != nil {
			return ProcessingResult{}, err
		}
	}

	// Deduplicate
	stage = "deduplicating"
	var dedupResult DeduplicationResult
	err = workflow.ExecuteActivity(ctx, a.CheckDuplicates, document, extraction).Get(ctx, &dedupResult)
	if err != nil {
		return ProcessingResult{}, err
	}

	if dedupResult.IsNearDuplicate {
		stage = "awaiting_dedup_review"
		reviewCtx := workflow.WithChildOptions(ctx, workflow.ChildWorkflowOptions{
			TaskQueue: "review",
		})
		var dedupReview ReviewResult
		err = workflow.ExecuteChildWorkflow(reviewCtx, HumanReview, document, "deduplication", dedupResult).Get(reviewCtx, &dedupReview)
		if err != nil {
			return ProcessingResult{}, err
		}
		err = workflow.ExecuteActivity(ctx, a.ApplyDedupReview, dedupResult, dedupReview).Get(ctx, &dedupResult)
		if err != nil {
			return ProcessingResult{}, err
		}
	}

	if dedupResult.Discard {
		stage = "completed"
		return ProcessingResult{Document: document, Status: "duplicate_discarded"}, nil
	}

	// Route to downstream systems
	stage = "routing"
	routeCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 2 * time.Minute,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts:    5,
			InitialInterval:    5 * time.Second,
			BackoffCoefficient: 2.0,
		},
	})
	var deliveryResult DeliveryResult
	err = workflow.ExecuteActivity(routeCtx, a.RouteDocument, document, extraction, classification).Get(routeCtx, &deliveryResult)
	if err != nil {
		return ProcessingResult{}, err
	}

	stage = "completed"
	return ProcessingResult{Document: document, DeliveryResult: &deliveryResult, Status: "completed"}, nil
}
