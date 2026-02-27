package main

import (
	"context"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	pipeline "document-ingestion-pipeline"

	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/textract"
	clamd "github.com/dutchcoders/go-clamd"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pkg/sftp"
	"go.temporal.io/sdk/client"
	"go.temporal.io/sdk/worker"
	"golang.org/x/crypto/ssh"
)

func main() {
	ctx := context.Background()

	// Temporal client
	c, err := client.Dial(client.Options{})
	if err != nil {
		log.Fatalf("Unable to create Temporal client: %v", err)
	}
	defer c.Close()

	// AWS clients
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		log.Fatalf("Unable to load AWS config: %v", err)
	}
	s3Client := s3.NewFromConfig(cfg)
	textractClient := textract.NewFromConfig(cfg)

	// ClamAV
	clamClient := clamd.NewClamd(os.Getenv("CLAMAV_ADDRESS"))

	// Database
	pool, err := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatalf("Unable to create database pool: %v", err)
	}
	defer pool.Close()

	// Initialize tables
	docRepo := &pipeline.PgxDocumentRepo{Pool: pool}
	reviewRepo := &pipeline.PgxReviewRepo{Pool: pool}
	holdRepo := &pipeline.PgxHoldRepo{Pool: pool}
	batchRepo := &pipeline.PgxBatchRepo{Pool: pool}

	if err := docRepo.Init(ctx); err != nil {
		log.Fatalf("Init document repo: %v", err)
	}
	if err := reviewRepo.Init(ctx); err != nil {
		log.Fatalf("Init review repo: %v", err)
	}
	if err := holdRepo.Init(ctx); err != nil {
		log.Fatalf("Init hold repo: %v", err)
	}
	if err := batchRepo.Init(ctx); err != nil {
		log.Fatalf("Init batch repo: %v", err)
	}

	// HTTP client
	httpClient := &http.Client{Timeout: 30 * time.Second}

	// SFTP client
	sftpUploader := connectSFTP()

	bucket := os.Getenv("S3_BUCKET")
	mlEndpoint := os.Getenv("ML_ENDPOINT")
	deliveryEndpoint := os.Getenv("DELIVERY_ENDPOINT")

	// Activity structs
	pipelineActs := &pipeline.PipelineActivities{
		S3:               s3Client,
		Textract:         textractClient,
		ClamAV:           clamClient,
		HTTP:             httpClient,
		SFTP:             sftpUploader,
		Documents:        docRepo,
		Batches:          batchRepo,
		Bucket:           bucket,
		MLEndpoint:       mlEndpoint,
		DeliveryEndpoint: deliveryEndpoint,
	}

	reviewActs := &pipeline.ReviewActivities{
		Reviews: reviewRepo,
	}

	retentionActs := &pipeline.RetentionActivities{
		S3:        s3Client,
		Holds:     holdRepo,
		Documents: docRepo,
		Bucket:    bucket,
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

	log.Println("Workers started. Press Ctrl+C to exit.")

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	select {
	case sig := <-sigCh:
		log.Printf("Received signal %v, shutting down...", sig)
	case err := <-errCh:
		log.Fatalf("Worker error: %v", err)
	}
}

// sftpAdapter wraps *sftp.Client to satisfy pipeline.SFTPUploader.
type sftpAdapter struct {
	client *sftp.Client
}

func (a *sftpAdapter) MkdirAll(path string) error {
	return a.client.MkdirAll(path)
}

func (a *sftpAdapter) Create(path string) (io.WriteCloser, error) {
	return a.client.Create(path)
}

func connectSFTP() pipeline.SFTPUploader {
	host := os.Getenv("SFTP_HOST")
	user := os.Getenv("SFTP_USER")
	keyFile := os.Getenv("SFTP_KEY_FILE")

	if host == "" {
		return nil
	}

	keyBytes, err := os.ReadFile(keyFile)
	if err != nil {
		log.Fatalf("Read SFTP key: %v", err)
	}
	signer, err := ssh.ParsePrivateKey(keyBytes)
	if err != nil {
		log.Fatalf("Parse SFTP key: %v", err)
	}

	conn, err := ssh.Dial("tcp", host, &ssh.ClientConfig{
		User:            user,
		Auth:            []ssh.AuthMethod{ssh.PublicKeys(signer)},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
	})
	if err != nil {
		log.Fatalf("SSH dial: %v", err)
	}

	client, err := sftp.NewClient(conn)
	if err != nil {
		log.Fatalf("SFTP client: %v", err)
	}

	return &sftpAdapter{client: client}
}
