package pipeline

import (
	"time"

	"go.temporal.io/sdk/workflow"
)

func ManageRetention(ctx workflow.Context, document Document, policy RetentionPolicy) (RetentionResult, error) {
	var a *RetentionActivities
	logger := workflow.GetLogger(ctx)
	actCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 30 * time.Second,
	})

	// Signal handlers for legal hold management
	placeCh := workflow.GetSignalChannel(ctx, "PlaceLegalHold")
	releaseCh := workflow.GetSignalChannel(ctx, "ReleaseLegalHold")

	// Background goroutines use cancellable context so we can stop them
	// before the main goroutine needs to read from releaseCh directly.
	bgCtx, cancelBg := workflow.WithCancel(ctx)

	// Process PlaceLegalHold signals in background
	workflow.Go(bgCtx, func(gCtx workflow.Context) {
		for {
			var signal struct {
				HoldID string
				Reason string
			}
			placeCh.Receive(gCtx, &signal)
			innerActCtx := workflow.WithActivityOptions(gCtx, workflow.ActivityOptions{
				StartToCloseTimeout: 30 * time.Second,
			})
			if err := workflow.ExecuteActivity(innerActCtx, a.RecordLegalHold, document, signal.HoldID, signal.Reason).Get(innerActCtx, nil); err != nil {
				logger.Error("RecordLegalHold failed", "holdID", signal.HoldID, "error", err)
			}
		}
	})

	// Process ReleaseLegalHold signals in background
	workflow.Go(bgCtx, func(gCtx workflow.Context) {
		for {
			var signal struct {
				HoldID string
			}
			releaseCh.Receive(gCtx, &signal)
			innerActCtx := workflow.WithActivityOptions(gCtx, workflow.ActivityOptions{
				StartToCloseTimeout: 30 * time.Second,
			})
			if err := workflow.ExecuteActivity(innerActCtx, a.RemoveLegalHold, document, signal.HoldID).Get(innerActCtx, nil); err != nil {
				logger.Error("RemoveLegalHold failed", "holdID", signal.HoldID, "error", err)
			}
		}
	})

	// Sleep until retention period expires
	err := workflow.Sleep(ctx, policy.RetentionDuration)
	if err != nil {
		return RetentionResult{}, err
	}

	// Check for legal holds
	var holdStatus HoldStatus
	err = workflow.ExecuteActivity(actCtx, a.CheckLegalHolds, document).Get(actCtx, &holdStatus)
	if err != nil {
		return RetentionResult{}, err
	}

	// If held, stop background release handler and take over signal processing
	// on the main goroutine to avoid dual-receiver race on releaseCh.
	if holdStatus.IsHeld {
		cancelBg()

		for {
			// Wait for a ReleaseLegalHold signal
			var signal struct {
				HoldID string
			}
			releaseCh.Receive(ctx, &signal)
			releaseActCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
				StartToCloseTimeout: 30 * time.Second,
			})
			if err := workflow.ExecuteActivity(releaseActCtx, a.RemoveLegalHold, document, signal.HoldID).Get(releaseActCtx, nil); err != nil {
				logger.Error("RemoveLegalHold failed", "holdID", signal.HoldID, "error", err)
			}

			// Re-check holds
			err = workflow.ExecuteActivity(actCtx, a.CheckLegalHolds, document).Get(actCtx, &holdStatus)
			if err != nil {
				return RetentionResult{}, err
			}
			if !holdStatus.IsHeld {
				break
			}
		}
	}

	// Purge the document
	err = workflow.ExecuteActivity(actCtx, a.PurgeDocument, document).Get(actCtx, nil)
	if err != nil {
		return RetentionResult{}, err
	}

	return RetentionResult{Status: "purged"}, nil
}
