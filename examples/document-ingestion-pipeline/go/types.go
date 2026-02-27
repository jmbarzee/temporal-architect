package pipeline

import "time"

// --- Workflow I/O ---

type Submission struct {
	ID          string
	TenantID    string
	ContentType string
	Bytes       []byte // NOTE: production code should store bytes externally (e.g. S3) and pass only a reference, to avoid large payloads in Temporal workflow history.
	Metadata    map[string]string
}

type Document struct {
	ID          string
	TenantID    string
	StorageKey  string
	ContentHash string
	ContentType string
}

type ProcessingResult struct {
	Document       Document
	DeliveryResult *DeliveryResult
	Status         string
}

type DocumentStatus struct {
	Stage string
}

// --- Normalization ---

type NormalizedDocument struct {
	ID              string
	DocumentID      string
	Pages           []Page
	HasEmbeddedText bool
}

type NormalizationResult struct {
	NormalizedDoc NormalizedDocument
	SubDocuments  []SubDocument
}

type SubDocument struct {
	AsSubmission Submission
}

type Page struct {
	ID         string
	PageNumber int
	StorageKey string
}

// --- Scanning ---

type ScanResult struct {
	Infected       bool
	VirusName      string
	ScannerVersion string
}

// --- OCR ---

type TextExtractionResult struct {
	DocumentID string
	Pages      []PageText
	RawBlocks  []byte
}

type PageText struct {
	PageNumber int
	Text       string
	Confidence float64
}

// --- Classification ---

type ClassificationResult struct {
	DocumentType string
	Confidence   float64
	Predictions  []Prediction
}

type Prediction struct {
	DocumentType string
	Confidence   float64
}

// --- Extraction ---

type ExtractionResult struct {
	Fields      []ExtractedField
	NeedsReview bool
}

type ExtractedField struct {
	Name        string
	Value       string
	Confidence  float64
	BoundingBox *BoundingBox
}

type BoundingBox struct {
	Top    float64
	Left   float64
	Width  float64
	Height float64
}

// --- Validation ---

type ValidationResult struct {
	HasFailures bool
	Failures    []ValidationFailure
}

type ValidationFailure struct {
	Field   string
	Rule    string
	Message string
}

// --- Deduplication ---

type DeduplicationResult struct {
	IsNearDuplicate   bool
	Discard           bool
	MatchedDocumentID string
	Similarity        float64
}

// --- Delivery ---

type DeliveryResult struct {
	Targets []DeliveryTarget
}

type DeliveryTarget struct {
	TargetID string
	Status   string
}

// --- Review ---

type ReviewResult struct {
	ReviewType  string
	Decision    string
	Corrections map[string]any
}

type ReviewerAction struct {
	Decision    string
	Corrections map[string]any
	ReviewerID  string
}

type ReviewAck struct {
	Accepted bool
}

type ReviewStatus struct {
	ReviewType string
	Status     string
}

type ReviewTask struct {
	ID         string
	DocumentID string
	ReviewType string
	Status     string
	Priority   int
}

// --- Batch ---

type Batch struct {
	ID          string
	Submissions []Submission
}

type BatchResult struct {
	BatchRecord BatchRecord
	Results     []ProcessingResult
}

type BatchRecord struct {
	ID      string
	BatchID string
}

type BatchProgress struct {
	Total     int
	Completed int
}

// --- Retention ---

type RetentionPolicy struct {
	RetentionDuration time.Duration
}

type RetentionResult struct {
	Status string
}

type HoldStatus struct {
	IsHeld      bool
	ActiveHolds []string
}

// --- Reprocessing ---

type ReprocessFilter struct {
	DocumentType string
	Status       string
	Before       time.Time
	After        time.Time
}

type ReprocessResult struct {
	Status         string
	TotalProcessed int
}

type ReprocessProgress struct {
	Filter         ReprocessFilter
	Cursor         string
	ProcessedCount int
}

type DocumentBatch struct {
	Documents  []DocumentRef
	NextCursor string
}

type DocumentRef struct {
	ID             string
	AsResubmission Submission
}
