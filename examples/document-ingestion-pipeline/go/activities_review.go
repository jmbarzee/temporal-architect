package pipeline

import (
	"context"

	"go.temporal.io/sdk/activity"
)

type ReviewActivities struct {
	Reviews ReviewRepo
}

func (a *ReviewActivities) CreateReviewTask(ctx context.Context, document Document, reviewType string, reviewContext any) (ReviewTask, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("CreateReviewTask", "documentID", document.ID, "reviewType", reviewType)
	return a.Reviews.CreateTask(ctx, document.ID, reviewType, 1)
}

func (a *ReviewActivities) RecordReviewerAction(ctx context.Context, task ReviewTask, action ReviewerAction) (ReviewResult, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("RecordReviewerAction", "taskID", task.ID, "decision", action.Decision)
	return a.Reviews.RecordAction(ctx, task.ID, action)
}

func (a *ReviewActivities) EscalateReviewTask(ctx context.Context, task ReviewTask) error {
	logger := activity.GetLogger(ctx)
	logger.Info("EscalateReviewTask", "taskID", task.ID)
	return a.Reviews.EscalateTask(ctx, task.ID)
}
