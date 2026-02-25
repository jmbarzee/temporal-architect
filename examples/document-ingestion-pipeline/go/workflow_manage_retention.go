package pipeline

import (
	"time"

	"go.temporal.io/sdk/workflow"
)

func ManageRetention(ctx workflow.Context, document Document, policy RetentionPolicy) (RetentionResult, error) {
	actCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 30 * time.Second,
	})

	// Signal handlers for legal hold management
	placeCh := workflow.GetSignalChannel(ctx, "PlaceLegalHold")
	releaseCh := workflow.GetSignalChannel(ctx, "ReleaseLegalHold")

	// Process PlaceLegalHold signals in background
	workflow.Go(ctx, func(gCtx workflow.Context) {
		for {
			var signal struct {
				HoldID string
				Reason string
			}
			placeCh.Receive(gCtx, &signal)
			innerActCtx := workflow.WithActivityOptions(gCtx, workflow.ActivityOptions{
				StartToCloseTimeout: 30 * time.Second,
			})
			_ = workflow.ExecuteActivity(innerActCtx, "RecordLegalHold", document, signal.HoldID, signal.Reason).Get(innerActCtx, nil)
		}
	})

	// Process ReleaseLegalHold signals in background
	workflow.Go(ctx, func(gCtx workflow.Context) {
		for {
			var signal struct {
				HoldID string
			}
			releaseCh.Receive(gCtx, &signal)
			innerActCtx := workflow.WithActivityOptions(gCtx, workflow.ActivityOptions{
				StartToCloseTimeout: 30 * time.Second,
			})
			_ = workflow.ExecuteActivity(innerActCtx, "RemoveLegalHold", document, signal.HoldID).Get(innerActCtx, nil)
		}
	})

	// Sleep until retention period expires
	err := workflow.Sleep(ctx, policy.RetentionDuration)
	if err != nil {
		return RetentionResult{}, err
	}

	// Check for legal holds
	var holdStatus HoldStatus
	err = workflow.ExecuteActivity(actCtx, "CheckLegalHolds", document).Get(actCtx, &holdStatus)
	if err != nil {
		return RetentionResult{}, err
	}

	// If held, wait for all holds to be released
	if holdStatus.IsHeld {
		for {
			// Wait for a ReleaseLegalHold signal
			var signal struct {
				HoldID string
			}
			releaseCh.Receive(ctx, &signal)
			releaseActCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
				StartToCloseTimeout: 30 * time.Second,
			})
			_ = workflow.ExecuteActivity(releaseActCtx, "RemoveLegalHold", document, signal.HoldID).Get(releaseActCtx, nil)

			// Re-check holds
			err = workflow.ExecuteActivity(actCtx, "CheckLegalHolds", document).Get(actCtx, &holdStatus)
			if err != nil {
				return RetentionResult{}, err
			}
			if !holdStatus.IsHeld {
				break
			}
		}
	}

	// Purge the document
	err = workflow.ExecuteActivity(actCtx, "PurgeDocument", document).Get(actCtx, nil)
	if err != nil {
		return RetentionResult{}, err
	}

	return RetentionResult{Status: "purged"}, nil
}
