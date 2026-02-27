package pipeline

import (
	"fmt"
	"time"

	"go.temporal.io/sdk/workflow"
)

func HumanReview(ctx workflow.Context, document Document, reviewType string, reviewContext any) (ReviewResult, error) {
	var a *ReviewActivities
	reviewCompleted := false
	var reviewResult ReviewResult
	var task ReviewTask
	taskReady := false

	err := workflow.SetQueryHandler(ctx, "GetReviewStatus", func() (ReviewStatus, error) {
		return ReviewStatus{ReviewType: reviewType, Status: "awaiting_review"}, nil
	})
	if err != nil {
		return ReviewResult{}, err
	}

	// Single update handler registration with validator to reject early updates
	err = workflow.SetUpdateHandlerWithOptions(ctx, "SubmitReview",
		func(ctx workflow.Context, action ReviewerAction) (ReviewAck, error) {
			actCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
				StartToCloseTimeout: 30 * time.Second,
			})
			var result ReviewResult
			err := workflow.ExecuteActivity(actCtx, a.RecordReviewerAction, task, action).Get(actCtx, &result)
			if err != nil {
				return ReviewAck{}, err
			}
			reviewResult = result
			reviewCompleted = true
			return ReviewAck{Accepted: true}, nil
		},
		workflow.UpdateHandlerOptions{
			Validator: func(ctx workflow.Context, action ReviewerAction) error {
				if !taskReady {
					return fmt.Errorf("review task not yet created")
				}
				return nil
			},
		},
	)
	if err != nil {
		return ReviewResult{}, err
	}

	// Create the review task
	actCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 30 * time.Second,
	})
	err = workflow.ExecuteActivity(actCtx, a.CreateReviewTask, document, reviewType, reviewContext).Get(actCtx, &task)
	if err != nil {
		return ReviewResult{}, err
	}
	taskReady = true

	// Await one: review completed OR 48h escalation timer
	timerCtx, cancelTimer := workflow.WithCancel(ctx)

	selector := workflow.NewSelector(ctx)

	// Condition: review completed — use workflow.Await, not Sleep polling
	condCh := workflow.NewChannel(ctx)
	workflow.Go(ctx, func(gCtx workflow.Context) {
		if err := workflow.Await(gCtx, func() bool { return reviewCompleted }); err != nil {
			return // context cancelled
		}
		condCh.Send(gCtx, true)
	})
	selector.AddReceive(condCh, func(ch workflow.ReceiveChannel, more bool) {
		var v bool
		ch.Receive(ctx, &v)
		cancelTimer() // Cancel the losing timer
	})

	// Timer: 48h escalation
	timerFired := false
	timerFuture := workflow.NewTimer(timerCtx, 48*time.Hour)
	selector.AddFuture(timerFuture, func(f workflow.Future) {
		if err := f.Get(timerCtx, nil); err != nil {
			// Timer cancelled — review won the race
			return
		}
		timerFired = true
	})

	selector.Select(ctx)

	if timerFired && !reviewCompleted {
		// Escalate and wait for review
		_ = workflow.ExecuteActivity(actCtx, a.EscalateReviewTask, task).Get(actCtx, nil)

		// Wait for review to complete after escalation
		_ = workflow.Await(ctx, func() bool { return reviewCompleted })
	}

	return reviewResult, nil
}
