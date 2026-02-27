package pipeline

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"hash/fnv"
	"io"
	"net/http"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/textract"
	textractTypes "github.com/aws/aws-sdk-go-v2/service/textract/types"
	clamd "github.com/dutchcoders/go-clamd"
	"go.temporal.io/sdk/activity"
)

type PipelineActivities struct {
	S3               S3API
	Textract         TextractAPI
	ClamAV           ClamAVScanner
	HTTP             HTTPDoer
	SFTP             SFTPUploader
	Documents        DocumentRepo
	Batches          BatchRepo
	Bucket           string
	MLEndpoint       string
	DeliveryEndpoint string
}

func (a *PipelineActivities) IngestDocument(ctx context.Context, submission Submission) (Document, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("IngestDocument", "submissionID", submission.ID, "tenantID", submission.TenantID)

	// TODO: production ingest should validate content type, check file size limits, and extract metadata.
	if len(submission.Bytes) == 0 {
		return Document{}, fmt.Errorf("submission %s has empty content", submission.ID)
	}

	// Compute content hash
	hash := sha256.Sum256(submission.Bytes)
	contentHash := fmt.Sprintf("%x", hash)

	// Build S3 key with tenant prefix
	storageKey := fmt.Sprintf("%s/%s/%s", submission.TenantID, submission.ID, submission.ContentType)

	// Persist raw bytes to S3
	_, err := a.S3.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(a.Bucket),
		Key:         aws.String(storageKey),
		Body:        bytes.NewReader(submission.Bytes),
		ContentType: aws.String(submission.ContentType),
	})
	if err != nil {
		return Document{}, fmt.Errorf("s3 put: %w", err)
	}

	doc := Document{
		ID:          submission.ID,
		TenantID:    submission.TenantID,
		StorageKey:  storageKey,
		ContentHash: contentHash,
		ContentType: submission.ContentType,
	}

	// Create document record
	if err := a.Documents.Create(ctx, doc); err != nil {
		return Document{}, fmt.Errorf("create document record: %w", err)
	}

	return doc, nil
}

func (a *PipelineActivities) ScanMalware(ctx context.Context, document Document) (ScanResult, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("ScanMalware", "documentID", document.ID)

	// Fetch document bytes from S3
	obj, err := a.S3.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(a.Bucket),
		Key:    aws.String(document.StorageKey),
	})
	if err != nil {
		return ScanResult{}, fmt.Errorf("s3 get: %w", err)
	}
	defer obj.Body.Close()

	// Stream to ClamAV
	abort := make(chan bool)
	resultCh, err := a.ClamAV.ScanStream(obj.Body, abort)
	if err != nil {
		return ScanResult{}, fmt.Errorf("clam scan: %w", err)
	}

	result, ok := <-resultCh
	if !ok || result == nil {
		return ScanResult{}, fmt.Errorf("clam scan: channel closed without result")
	}
	infected := result.Status == clamd.RES_FOUND

	return ScanResult{
		Infected:       infected,
		VirusName:      result.Description,
		ScannerVersion: result.Raw,
	}, nil
}

func (a *PipelineActivities) QuarantineDocument(ctx context.Context, document Document, scanResult ScanResult) error {
	logger := activity.GetLogger(ctx)
	logger.Info("QuarantineDocument", "documentID", document.ID, "virus", scanResult.VirusName)

	// Move to quarantine prefix
	quarantineKey := "quarantine/" + document.StorageKey
	_, err := a.S3.CopyObject(ctx, &s3.CopyObjectInput{
		Bucket:     aws.String(a.Bucket),
		CopySource: aws.String(a.Bucket + "/" + document.StorageKey),
		Key:        aws.String(quarantineKey),
	})
	if err != nil {
		return fmt.Errorf("s3 copy to quarantine: %w", err)
	}

	_, err = a.S3.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(a.Bucket),
		Key:    aws.String(document.StorageKey),
	})
	if err != nil {
		return fmt.Errorf("s3 delete original: %w", err)
	}

	return nil
}

func (a *PipelineActivities) NormalizeDocument(ctx context.Context, document Document) (NormalizationResult, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("NormalizeDocument", "documentID", document.ID, "contentType", document.ContentType)

	// Fetch document
	obj, err := a.S3.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(a.Bucket),
		Key:    aws.String(document.StorageKey),
	})
	if err != nil {
		return NormalizationResult{}, fmt.Errorf("s3 get: %w", err)
	}
	defer obj.Body.Close()

	docBytes, err := io.ReadAll(obj.Body)
	if err != nil {
		return NormalizationResult{}, fmt.Errorf("read body: %w", err)
	}

	// TODO: production normalization should handle format conversion (TIFF→PDF, DOCX→PDF, etc.),
	// multi-page splitting, and email attachment extraction for message/rfc822 content types.
	// Detect format and normalize
	hasEmbeddedText := document.ContentType == "application/pdf"
	pages := []Page{{
		ID:         document.ID + "-page-1",
		PageNumber: 1,
		StorageKey: document.StorageKey,
	}}

	normalizedDoc := NormalizedDocument{
		ID:              document.ID + "-norm",
		DocumentID:      document.ID,
		Pages:           pages,
		HasEmbeddedText: hasEmbeddedText,
	}

	// Check for sub-documents (e.g., email attachments)
	var subDocs []SubDocument
	if document.ContentType == "message/rfc822" {
		// In a real implementation, parse email and extract attachments
		_ = docBytes
	}

	return NormalizationResult{
		NormalizedDoc: normalizedDoc,
		SubDocuments:  subDocs,
	}, nil
}

