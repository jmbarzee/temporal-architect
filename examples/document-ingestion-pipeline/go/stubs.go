package pipeline

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	s3Types "github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/aws/aws-sdk-go-v2/service/textract"
	textractTypes "github.com/aws/aws-sdk-go-v2/service/textract/types"
	clamd "github.com/dutchcoders/go-clamd"
)

// --- StubS3 ---

type StubS3 struct {
	mu      sync.Mutex
	objects map[string][]byte
}

func NewStubS3() *StubS3 {
	return &StubS3{objects: make(map[string][]byte)}
}

func (s *StubS3) PutObject(_ context.Context, params *s3.PutObjectInput, _ ...func(*s3.Options)) (*s3.PutObjectOutput, error) {
	log.Printf("[stub-s3] PutObject bucket=%s key=%s", aws.ToString(params.Bucket), aws.ToString(params.Key))
	s.mu.Lock()
	defer s.mu.Unlock()
	data, _ := io.ReadAll(params.Body)
	s.objects[aws.ToString(params.Key)] = data
	return &s3.PutObjectOutput{}, nil
}

func (s *StubS3) GetObject(_ context.Context, params *s3.GetObjectInput, _ ...func(*s3.Options)) (*s3.GetObjectOutput, error) {
	log.Printf("[stub-s3] GetObject bucket=%s key=%s", aws.ToString(params.Bucket), aws.ToString(params.Key))
	s.mu.Lock()
	defer s.mu.Unlock()
	data, ok := s.objects[aws.ToString(params.Key)]
	if !ok {
		return nil, &s3Types.NoSuchKey{}
	}
	return &s3.GetObjectOutput{
		Body:          io.NopCloser(bytes.NewReader(data)),
		ContentLength: aws.Int64(int64(len(data))),
	}, nil
}

func (s *StubS3) CopyObject(_ context.Context, params *s3.CopyObjectInput, _ ...func(*s3.Options)) (*s3.CopyObjectOutput, error) {
	log.Printf("[stub-s3] CopyObject src=%s dst=%s", aws.ToString(params.CopySource), aws.ToString(params.Key))
	s.mu.Lock()
	defer s.mu.Unlock()
	// Extract source key from "bucket/key" format
	src := aws.ToString(params.CopySource)
	if idx := strings.Index(src, "/"); idx >= 0 {
		src = src[idx+1:]
	}
	if data, ok := s.objects[src]; ok {
		s.objects[aws.ToString(params.Key)] = data
	}
	return &s3.CopyObjectOutput{}, nil
}

func (s *StubS3) DeleteObject(_ context.Context, params *s3.DeleteObjectInput, _ ...func(*s3.Options)) (*s3.DeleteObjectOutput, error) {
	log.Printf("[stub-s3] DeleteObject bucket=%s key=%s", aws.ToString(params.Bucket), aws.ToString(params.Key))
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.objects, aws.ToString(params.Key))
	return &s3.DeleteObjectOutput{}, nil
}

// --- StubTextract ---

type StubTextract struct{}

func (s *StubTextract) StartDocumentAnalysis(_ context.Context, params *textract.StartDocumentAnalysisInput, _ ...func(*textract.Options)) (*textract.StartDocumentAnalysisOutput, error) {
	key := ""
	if params.DocumentLocation != nil && params.DocumentLocation.S3Object != nil {
		key = aws.ToString(params.DocumentLocation.S3Object.Name)
	}
	log.Printf("[stub-textract] StartDocumentAnalysis key=%s", key)
	return &textract.StartDocumentAnalysisOutput{
		JobId: aws.String("stub-job-001"),
	}, nil
}

func (s *StubTextract) GetDocumentAnalysis(_ context.Context, params *textract.GetDocumentAnalysisInput, _ ...func(*textract.Options)) (*textract.GetDocumentAnalysisOutput, error) {
	log.Printf("[stub-textract] GetDocumentAnalysis jobId=%s", aws.ToString(params.JobId))
	confidence := float32(99.5)
	page := int32(1)
	return &textract.GetDocumentAnalysisOutput{
		JobStatus: textractTypes.JobStatusSucceeded,
		Blocks: []textractTypes.Block{
			{
				BlockType:  textractTypes.BlockTypeLine,
				Text:       aws.String("Sample extracted text from document page 1."),
				Confidence: &confidence,
				Page:       &page,
			},
		},
	}, nil
}

