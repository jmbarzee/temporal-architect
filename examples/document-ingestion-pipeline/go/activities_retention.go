package pipeline

import (
	"context"
	"fmt"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"go.temporal.io/sdk/activity"
)

type RetentionActivities struct {
	S3        S3API
	Holds     HoldRepo
	Documents DocumentRepo
	Bucket    string
}

func (a *RetentionActivities) RecordLegalHold(ctx context.Context, document Document, holdID, reason string) error {
	logger := activity.GetLogger(ctx)
	logger.Info("RecordLegalHold", "documentID", document.ID, "holdID", holdID)
	return a.Holds.Place(ctx, document.ID, holdID, reason)
}

func (a *RetentionActivities) RemoveLegalHold(ctx context.Context, document Document, holdID string) error {
	logger := activity.GetLogger(ctx)
	logger.Info("RemoveLegalHold", "documentID", document.ID, "holdID", holdID)
	return a.Holds.Release(ctx, document.ID, holdID)
}

func (a *RetentionActivities) CheckLegalHolds(ctx context.Context, document Document) (HoldStatus, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("CheckLegalHolds", "documentID", document.ID)
	return a.Holds.GetActive(ctx, document.ID)
}

func (a *RetentionActivities) PurgeDocument(ctx context.Context, document Document) error {
	logger := activity.GetLogger(ctx)
	logger.Info("PurgeDocument", "documentID", document.ID)

	// Verify no active holds
	holdStatus, err := a.Holds.GetActive(ctx, document.ID)
	if err != nil {
		return fmt.Errorf("check holds: %w", err)
	}
	if holdStatus.IsHeld {
		return fmt.Errorf("cannot purge document %s: active legal holds exist", document.ID)
	}

	// Delete from S3
	_, err = a.S3.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(a.Bucket),
		Key:    aws.String(document.StorageKey),
	})
	if err != nil {
		return fmt.Errorf("s3 delete: %w", err)
	}

	return nil
}
