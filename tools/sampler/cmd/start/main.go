// Command start launches a SampleNamespaceWorkflow, waits for the merged
// ObservedGraph result, and writes it as observed-graph.json — the same
// single-key JSON envelope the single-process `sampler` CLI produces (and the
// visualizer consumes). The starter, not the worker, writes the file, so the
// worker needs no local-disk side effects.
//
// It resolves --since/--until to an ABSOLUTE RFC3339 window before submitting,
// so the window is stable across replays / continue-as-new and every partial
// graph is index-aligned for observe.Merge.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"go.temporal.io/sdk/client"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/observe"
	"github.com/jmbarzee/temporal-architect/tools/sampler/sampling"
	temporalsampler "github.com/jmbarzee/temporal-architect/tools/sampler/temporal"
)

// output mirrors the single-process CLI's envelope — an observedGraph key
// matching the `graph` key of `twf graph --json` — plus the coverage assurance
// for that graph. Coverage sits BESIDE the graph rather than inside it so the
// graph shape stays byte-compatible with what the visualizer consumes, while a
// reader can still tell whether it is looking at the whole system (coverage
// .exhaustive) or an unknown fraction of it.
type output struct {
	ObservedGraph *observe.ObservedGraph       `json:"observedGraph"`
	Coverage      temporalsampler.TypeCoverage `json:"coverage"`
}

type options struct {
	// Target namespace + sampling knobs (mirror the single-process CLI).
	namespace     string
	samplePercent int
	minPerType    int
	buckets       int
	since         string
	until         string
	status        string
	out           string

	// Parallelism knobs.
	batchSize       int
	batchesPerRun   int
	typeConcurrency int
	execConcurrency int

	// Type discovery (see sampling.DiscoveryPolicy).
	workflowTypes      string
	discoveryProbes    int
	discoveryPageSize  int
	discoverySeed      int64
	discoveryMaxRounds int

	// Control-plane connection to the sampler's own Temporal (not the target).
	temporalHostPort  string
	temporalNamespace string
	taskQueue         string
	workflowID        string
}

func main() {
	opts := parseFlags(os.Args[1:])
	if err := run(context.Background(), opts); err != nil {
		fmt.Fprintf(os.Stderr, "sampler-start: %v\n", err)
		os.Exit(1)
	}
}

func parseFlags(args []string) options {
	fs := flag.NewFlagSet("sampler-start", flag.ExitOnError)
	var o options
	fs.StringVar(&o.namespace, "namespace", "default", "Target namespace to sample (Cloud: fully-qualified <namespace>.<account>)")
	fs.IntVar(&o.samplePercent, "sample-percent", 10, "Percent of each type's executions to sample")
	fs.IntVar(&o.minPerType, "min-per-type", 5, "Minimum executions to sample per type")
	fs.IntVar(&o.buckets, "buckets", 1, "Equal-width time buckets over [--since, --until] (1 = a single total). >1 requires --since")
	fs.StringVar(&o.since, "since", "", "StartTime lower bound / bucket epoch: RFC3339 or duration like 24h")
	fs.StringVar(&o.until, "until", "", "StartTime upper bound / bucket window end: RFC3339 or duration (defaults to now, which discovery needs as its stratification bound)")
	fs.StringVar(&o.status, "status", "", "ExecutionStatus filter (e.g. Running, Completed, Failed)")
	fs.StringVar(&o.out, "out", "./", "Output path for the observed-graph JSON (a directory receives observed-graph.json)")

	fs.IntVar(&o.batchSize, "batch-size", temporalsampler.DefaultBatchSize, "Executions folded per FetchFoldHistoryActivity call")
	fs.IntVar(&o.batchesPerRun, "batches-per-run", 0, "Batches a SampleTypeWorkflow processes before continue-as-new (0 = unbounded)")
	fs.IntVar(&o.typeConcurrency, "type-concurrency", 4, "Max in-flight SampleTypeWorkflow children")
	fs.IntVar(&o.execConcurrency, "exec-concurrency", 8, "Max in-flight FetchFoldHistoryActivity per type")

	fs.StringVar(&o.workflowTypes, "workflow-types", "", "Comma-separated workflow types to sample, skipping discovery entirely. Prefer this when the types are known (they are compiled into your workers) — it is exhaustive and free, whereas discovery only finds what it samples")
	fs.IntVar(&o.discoveryProbes, "discovery-probes", sampling.DefaultProbes, "Stratified time slices probed to discover workflow types (one ListWorkflow call each). Ignored with --workflow-types")
	fs.IntVar(&o.discoveryPageSize, "discovery-page-size", sampling.DefaultPageSize, "Executions read per discovery probe")
	fs.Int64Var(&o.discoverySeed, "discovery-seed", 0, "Seed for discovery probe placement (0 = derive from the clock). Pin it to reproduce a run's exact sample")
	fs.IntVar(&o.discoveryMaxRounds, "discovery-max-rounds", sampling.DefaultMaxRounds, "Cap on discovery's exclusion rounds. Each round finds at least one new type, so this bounds how many distinct types can be discovered")

	fs.StringVar(&o.temporalHostPort, "temporal-hostport", client.DefaultHostPort, "host:port of the sampler's own Temporal (control plane)")
	fs.StringVar(&o.temporalNamespace, "temporal-namespace", "default", "Namespace the sampler workflows run in (control plane)")
	fs.StringVar(&o.taskQueue, "task-queue", temporalsampler.TaskQueue, "Task queue the sampler worker polls")
	fs.StringVar(&o.workflowID, "workflow-id", "", "Workflow ID for the run (default: sample-<namespace>-<unix>)")
	_ = fs.Parse(args)
	return o
}

