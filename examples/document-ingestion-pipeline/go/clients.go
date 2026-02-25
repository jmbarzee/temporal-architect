package pipeline

import (
	"context"
	"io"
	"net/http"

	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/textract"
	clamd "github.com/dutchcoders/go-clamd"
)

// S3API is satisfied by *s3.Client from aws-sdk-go-v2/service/s3.
type S3API interface {
	PutObject(ctx context.Context, params *s3.PutObjectInput, optFns ...func(*s3.Options)) (*s3.PutObjectOutput, error)
	GetObject(ctx context.Context, params *s3.GetObjectInput, optFns ...func(*s3.Options)) (*s3.GetObjectOutput, error)
	CopyObject(ctx context.Context, params *s3.CopyObjectInput, optFns ...func(*s3.Options)) (*s3.CopyObjectOutput, error)
	DeleteObject(ctx context.Context, params *s3.DeleteObjectInput, optFns ...func(*s3.Options)) (*s3.DeleteObjectOutput, error)
}

// TextractAPI is satisfied by *textract.Client from aws-sdk-go-v2/service/textract.
type TextractAPI interface {
	StartDocumentAnalysis(ctx context.Context, params *textract.StartDocumentAnalysisInput, optFns ...func(*textract.Options)) (*textract.StartDocumentAnalysisOutput, error)
	GetDocumentAnalysis(ctx context.Context, params *textract.GetDocumentAnalysisInput, optFns ...func(*textract.Options)) (*textract.GetDocumentAnalysisOutput, error)
}

// ClamAVScanner is satisfied by *clamd.Clamd from go-clamd.
type ClamAVScanner interface {
	ScanStream(r io.Reader, abort chan bool) (chan *clamd.ScanResult, error)
}

// HTTPDoer is satisfied by *http.Client.
type HTTPDoer interface {
	Do(req *http.Request) (*http.Response, error)
}

// SFTPUploader abstracts SFTP file upload.
type SFTPUploader interface {
	MkdirAll(path string) error
	Create(path string) (io.WriteCloser, error)
}
