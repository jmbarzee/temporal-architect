package pipeline

import (
	"time"

	"go.temporal.io/sdk/workflow"
)

func HumanReview(ctx workflow.Context, document Document, reviewType string, reviewContext any) (ReviewResult, error) {
	reviewCompleted := false
	var reviewResult ReviewResult

	err := workflow.SetQueryHandler(ctx, "GetReviewStatus", func() (ReviewStatus, error) {
		return ReviewStatus{ReviewType: reviewType, Status: "awaiting_review"}, nil
	})
	if err != nil {
		return ReviewResult{}, err
	}

	// Update handler: SubmitReview
	err = workflow.SetUpdateHandlerWithOptions(ctx, "SubmitReview",
		func(ctx workflow.Context, action ReviewerAction) (ReviewAck, error) {
			actCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
				StartToCloseTimeout: 30 * time.Second,
			})
			var task ReviewTask
			// task is captured from the activity below via closure — but we need
			// to handle the case where the update arrives. We use the outer task variable.
			_ = task // task is set after CreateReviewTask below
			var result ReviewResult
			err := workflow.ExecuteActivity(actCtx, "RecordReviewerAction", task, action).Get(actCtx, &result)
			if err != nil {
				return ReviewAck{}, err
			}
			reviewResult = result
			reviewCompleted = true
			return ReviewAck{Accepted: true}, nil
		},
		workflow.UpdateHandlerOptions{},
	)
	if err != nil {
		return ReviewResult{}, err
	}

	// Create the review task
	actCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 30 * time.Second,
	})
	var task ReviewTask
	err = workflow.ExecuteActivity(actCtx, "CreateReviewTask", document, reviewType, reviewContext).Get(actCtx, &task)
	if err != nil {
		return ReviewResult{}, err
	}

	// Re-register the update handler now that we have the task
	err = workflow.SetUpdateHandlerWithOptions(ctx, "SubmitReview",
		func(ctx workflow.Context, action ReviewerAction) (ReviewAck, error) {
			innerActCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
				StartToCloseTimeout: 30 * time.Second,
			})
			var result ReviewResult
			err := workflow.ExecuteActivity(innerActCtx, "RecordReviewerAction", task, action).Get(innerActCtx, &result)
			if err != nil {
				return ReviewAck{}, err
			}
			reviewResult = result
			reviewCompleted = true
			return ReviewAck{Accepted: true}, nil
		},
		workflow.UpdateHandlerOptions{},
	)
	if err != nil {
		return ReviewResult{}, err
	}

	// Await one: review completed OR 48h escalation timer
	selector := workflow.NewSelector(ctx)

	// Condition: review completed
	condCh := workflow.NewChannel(ctx)
	workflow.Go(ctx, func(gCtx workflow.Context) {
		for !reviewCompleted {
			_ = workflow.Sleep(gCtx, 1*time.Second)
		}
		condCh.Send(gCtx, true)
	})
	selector.AddReceive(condCh, func(ch workflow.ReceiveChannel, more bool) {
		var v bool
		ch.Receive(ctx, &v)
	})

	// Timer: 48h escalation
	timerFired := false
	timer := workflow.NewTimer(ctx, 48*time.Hour)
	selector.AddFuture(timer, func(f workflow.Future) {
		timerFired = true
	})

	selector.Select(ctx)

	if timerFired && !reviewCompleted {
		// Escalate and wait for review
		_ = workflow.ExecuteActivity(actCtx, "EscalateReviewTask", task).Get(actCtx, nil)

		// Wait for review to complete after escalation
		for !reviewCompleted {
			_ = workflow.Sleep(ctx, 1*time.Second)
		}
	}

	return reviewResult, nil
}