func (a *PipelineActivities) StartOCRJob(ctx context.Context, document NormalizedDocument) (string, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("StartOCRJob", "documentID", document.DocumentID, "pages", len(document.Pages))

	// TODO: production OCR should submit all pages, not just the first. Multi-page documents
	// require iterating document.Pages and either batching or submitting separate jobs.
	if len(document.Pages) == 0 {
		return "", fmt.Errorf("no pages to process")
	}

	output, err := a.Textract.StartDocumentAnalysis(ctx, &textract.StartDocumentAnalysisInput{
		DocumentLocation: &textractTypes.DocumentLocation{
			S3Object: &textractTypes.S3Object{
				Bucket: aws.String(a.Bucket),
				Name:   aws.String(document.Pages[0].StorageKey),
			},
		},
		FeatureTypes: []textractTypes.FeatureType{
			textractTypes.FeatureTypeTables,
			textractTypes.FeatureTypeForms,
		},
	})
	if err != nil {
		return "", fmt.Errorf("start textract: %w", err)
	}

	return aws.ToString(output.JobId), nil
}

func (a *PipelineActivities) PollOCRResult(ctx context.Context, jobID string) (TextExtractionResult, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("PollOCRResult", "jobID", jobID)

	output, err := a.Textract.GetDocumentAnalysis(ctx, &textract.GetDocumentAnalysisInput{
		JobId: aws.String(jobID),
	})
	if err != nil {
		return TextExtractionResult{}, fmt.Errorf("get textract: %w", err)
	}

	if output.JobStatus != textractTypes.JobStatusSucceeded {
		return TextExtractionResult{}, fmt.Errorf("job not complete: %s", output.JobStatus)
	}

	// Aggregate page text from blocks
	var pages []PageText
	for _, block := range output.Blocks {
		if block.BlockType == textractTypes.BlockTypeLine && block.Text != nil {
			page := 1
			if block.Page != nil {
				page = int(*block.Page)
			}
			pages = append(pages, PageText{
				PageNumber: page,
				Text:       *block.Text,
				Confidence: float64(aws.ToFloat32(block.Confidence)),
			})
		}
	}

	rawBlocks, _ := json.Marshal(output.Blocks)

	return TextExtractionResult{
		DocumentID: jobID,
		Pages:      pages,
		RawBlocks:  rawBlocks,
	}, nil
}

func (a *PipelineActivities) ClassifyDocument(ctx context.Context, document NormalizedDocument, text TextExtractionResult) (ClassificationResult, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("ClassifyDocument", "documentID", document.DocumentID)

	// Build text content for classification
	var textContent strings.Builder
	for _, page := range text.Pages {
		textContent.WriteString(page.Text)
		textContent.WriteString("\n")
	}

	// Call ML endpoint
	reqBody, _ := json.Marshal(map[string]string{
		"text":       textContent.String(),
		"documentID": document.DocumentID,
	})
	req, err := http.NewRequestWithContext(ctx, "POST", a.MLEndpoint+"/classify", bytes.NewReader(reqBody))
	if err != nil {
		return ClassificationResult{}, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := a.HTTP.Do(req)
	if err != nil {
		return ClassificationResult{}, fmt.Errorf("classify request: %w", err)
	}
	defer resp.Body.Close()

	var result ClassificationResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return ClassificationResult{}, fmt.Errorf("decode response: %w", err)
	}

	return result, nil
}

func (a *PipelineActivities) ExtractFields(ctx context.Context, document NormalizedDocument, text TextExtractionResult, classification ClassificationResult) (ExtractionResult, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("ExtractFields", "documentID", document.DocumentID, "type", classification.DocumentType)

	var textContent strings.Builder
	for _, page := range text.Pages {
		textContent.WriteString(page.Text)
		textContent.WriteString("\n")
	}

	reqBody, _ := json.Marshal(map[string]string{
		"text":         textContent.String(),
		"documentType": classification.DocumentType,
		"documentID":   document.DocumentID,
	})
	req, err := http.NewRequestWithContext(ctx, "POST", a.MLEndpoint+"/extract", bytes.NewReader(reqBody))
	if err != nil {
		return ExtractionResult{}, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := a.HTTP.Do(req)
	if err != nil {
		return ExtractionResult{}, fmt.Errorf("extract request: %w", err)
	}
	defer resp.Body.Close()

	var result ExtractionResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return ExtractionResult{}, fmt.Errorf("decode response: %w", err)
	}

	return result, nil
}

