// Command sampler pulls a representative sample of workflow histories from a
// live Temporal namespace and writes them as protojson into the folder layout
// `twf graph --history` consumes: <out>/<namespace>/<workflowType>/<id>.json.
//
// The core sampling logic lives in the importable ./sampling package; this
// command is a thin wrapper that adds flag parsing, the client connection, and
// disk writing.
//
// Run it once per namespace into the same --out to build a multi-namespace
// tree for `twf graph --history <out>`.
package main

import (
	"context"
	"crypto/tls"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"time"

	enumspb "go.temporal.io/api/enums/v1"
	historypb "go.temporal.io/api/history/v1"
	"go.temporal.io/api/temporalproto"
	"go.temporal.io/sdk/client"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/history"
	"github.com/jmbarzee/temporal-architect/tools/sampler/sampling"
)

type options struct {
	address       string
	namespace     string
	tlsCertPath   string
	tlsKeyPath    string
	out           string
	samplePercent int
	minPerType    int

	// since / until are the raw --since / --until flag values (RFC3339 or a
	// duration like "24h"), parsed into a StartTime window in run.
	since  string
	until  string
	status string
}

func main() {
	opts := parseFlags(os.Args[1:])
	if err := run(context.Background(), opts); err != nil {
		fmt.Fprintf(os.Stderr, "sampler: %v\n", err)
		os.Exit(1)
	}
}

func parseFlags(args []string) options {
	fs := flag.NewFlagSet("sampler", flag.ExitOnError)
	var opts options
	fs.StringVar(&opts.address, "address", "127.0.0.1:7233", "Temporal frontend host:port")
	fs.StringVar(&opts.namespace, "namespace", "default", "Namespace to sample")
	fs.StringVar(&opts.tlsCertPath, "tls-cert-path", "", "Client TLS certificate (mTLS)")
	fs.StringVar(&opts.tlsKeyPath, "tls-key-path", "", "Client TLS private key (mTLS)")
	fs.StringVar(&opts.out, "out", "./", "Output root dir for <namespace>/<type>/<id>.json")
	fs.IntVar(&opts.samplePercent, "sample-percent", 10, "Percent of each type's executions to sample")
	fs.IntVar(&opts.minPerType, "min-per-type", 5, "Minimum executions to sample per type")
	fs.StringVar(&opts.since, "since", "", "StartTime lower bound: RFC3339 timestamp or duration like 24h (relative to now)")
	fs.StringVar(&opts.until, "until", "", "StartTime upper bound: RFC3339 timestamp or duration like 1h (relative to now)")
	fs.StringVar(&opts.status, "status", "", "ExecutionStatus filter (e.g. Running, Completed, Failed)")
	_ = fs.Parse(args)
	return opts
}

// parseTimeFlag interprets a --since / --until value as either an RFC3339
// timestamp or a Go duration (e.g. "24h"), the latter taken relative to now
// (now - d). An empty string yields the zero time (unbounded).
func parseTimeFlag(s string, now time.Time) (time.Time, error) {
	if s == "" {
		return time.Time{}, nil
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t, nil
	}
	if d, err := time.ParseDuration(s); err == nil {
		return now.Add(-d), nil
	}
	return time.Time{}, fmt.Errorf("invalid time %q: want RFC3339 timestamp or duration like 24h", s)
}

func run(ctx context.Context, opts options) error {
	now := time.Now()
	since, err := parseTimeFlag(opts.since, now)
	if err != nil {
		return fmt.Errorf("--since: %w", err)
	}
	until, err := parseTimeFlag(opts.until, now)
	if err != nil {
		return fmt.Errorf("--until: %w", err)
	}

	c, err := dial(opts)
	if err != nil {
		return fmt.Errorf("connect to %s: %w", opts.address, err)
	}
	defer c.Close()

	histories, err := sampling.Sample(ctx, c, sampling.Options{
		Namespace:     opts.namespace,
		SamplePercent: opts.samplePercent,
		MinPerType:    opts.minPerType,
		Status:        opts.status,
		Since:         since,
		Until:         until,
	})
	if err != nil {
		return err
	}
	if len(histories) == 0 {
		fmt.Fprintf(os.Stderr, "no workflow executions found in namespace %q\n", opts.namespace)
		return nil
	}

	for _, h := range histories {
		if err := writeHistory(opts.out, h); err != nil {
			return fmt.Errorf("write history %s: %w", h.WorkflowID, err)
		}
	}
	fmt.Fprintf(os.Stderr, "wrote %d history file(s) under %s\n", len(histories), opts.out)
	return nil
}

// dial opens a Temporal client, configuring mTLS when both cert and key
// paths are provided.
func dial(opts options) (client.Client, error) {
	co := client.Options{
		HostPort:  opts.address,
		Namespace: opts.namespace,
	}
	if opts.tlsCertPath != "" && opts.tlsKeyPath != "" {
		cert, err := tls.LoadX509KeyPair(opts.tlsCertPath, opts.tlsKeyPath)
		if err != nil {
			return nil, fmt.Errorf("load TLS key pair: %w", err)
		}
		co.ConnectionOptions = client.ConnectionOptions{
			TLS: &tls.Config{Certificates: []tls.Certificate{cert}},
		}
	}
	return client.Dial(co)
}

// writeHistory serializes one sampled history as protojson (matching
// `temporal workflow show -o json`) and writes it to
// <out>/<namespace>/<workflowType>/<workflowId>.json.
func writeHistory(out string, h history.History) error {
	hist := &historypb.History{Events: h.Events}
	data, err := temporalproto.CustomJSONMarshalOptions{Indent: "  "}.Marshal(hist)
	if err != nil {
		return fmt.Errorf("marshal history: %w", err)
	}

	path := outputPath(out, h.Namespace, workflowTypeOf(h), h.WorkflowID)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("create dir: %w", err)
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return fmt.Errorf("write file: %w", err)
	}
	return nil
}

// workflowTypeOf reads the workflow type from the history's
// WORKFLOW_EXECUTION_STARTED event (used only for the on-disk folder layout).
func workflowTypeOf(h history.History) string {
	for _, e := range h.Events {
		if e.GetEventType() == enumspb.EVENT_TYPE_WORKFLOW_EXECUTION_STARTED {
			return e.GetWorkflowExecutionStartedEventAttributes().GetWorkflowType().GetName()
		}
	}
	return "UnknownWorkflowType"
}