// --- StubClamAV ---

type StubClamAV struct{}

func (s *StubClamAV) ScanStream(r io.Reader, _ chan bool) (chan *clamd.ScanResult, error) {
	log.Printf("[stub-clamav] ScanStream")
	_, _ = io.ReadAll(r)
	ch := make(chan *clamd.ScanResult, 1)
	ch <- &clamd.ScanResult{
		Status: clamd.RES_OK,
		Raw:    "stub-scanner-v1",
	}
	return ch, nil
}

// --- StubHTTP ---

type StubHTTP struct{}

func (s *StubHTTP) Do(req *http.Request) (*http.Response, error) {
	log.Printf("[stub-http] %s %s", req.Method, req.URL.String())

	var body []byte
	switch {
	case strings.HasSuffix(req.URL.Path, "/classify"):
		body, _ = json.Marshal(ClassificationResult{
			DocumentType: "invoice",
			Confidence:   0.95,
			Predictions: []Prediction{
				{DocumentType: "invoice", Confidence: 0.95},
				{DocumentType: "receipt", Confidence: 0.03},
			},
		})
	case strings.HasSuffix(req.URL.Path, "/extract"):
		body, _ = json.Marshal(ExtractionResult{
			Fields: []ExtractedField{
				{Name: "vendor", Value: "Acme Corp", Confidence: 0.98},
				{Name: "amount", Value: "1234.56", Confidence: 0.92},
				{Name: "date", Value: "2024-01-15", Confidence: 0.97},
			},
			NeedsReview: false,
		})
	default:
		body = []byte(`{"status":"ok"}`)
	}

	return &http.Response{
		StatusCode: 200,
		Body:       io.NopCloser(bytes.NewReader(body)),
		Header:     http.Header{"Content-Type": []string{"application/json"}},
	}, nil
}

// --- StubSFTP ---

type StubSFTP struct{}

func (s *StubSFTP) MkdirAll(path string) error {
	log.Printf("[stub-sftp] MkdirAll %s", path)
	return nil
}

func (s *StubSFTP) Create(path string) (io.WriteCloser, error) {
	log.Printf("[stub-sftp] Create %s", path)
	return &discardWriteCloser{}, nil
}

type discardWriteCloser struct{}

func (d *discardWriteCloser) Write(p []byte) (int, error) { return len(p), nil }
func (d *discardWriteCloser) Close() error                { return nil }

// --- StubDocumentRepo ---

type StubDocumentRepo struct {
	mu   sync.Mutex
	docs map[string]Document
}

func NewStubDocumentRepo() *StubDocumentRepo {
	return &StubDocumentRepo{docs: make(map[string]Document)}
}

func (r *StubDocumentRepo) Create(_ context.Context, doc Document) error {
	log.Printf("[stub-doc-repo] Create id=%s", doc.ID)
	r.mu.Lock()
	defer r.mu.Unlock()
	r.docs[doc.ID] = doc
	return nil
}

func (r *StubDocumentRepo) Get(_ context.Context, id string) (Document, error) {
	log.Printf("[stub-doc-repo] Get id=%s", id)
	r.mu.Lock()
	defer r.mu.Unlock()
	doc, ok := r.docs[id]
	if !ok {
		return Document{}, fmt.Errorf("document %s not found", id)
	}
	return doc, nil
}

func (r *StubDocumentRepo) FindBatch(_ context.Context, filter ReprocessFilter, cursor string) (DocumentBatch, error) {
	log.Printf("[stub-doc-repo] FindBatch type=%s cursor=%s", filter.DocumentType, cursor)
	r.mu.Lock()
	defer r.mu.Unlock()

	if cursor != "" {
		return DocumentBatch{}, nil
	}

	var refs []DocumentRef
	for _, doc := range r.docs {
		if filter.DocumentType != "" && doc.ContentType != filter.DocumentType {
			continue
		}
		refs = append(refs, DocumentRef{
			ID: doc.ID,
			AsResubmission: Submission{
				ID:          doc.ID,
				TenantID:    doc.TenantID,
				ContentType: doc.ContentType,
			},
		})
	}
	return DocumentBatch{Documents: refs}, nil
}