func (a *PipelineActivities) ValidateExtraction(ctx context.Context, extraction ExtractionResult, classification ClassificationResult) (ValidationResult, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("ValidateExtraction", "documentType", classification.DocumentType, "fields", len(extraction.Fields))

	// TODO: production validation should apply document-type-specific rules (e.g., date format
	// checks, cross-field consistency, regex patterns for IDs) rather than only checking for empty values.
	var failures []ValidationFailure

	// Check required fields based on document type
	for _, field := range extraction.Fields {
		if field.Value == "" {
			failures = append(failures, ValidationFailure{
				Field:   field.Name,
				Rule:    "required",
				Message: fmt.Sprintf("field %q is empty", field.Name),
			})
		}
	}

	return ValidationResult{
		HasFailures: len(failures) > 0,
		Failures:    failures,
	}, nil
}

func (a *PipelineActivities) CheckDuplicates(ctx context.Context, document Document, extraction ExtractionResult) (DeduplicationResult, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("CheckDuplicates", "documentID", document.ID)

	// Compute text hash for near-duplicate detection
	h := fnv.New64a()
	for _, field := range extraction.Fields {
		h.Write([]byte(field.Value))
	}
	textHash := h.Sum64()

	return a.Documents.LookupDuplicates(ctx, document.ContentHash, textHash)
}

func (a *PipelineActivities) RouteDocument(ctx context.Context, document Document, extraction ExtractionResult, classification ClassificationResult) (DeliveryResult, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("RouteDocument", "documentID", document.ID, "type", classification.DocumentType)

	// TODO: production routing should evaluate configurable routing rules per document type and
	// tenant, supporting multiple delivery targets (API, SFTP, email, webhook) with retry policies.
	// Evaluate routing rules and deliver
	var targets []DeliveryTarget

	// API delivery
	reqBody, _ := json.Marshal(map[string]any{
		"documentID":   document.ID,
		"documentType": classification.DocumentType,
		"fields":       extraction.Fields,
	})
	req, err := http.NewRequestWithContext(ctx, "POST", a.DeliveryEndpoint, bytes.NewReader(reqBody))
	if err != nil {
		return DeliveryResult{}, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := a.HTTP.Do(req)
	if err != nil {
		return DeliveryResult{}, fmt.Errorf("deliver request: %w", err)
	}
	resp.Body.Close()

	targets = append(targets, DeliveryTarget{
		TargetID: "api-primary",
		Status:   "delivered",
	})

	// SFTP delivery if configured
	if a.SFTP != nil {
		dir := fmt.Sprintf("/incoming/%s/%s", document.TenantID, classification.DocumentType)
		if err := a.SFTP.MkdirAll(dir); err != nil {
			return DeliveryResult{}, fmt.Errorf("sftp mkdir: %w", err)
		}
		f, err := a.SFTP.Create(fmt.Sprintf("%s/%s.json", dir, document.ID))
		if err != nil {
			return DeliveryResult{}, fmt.Errorf("sftp create: %w", err)
		}
		_, _ = f.Write(reqBody)
		f.Close()

		targets = append(targets, DeliveryTarget{
			TargetID: "sftp-primary",
			Status:   "delivered",
		})
	}

	return DeliveryResult{Targets: targets}, nil
}

func (a *PipelineActivities) ApplyClassificationReview(_ context.Context, original ClassificationResult, review ReviewResult) (ClassificationResult, error) {
	result := original
	if dt, ok := review.Corrections["documentType"].(string); ok {
		result.DocumentType = dt
		result.Confidence = 1.0
	}
	return result, nil
}

func (a *PipelineActivities) ApplyExtractionReview(_ context.Context, original ExtractionResult, review ReviewResult) (ExtractionResult, error) {
	result := original
	result.NeedsReview = false
	for i, field := range result.Fields {
		if corrected, ok := review.Corrections[field.Name].(string); ok {
			result.Fields[i].Value = corrected
			result.Fields[i].Confidence = 1.0
		}
	}
	return result, nil
}

func (a *PipelineActivities) ApplyValidationReview(_ context.Context, original ValidationResult, review ReviewResult) (ValidationResult, error) {
	result := original
	if review.Decision == "override" {
		result.HasFailures = false
		result.Failures = nil
	}
	return result, nil
}

func (a *PipelineActivities) ApplyDedupReview(_ context.Context, original DeduplicationResult, review ReviewResult) (DeduplicationResult, error) {
	result := original
	switch review.Decision {
	case "keep-both":
		result.Discard = false
		result.IsNearDuplicate = false
	case "discard":
		result.Discard = true
	case "replace":
		result.Discard = false
	}
	return result, nil
}

func (a *PipelineActivities) AcknowledgeBatch(ctx context.Context, batch Batch) (BatchRecord, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("AcknowledgeBatch", "batchID", batch.ID, "submissions", len(batch.Submissions))
	return a.Batches.Acknowledge(ctx, batch)
}

func (a *PipelineActivities) FindDocumentBatch(ctx context.Context, filter ReprocessFilter, cursor string) (DocumentBatch, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("FindDocumentBatch", "documentType", filter.DocumentType, "cursor", cursor)
	return a.Documents.FindBatch(ctx, filter, cursor)
}
