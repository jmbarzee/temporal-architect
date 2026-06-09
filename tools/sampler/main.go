// Command sampler pulls a representative sample of workflow histories from a
// live Temporal namespace and writes them as protojson into the folder layout
// `twf graph --history` consumes: <out>/<namespace>/<workflowType>/<id>.json.
//
// One invocation targets one namespace and runs two internal phases:
//
//	Phase A — enumerate workflow types via a paginated Visibility scan.
//	Phase B — per type, sample a configurable share of executions (preferring
//	          running ones) and download their full histories.
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

	enumspb "go.temporal.io/api/enums/v1"
	historypb "go.temporal.io/api/history/v1"
	"go.temporal.io/api/temporalproto"
	"go.temporal.io/api/workflowservice/v1"
	"go.temporal.io/sdk/client"
)

type options struct {
	address       string
	namespace     string
	tlsCertPath   string
	tlsKeyPath    string
	out           string
	samplePercent int
	minPerType    int
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
	_ = fs.Parse(args)
	return opts
}

func run(ctx context.Context, opts options) error {
	c, err := dial(opts)
	if err != nil {
		return fmt.Errorf("connect to %s: %w", opts.address, err)
	}
	defer c.Close()

	// Phase A — enumerate types and candidate executions.
	byType, err := enumerate(ctx, c, opts.namespace)
	if err != nil {
		return fmt.Errorf("enumerate workflow types: %w", err)
	}
	if len(byType) == 0 {
		fmt.Fprintf(os.Stderr, "no workflow executions found in namespace %q\n", opts.namespace)
		return nil
	}

	// Phase B — sample per type and write histories.
	total := 0
	for wfType, cands := range byType {
		n := sampleCount(len(cands), opts.samplePercent, opts.minPerType)
		selected := selectCandidates(cands, n)
		for _, cand := range selected {
			if err := writeHistory(ctx, c, opts, wfType, cand); err != nil {
				return fmt.Errorf("write history %s/%s: %w", wfType, cand.workflowID, err)
			}
			total++
		}
		fmt.Fprintf(os.Stderr, "%s: sampled %d of %d execution(s)\n", wfType, len(selected), len(cands))
	}
	fmt.Fprintf(os.Stderr, "wrote %d history file(s) under %s\n", total, opts.out)
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

// enumerate paginates the Visibility ListWorkflow API, aggregating every
// observed execution into a map keyed by workflow type. Each entry records
// the execution's id, run id, and whether it is currently running.
//
// This single portable scan replaces a CountWorkflowExecutions GROUP BY
// (which not all server versions support); per-type counts fall out of the
// candidate slice lengths.
func enumerate(ctx context.Context, c client.Client, namespace string) (map[string][]candidate, error) {
	byType := map[string][]candidate{}
	var pageToken []byte
	for {
		resp, err := c.ListWorkflow(ctx, &workflowservice.ListWorkflowExecutionsRequest{
			Namespace:     namespace,
			PageSize:      1000,
			NextPageToken: pageToken,
		})
		if err != nil {
			return nil, err
		}
		for _, info := range resp.GetExecutions() {
			wfType := info.GetType().GetName()
			if wfType == "" {
				continue
			}
			byType[wfType] = append(byType[wfType], candidate{
				workflowID: info.GetExecution().GetWorkflowId(),
				runID:      info.GetExecution().GetRunId(),
				running:    info.GetStatus() == enumspb.WORKFLOW_EXECUTION_STATUS_RUNNING,
			})
		}
		pageToken = resp.GetNextPageToken()
		if len(pageToken) == 0 {
			break
		}
	}
	return byType, nil
}

// writeHistory downloads one execution's full history and writes it as
// protojson to <out>/<namespace>/<type>/<id>.json, matching the format of
// `temporal workflow show -o json`.
func writeHistory(ctx context.Context, c client.Client, opts options, wfType string, cand candidate) error {
	events, err := fetchHistory(ctx, c, cand)
	if err != nil {
		return err
	}
	hist := &historypb.History{Events: events}

	data, err := temporalproto.CustomJSONMarshalOptions{Indent: "  "}.Marshal(hist)
	if err != nil {
		return fmt.Errorf("marshal history: %w", err)
	}

	path := outputPath(opts.out, opts.namespace, wfType, cand.workflowID)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("create dir: %w", err)
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return fmt.Errorf("write file: %w", err)
	}
	return nil
}

// fetchHistory drains the full event history for one execution.
func fetchHistory(ctx context.Context, c client.Client, cand candidate) ([]*historypb.HistoryEvent, error) {
	iter := c.GetWorkflowHistory(ctx, cand.workflowID, cand.runID, false,
		enumspb.HISTORY_EVENT_FILTER_TYPE_ALL_EVENT)
	var events []*historypb.HistoryEvent
	for iter.HasNext() {
		e, err := iter.Next()
		if err != nil {
			return nil, err
		}
		events = append(events, e)
	}
	return events, nil
}
