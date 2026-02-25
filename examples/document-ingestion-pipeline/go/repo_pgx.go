package pipeline

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// --- PgxDocumentRepo ---

type PgxDocumentRepo struct {
	Pool *pgxpool.Pool
}

func (r *PgxDocumentRepo) Init(ctx context.Context) error {
	_, err := r.Pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS documents (
			id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL,
			storage_key TEXT NOT NULL,
			content_hash TEXT NOT NULL,
			content_type TEXT NOT NULL,
			created_at TIMESTAMPTZ DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_documents_content_hash ON documents(content_hash);
	`)
	return err
}

func (r *PgxDocumentRepo) Create(ctx context.Context, doc Document) error {
	_, err := r.Pool.Exec(ctx,
		`INSERT INTO documents (id, tenant_id, storage_key, content_hash, content_type) VALUES ($1, $2, $3, $4, $5)`,
		doc.ID, doc.TenantID, doc.StorageKey, doc.ContentHash, doc.ContentType,
	)
	return err
}

func (r *PgxDocumentRepo) Get(ctx context.Context, id string) (Document, error) {
	var doc Document
	err := r.Pool.QueryRow(ctx,
		`SELECT id, tenant_id, storage_key, content_hash, content_type FROM documents WHERE id = $1`, id,
	).Scan(&doc.ID, &doc.TenantID, &doc.StorageKey, &doc.ContentHash, &doc.ContentType)
	if err == pgx.ErrNoRows {
		return Document{}, fmt.Errorf("document %s not found", id)
	}
	return doc, err
}

func (r *PgxDocumentRepo) FindBatch(ctx context.Context, filter ReprocessFilter, cursor string) (DocumentBatch, error) {
	query := `SELECT id, tenant_id, storage_key, content_hash, content_type FROM documents WHERE 1=1`
	args := []any{}
	argIdx := 1

	if filter.DocumentType != "" {
		query += fmt.Sprintf(" AND content_type = $%d", argIdx)
		args = append(args, filter.DocumentType)
		argIdx++
	}
	if filter.Status != "" {
		// Status would require a status column — simplified here
		_ = filter.Status
	}
	if !filter.After.IsZero() {
		query += fmt.Sprintf(" AND created_at > $%d", argIdx)
		args = append(args, filter.After)
		argIdx++
	}
	if !filter.Before.IsZero() {
		query += fmt.Sprintf(" AND created_at < $%d", argIdx)
		args = append(args, filter.Before)
		argIdx++
	}
	if cursor != "" {
		query += fmt.Sprintf(" AND id > $%d", argIdx)
		args = append(args, cursor)
		argIdx++
	}
	query += " ORDER BY id LIMIT 100"

	rows, err := r.Pool.Query(ctx, query, args...)
	if err != nil {
		return DocumentBatch{}, err
	}
	defer rows.Close()

	var refs []DocumentRef
	var lastID string
	for rows.Next() {
		var doc Document
		if err := rows.Scan(&doc.ID, &doc.TenantID, &doc.StorageKey, &doc.ContentHash, &doc.ContentType); err != nil {
			return DocumentBatch{}, err
		}
		lastID = doc.ID
		refs = append(refs, DocumentRef{
			ID: doc.ID,
			AsResubmission: Submission{
				ID:          doc.ID,
				TenantID:    doc.TenantID,
				ContentType: doc.ContentType,
			},
		})
	}

	var nextCursor string
	if len(refs) == 100 {
		nextCursor = lastID
	}

	return DocumentBatch{Documents: refs, NextCursor: nextCursor}, nil
}

func (r *PgxDocumentRepo) LookupDuplicates(ctx context.Context, contentHash string, textHash uint64) (DeduplicationResult, error) {
	var matchedID string
	err := r.Pool.QueryRow(ctx,
		`SELECT id FROM documents WHERE content_hash = $1 LIMIT 1`, contentHash,
	).Scan(&matchedID)
	if err == pgx.ErrNoRows {
		return DeduplicationResult{}, nil
	}
	if err != nil {
		return DeduplicationResult{}, err
	}
	return DeduplicationResult{
		IsNearDuplicate:   true,
		MatchedDocumentID: matchedID,
		Similarity:        1.0,
	}, nil
}

// --- PgxReviewRepo ---

type PgxReviewRepo struct {
	Pool *pgxpool.Pool
}

func (r *PgxReviewRepo) Init(ctx context.Context) error {
	_, err := r.Pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS review_tasks (
			id TEXT PRIMARY KEY,
			document_id TEXT NOT NULL,
			review_type TEXT NOT NULL,
			status TEXT NOT NULL DEFAULT 'pending',
			priority INT NOT NULL DEFAULT 1,
			created_at TIMESTAMPTZ DEFAULT NOW()
		);
	`)
	return err
}

