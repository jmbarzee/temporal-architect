package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"

	pipeline "document-ingestion-pipeline"

	"go.temporal.io/sdk/client"
	"go.temporal.io/sdk/worker"
)

func main() {
	c, err := client.Dial(client.Options{})
	if err != nil {
		log.Fatalf("Unable to create Temporal client: %v", err)
	}
	defer c.Close()

	// Stub clients and repos — no external services needed
	stubS3 := pipeline.NewStubS3()
	stubDocRepo := pipeline.NewStubDocumentRepo()
	stubReviewRepo := pipeline.NewStubReviewRepo()
	stubHoldRepo := pipeline.NewStubHoldRepo()
	stubBatchRepo := pipeline.NewStubBatchRepo()

	pipelineActs := &pipeline.PipelineActivities{
		S3:         stubS3,
		Textract:   &pipeline.StubTextract{},
		ClamAV:     &pipeline.StubClamAV{},
		HTTP:       &pipeline.StubHTTP{},
		SFTP:       &pipeline.StubSFTP{},
		Documents:  stubDocRepo,
		Batches:    stubBatchRepo,
		Bucket:     "stub-bucket",
		MLEndpoint: "http://localhost:8080",
	}

	reviewActs := &pipeline.ReviewActivities{
		Reviews: stubReviewRepo,
	}

	retentionActs := &pipeline.RetentionActivities{
		S3:        stubS3,
		Holds:     stubHoldRepo,
		Documents: stubDocRepo,
		Bucket:    "stub-bucket",
	}

	// Pipeline worker
	pipelineWorker := worker.New(c, "pipeline", worker.Options{})
	pipelineWorker.RegisterWorkflow(pipeline.ProcessDocument)
	pipelineWorker.RegisterWorkflow(pipeline.ProcessBatch)
	pipelineWorker.RegisterWorkflow(pipeline.BulkReprocess)
	pipelineWorker.RegisterWorkflow(pipeline.ExtractText)
	pipelineWorker.RegisterActivity(pipelineActs)

	// Review worker
	reviewWorker := worker.New(c, "review", worker.Options{})
	reviewWorker.RegisterWorkflow(pipeline.HumanReview)
	reviewWorker.RegisterActivity(reviewActs)

	// Retention worker
	retentionWorker := worker.New(c, "retention", worker.Options{})
	retentionWorker.RegisterWorkflow(pipeline.ManageRetention)
	retentionWorker.RegisterActivity(retentionActs)

	// Start all workers
	errCh := make(chan error, 3)
	go func() { errCh <- pipelineWorker.Run(worker.InterruptCh()) }()
	go func() { errCh <- reviewWorker.Run(worker.InterruptCh()) }()
	go func() { errCh <- retentionWorker.Run(worker.InterruptCh()) }()

	log.Println("Stub workers started. Press Ctrl+C to exit.")

	// Wait for interrupt or worker error
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	select {
	case sig := <-sigCh:
		log.Printf("Received signal %v, shutting down...", sig)
	case err := <-errCh:
		log.Fatalf("Worker error: %v", err)
	}
}