func (r *StubDocumentRepo) LookupDuplicates(_ context.Context, contentHash string, textHash uint64) (DeduplicationResult, error) {
	log.Printf("[stub-doc-repo] LookupDuplicates hash=%s textHash=%d", contentHash, textHash)
	return DeduplicationResult{}, nil
}

// --- StubReviewRepo ---

type StubReviewRepo struct {
	mu    sync.Mutex
	tasks map[string]ReviewTask
	seq   int
}

func NewStubReviewRepo() *StubReviewRepo {
	return &StubReviewRepo{tasks: make(map[string]ReviewTask)}
}

func (r *StubReviewRepo) CreateTask(_ context.Context, docID, reviewType string, priority int) (ReviewTask, error) {
	log.Printf("[stub-review-repo] CreateTask doc=%s type=%s", docID, reviewType)
	r.mu.Lock()
	defer r.mu.Unlock()
	r.seq++
	task := ReviewTask{
		ID:         fmt.Sprintf("review-%d", r.seq),
		DocumentID: docID,
		ReviewType: reviewType,
		Status:     "pending",
		Priority:   priority,
	}
	r.tasks[task.ID] = task
	return task, nil
}

func (r *StubReviewRepo) RecordAction(_ context.Context, taskID string, action ReviewerAction) (ReviewResult, error) {
	log.Printf("[stub-review-repo] RecordAction task=%s decision=%s", taskID, action.Decision)
	r.mu.Lock()
	defer r.mu.Unlock()
	task, ok := r.tasks[taskID]
	if !ok {
		return ReviewResult{}, fmt.Errorf("task %s not found", taskID)
	}
	task.Status = "completed"
	r.tasks[taskID] = task
	return ReviewResult{
		ReviewType:  task.ReviewType,
		Decision:    action.Decision,
		Corrections: action.Corrections,
	}, nil
}

func (r *StubReviewRepo) EscalateTask(_ context.Context, taskID string) error {
	log.Printf("[stub-review-repo] EscalateTask task=%s", taskID)
	r.mu.Lock()
	defer r.mu.Unlock()
	task, ok := r.tasks[taskID]
	if !ok {
		return fmt.Errorf("task %s not found", taskID)
	}
	task.Priority++
	task.Status = "escalated"
	r.tasks[taskID] = task
	return nil
}

// --- StubHoldRepo ---

type StubHoldRepo struct {
	mu    sync.Mutex
	holds map[string]map[string]string // docID -> holdID -> reason
}

func NewStubHoldRepo() *StubHoldRepo {
	return &StubHoldRepo{holds: make(map[string]map[string]string)}
}

func (r *StubHoldRepo) Place(_ context.Context, docID, holdID, reason string) error {
	log.Printf("[stub-hold-repo] Place doc=%s hold=%s reason=%s", docID, holdID, reason)
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.holds[docID] == nil {
		r.holds[docID] = make(map[string]string)
	}
	r.holds[docID][holdID] = reason
	return nil
}

func (r *StubHoldRepo) Release(_ context.Context, docID, holdID string) error {
	log.Printf("[stub-hold-repo] Release doc=%s hold=%s", docID, holdID)
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.holds[docID], holdID)
	return nil
}

func (r *StubHoldRepo) GetActive(_ context.Context, docID string) (HoldStatus, error) {
	log.Printf("[stub-hold-repo] GetActive doc=%s", docID)
	r.mu.Lock()
	defer r.mu.Unlock()
	holds := r.holds[docID]
	var active []string
	for id := range holds {
		active = append(active, id)
	}
	return HoldStatus{
		IsHeld:      len(active) > 0,
		ActiveHolds: active,
	}, nil
}

// --- StubBatchRepo ---

type StubBatchRepo struct {
	mu  sync.Mutex
	seq int
}

func NewStubBatchRepo() *StubBatchRepo {
	return &StubBatchRepo{}
}

func (r *StubBatchRepo) Acknowledge(_ context.Context, batch Batch) (BatchRecord, error) {
	log.Printf("[stub-batch-repo] Acknowledge batch=%s submissions=%d", batch.ID, len(batch.Submissions))
	r.mu.Lock()
	defer r.mu.Unlock()
	r.seq++
	return BatchRecord{
		ID:      fmt.Sprintf("batch-record-%d", r.seq),
		BatchID: batch.ID,
	}, nil
}