func (r *PgxReviewRepo) CreateTask(ctx context.Context, docID, reviewType string, priority int) (ReviewTask, error) {
	id := fmt.Sprintf("review-%s-%s", docID, reviewType)
	_, err := r.Pool.Exec(ctx,
		`INSERT INTO review_tasks (id, document_id, review_type, priority) VALUES ($1, $2, $3, $4)`,
		id, docID, reviewType, priority,
	)
	if err != nil {
		return ReviewTask{}, err
	}
	return ReviewTask{
		ID:         id,
		DocumentID: docID,
		ReviewType: reviewType,
		Status:     "pending",
		Priority:   priority,
	}, nil
}

func (r *PgxReviewRepo) RecordAction(ctx context.Context, taskID string, action ReviewerAction) (ReviewResult, error) {
	var reviewType string
	err := r.Pool.QueryRow(ctx,
		`UPDATE review_tasks SET status = 'completed' WHERE id = $1 RETURNING review_type`, taskID,
	).Scan(&reviewType)
	if err != nil {
		return ReviewResult{}, fmt.Errorf("record action: %w", err)
	}
	return ReviewResult{
		ReviewType:  reviewType,
		Decision:    action.Decision,
		Corrections: action.Corrections,
	}, nil
}

func (r *PgxReviewRepo) EscalateTask(ctx context.Context, taskID string) error {
	_, err := r.Pool.Exec(ctx,
		`UPDATE review_tasks SET status = 'escalated', priority = priority + 1 WHERE id = $1`, taskID,
	)
	return err
}

// --- PgxHoldRepo ---

type PgxHoldRepo struct {
	Pool *pgxpool.Pool
}

func (r *PgxHoldRepo) Init(ctx context.Context) error {
	_, err := r.Pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS legal_holds (
			document_id TEXT NOT NULL,
			hold_id TEXT NOT NULL,
			reason TEXT NOT NULL,
			created_at TIMESTAMPTZ DEFAULT NOW(),
			PRIMARY KEY (document_id, hold_id)
		);
	`)
	return err
}

func (r *PgxHoldRepo) Place(ctx context.Context, docID, holdID, reason string) error {
	_, err := r.Pool.Exec(ctx,
		`INSERT INTO legal_holds (document_id, hold_id, reason) VALUES ($1, $2, $3)
		 ON CONFLICT (document_id, hold_id) DO NOTHING`,
		docID, holdID, reason,
	)
	return err
}

func (r *PgxHoldRepo) Release(ctx context.Context, docID, holdID string) error {
	_, err := r.Pool.Exec(ctx,
		`DELETE FROM legal_holds WHERE document_id = $1 AND hold_id = $2`, docID, holdID,
	)
	return err
}

func (r *PgxHoldRepo) GetActive(ctx context.Context, docID string) (HoldStatus, error) {
	rows, err := r.Pool.Query(ctx,
		`SELECT hold_id FROM legal_holds WHERE document_id = $1`, docID,
	)
	if err != nil {
		return HoldStatus{}, err
	}
	defer rows.Close()

	var holds []string
	for rows.Next() {
		var holdID string
		if err := rows.Scan(&holdID); err != nil {
			return HoldStatus{}, err
		}
		holds = append(holds, holdID)
	}
	return HoldStatus{
		IsHeld:      len(holds) > 0,
		ActiveHolds: holds,
	}, nil
}

// --- PgxBatchRepo ---

type PgxBatchRepo struct {
	Pool *pgxpool.Pool
}

func (r *PgxBatchRepo) Init(ctx context.Context) error {
	_, err := r.Pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS batch_records (
			id TEXT PRIMARY KEY,
			batch_id TEXT NOT NULL,
			submission_count INT NOT NULL,
			created_at TIMESTAMPTZ DEFAULT NOW()
		);
	`)
	return err
}

func (r *PgxBatchRepo) Acknowledge(ctx context.Context, batch Batch) (BatchRecord, error) {
	id := fmt.Sprintf("batch-record-%s", batch.ID)
	_, err := r.Pool.Exec(ctx,
		`INSERT INTO batch_records (id, batch_id, submission_count) VALUES ($1, $2, $3)`,
		id, batch.ID, len(batch.Submissions),
	)
	if err != nil {
		return BatchRecord{}, err
	}
	return BatchRecord{ID: id, BatchID: batch.ID}, nil
}
