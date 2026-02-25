package pipeline

import "context"

// DocumentRepo manages document records and dedup lookups.
type DocumentRepo interface {
	Create(ctx context.Context, doc Document) error
	Get(ctx context.Context, id string) (Document, error)
	FindBatch(ctx context.Context, filter ReprocessFilter, cursor string) (DocumentBatch, error)
	LookupDuplicates(ctx context.Context, contentHash string, textHash uint64) (DeduplicationResult, error)
}

// ReviewRepo manages review task lifecycle.
type ReviewRepo interface {
	CreateTask(ctx context.Context, docID, reviewType string, priority int) (ReviewTask, error)
	RecordAction(ctx context.Context, taskID string, action ReviewerAction) (ReviewResult, error)
	EscalateTask(ctx context.Context, taskID string) error
}

// HoldRepo manages legal holds on documents.
type HoldRepo interface {
	Place(ctx context.Context, docID, holdID, reason string) error
	Release(ctx context.Context, docID, holdID string) error
	GetActive(ctx context.Context, docID string) (HoldStatus, error)
}

// BatchRepo manages batch records.
type BatchRepo interface {
	Acknowledge(ctx context.Context, batch Batch) (BatchRecord, error)
}