func run(ctx context.Context, o options) error {
	now := time.Now()

	// Pin an open upper bound to now. Discovery stratifies its probes over
	// [since, until], so an unbounded until has nothing to slice and collapses
	// all --discovery-probes into a single probe of the most recent executions —
	// silently gutting type discovery on exactly the large namespaces it exists
	// for.
	until := o.until
	if until == "" {
		until = now.UTC().Format(time.RFC3339)
	}

	window, err := temporalsampler.ResolveWindow(o.since, until, o.buckets, now)
	if err != nil {
		return err
	}

	c, err := client.Dial(client.Options{HostPort: o.temporalHostPort, Namespace: o.temporalNamespace})
	if err != nil {
		return fmt.Errorf("dial sampler Temporal at %s: %w", o.temporalHostPort, err)
	}
	defer c.Close()

	wfID := o.workflowID
	if wfID == "" {
		wfID = fmt.Sprintf("sample-%s-%d", sanitize(o.namespace), time.Now().Unix())
	}

	seed := o.discoverySeed
	if seed == 0 {
		seed = now.UnixNano()
	}

	req := temporalsampler.SampleRequest{
		Namespace:       o.namespace,
		Window:          window,
		Status:          o.status,
		SamplePercent:   o.samplePercent,
		MinPerType:      o.minPerType,
		BatchSize:       o.batchSize,
		BatchesPerRun:   o.batchesPerRun,
		TypeConcurrency: o.typeConcurrency,
		ExecConcurrency: o.execConcurrency,

		Discovery: temporalsampler.DiscoveryOptions{
			WorkflowTypes: splitTypes(o.workflowTypes),
			Probes:        o.discoveryProbes,
			PageSize:      o.discoveryPageSize,
			MaxRounds:     o.discoveryMaxRounds,
			// Resolved HERE, like the window: fixing the seed in workflow input
			// keeps probe placement stable across replays and continue-as-new.
			Seed: seed,
		},
	}

	we, err := c.ExecuteWorkflow(ctx, client.StartWorkflowOptions{
		ID:        wfID,
		TaskQueue: o.taskQueue,
	}, temporalsampler.SampleNamespaceWorkflow, req)
	if err != nil {
		return fmt.Errorf("start workflow: %w", err)
	}
	fmt.Fprintf(os.Stderr, "sampler-start: started %s (run %s); waiting for result…\n", we.GetID(), we.GetRunID())
	fmt.Fprintf(os.Stderr, "  query progress: temporal workflow query --workflow-id %s --type %s\n", we.GetID(), temporalsampler.GetProgressQuery)

	var res temporalsampler.SampleResult
	if err := we.Get(ctx, &res); err != nil {
		return fmt.Errorf("workflow result: %w", err)
	}
	if res.Graph == nil {
		return fmt.Errorf("workflow returned no observed graph")
	}

	path := resolveOutPath(o.out)
	if err := writeObservedGraph(path, res.Graph, res.Coverage); err != nil {
		return fmt.Errorf("write %s: %w", path, err)
	}
	fmt.Fprintf(os.Stderr, "sampler-start: %d node(s), %d edge(s); wrote %s\n",
		res.Graph.Summary.Nodes, res.Graph.Summary.Edges, path)

	// Say plainly whether the graph is the whole system. An incomplete type list
	// means whole workflows are missing from the output, and nothing in the graph
	// itself would reveal that.
	if res.Coverage.Exhaustive {
		fmt.Fprintf(os.Stderr, "sampler-start: coverage: all %d workflow type(s) in the window accounted for\n", res.Coverage.Types)
	} else {
		fmt.Fprintf(os.Stderr, "sampler-start: WARNING: coverage is NOT exhaustive — %d execution(s) have a workflow type this sample never identified, so the graph is missing them. Raise --discovery-probes/--discovery-max-rounds, widen the window, or pass --workflow-types.\n", res.Coverage.Remaining)
	}
	return nil
}

// resolveOutPath treats an existing directory (or a trailing-separator path) as
// the destination folder for observed-graph.json; anything else is the file path.
func resolveOutPath(out string) string {
	if info, err := os.Stat(out); err == nil && info.IsDir() {
		return filepath.Join(out, "observed-graph.json")
	}
	if strings.HasSuffix(out, string(os.PathSeparator)) {
		return filepath.Join(out, "observed-graph.json")
	}
	return out
}

func writeObservedGraph(path string, og *observe.ObservedGraph, coverage temporalsampler.TypeCoverage) error {
	data, err := json.MarshalIndent(output{ObservedGraph: og, Coverage: coverage}, "", "  ")
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

// sanitize makes a namespace safe for a workflow-id fragment.
// splitTypes parses the comma-separated --workflow-types list, dropping empty
// entries so a trailing comma or an unset flag yields nil (= run discovery).
func splitTypes(s string) []string {
	var out []string
	for _, t := range strings.Split(s, ",") {
		if t = strings.TrimSpace(t); t != "" {
			out = append(out, t)
		}
	}
	return out
}

func sanitize(s string) string {
	return strings.NewReplacer("/", "_", " ", "_").Replace(s)
}
