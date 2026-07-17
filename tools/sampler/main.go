// Command sampler pulls a representative sample of workflow histories from a
// live Temporal namespace, extracts the meaningful events in memory, and writes
// a single "observed graph" JSON — the deployment-graph shape plus a per-edge
// occurrence time series (see tools/lsp/parser/observe). The visualizer reads
// that file directly; there is no intermediate on-disk history tree.
//
// The core sampling logic lives in the importable ./sampling package and the
// history→graph extraction in ./history; this command is a thin wrapper that
// adds flag parsing, the client connection, the build, and the file write.
package main

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"go.temporal.io/sdk/client"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/observe"
	"github.com/jmbarzee/temporal-architect/tools/sampler/history"
	"github.com/jmbarzee/temporal-architect/tools/sampler/sampling"
)

type options struct {
	address     string
	namespace   string
	tlsCertPath string
	tlsKeyPath  string
	out         string

	samplePercent int
	minPerType    int
	buckets       int

	// since / until are the raw --since / --until flag values (RFC3339 or a
	// duration like "24h"), parsed into a StartTime window in run. They both
	// filter executions and define the bucket time window.
	since  string
	until  string
	status string
}

// output is the top-level JSON envelope the sampler writes. A single
// observedGraph key mirrors the `graph` key of `twf graph --json`.
type output struct {
	ObservedGraph *observe.ObservedGraph `json:"observedGraph"`
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
	fs.StringVar(&opts.out, "out", "./", "Output path for the observed-graph JSON (a directory receives observed-graph.json)")
	fs.IntVar(&opts.samplePercent, "sample-percent", 10, "Percent of each type's executions to sample")
	fs.IntVar(&opts.minPerType, "min-per-type", 5, "Minimum executions to sample per type")
	fs.IntVar(&opts.buckets, "buckets", 1, "Number of equal-width time buckets to divide [--since, --until] into (1 = a single total). >1 requires --since")
	fs.StringVar(&opts.since, "since", "", "StartTime lower bound / bucket epoch: RFC3339 timestamp or duration like 24h (relative to now)")
	fs.StringVar(&opts.until, "until", "", "StartTime upper bound / bucket window end: RFC3339 timestamp or duration like 1h (defaults to now)")
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

	buckets := opts.buckets
	if buckets < 1 {
		buckets = 1
	}
	if buckets > 1 && since.IsZero() {
		return fmt.Errorf("--buckets %d requires --since (the bucket epoch)", buckets)
	}

	window := observe.Window{Buckets: buckets}
	if !since.IsZero() {
		window.Since = since.UTC().Format(time.RFC3339)
	}
	switch {
	case buckets > 1:
		// Bucketing needs a window end; default it to now.
		end := until
		if end.IsZero() {
			end = now
		}
		window.Until = end.UTC().Format(time.RFC3339)
	case !until.IsZero():
		window.Until = until.UTC().Format(time.RFC3339)
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

	og := history.Build(histories, history.Options{Namespace: opts.namespace, Window: window})

	path := resolveOutPath(opts.out)
	if err := writeObservedGraph(path, og); err != nil {
		return fmt.Errorf("write %s: %w", path, err)
	}
	fmt.Fprintf(os.Stderr, "sampled %d execution(s) → %d node(s), %d edge(s); wrote %s\n",
		len(histories), og.Summary.Nodes, og.Summary.Edges, path)
	return nil
}

// resolveOutPath treats an existing directory (or a path with a trailing
// separator) as the destination folder for observed-graph.json; anything else
// is used verbatim as the output file path.
func resolveOutPath(out string) string {
	if info, err := os.Stat(out); err == nil && info.IsDir() {
		return filepath.Join(out, "observed-graph.json")
	}
	if strings.HasSuffix(out, string(os.PathSeparator)) {
		return filepath.Join(out, "observed-graph.json")
	}
	return out
}

// writeObservedGraph serializes the observed graph as the single-key JSON
// envelope the visualizer consumes.
func writeObservedGraph(path string, og *observe.ObservedGraph) error {
	data, err := json.MarshalIndent(output{ObservedGraph: og}, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal observed graph: %w", err)
	}
	if dir := filepath.Dir(path); dir != "" {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return fmt.Errorf("create dir: %w", err)
		}
	}
	return os.WriteFile(path, data, 0o644)
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
