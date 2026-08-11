//go:build integration

package integration

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"go.temporal.io/sdk/client"
	"go.temporal.io/sdk/worker"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/observe"
	"github.com/jmbarzee/temporal-architect/tools/sampler/history"
	"github.com/jmbarzee/temporal-architect/tools/sampler/sampling"
	temporalsampler "github.com/jmbarzee/temporal-architect/tools/sampler/temporal"
)

// envelope mirrors the single-key JSON both CLIs write, so the two paths are
// compared exactly as they land on disk.
type envelope struct {
	ObservedGraph *observe.ObservedGraph `json:"observedGraph"`
}

// TestWorkflowSamplerReproducesSingleProcess is the acceptance test for the
// parallel rebuild: the SampleNamespaceWorkflow fan-out + observe.Merge fan-in
// must reproduce, byte-for-byte after Finalize, the observed graph the
// single-process sampling.Sample → history.Build path produces for the same
// inputs. It uses an exhaustive sample (100% + a huge MinPerType) so both paths
// select the identical execution set, isolating the test to the correctness of
// the parallel fold. Fixtures are activity-only (no cross-history signals), so
// per-batch folding equals the whole-set fold.
func TestWorkflowSamplerReproducesSingleProcess(t *testing.T) {
	if testing.Short() {
		t.Skip("integration: skipped in -short mode")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	// The sampler's control plane runs in its OWN namespace, separate from the
	// target being sampled — otherwise the in-flight SampleNamespaceWorkflow tree
	// would enumerate itself. (This mirrors the design's two-namespace split.)
	const controlNamespace = "sampler-cp"
	srv := startDevServer(ctx, t, []string{defaultNamespace, controlNamespace})
	defer func() { _ = srv.Stop() }()

	cl, err := client.Dial(client.Options{HostPort: srv.FrontendHostPort(), Namespace: defaultNamespace})
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer cl.Close()

	clControl, err := client.Dial(client.Options{HostPort: srv.FrontendHostPort(), Namespace: controlNamespace})
	if err != nil {
		t.Fatalf("dial control: %v", err)
	}
	defer clControl.Close()

	// --- Fixtures: two workflow types on one queue, mixed branches. ---
	const tq = "e2e-app-tq"
	appWorker := worker.New(cl, tq, worker.Options{})
	registerBranching(appWorker)
	appWorker.RegisterWorkflow(MultiTypeAlpha)
	if err := appWorker.Start(); err != nil {
		t.Fatalf("start app worker: %v", err)
	}
	defer appWorker.Stop()

	var starts []StartSpec
	branches := [][]interface{}{{0}, {1}, {2}, {0}, {2}}
	starts = append(starts, func() []StartSpec {
		out := make([]StartSpec, 0, len(branches))
		for i, b := range branches {
			out = append(out, StartSpec{ID: itoa("e2e-branch-", i), TaskQueue: tq, Workflow: BranchingWorkflow, Args: b})
		}
		return out
	}()...)
	for i := 0; i < 3; i++ {
		starts = append(starts, StartSpec{ID: itoa("e2e-alpha-", i), TaskQueue: tq, Workflow: MultiTypeAlpha})
	}

	runs := make([]client.WorkflowRun, 0, len(starts))
	for _, s := range starts {
		run, err := cl.ExecuteWorkflow(ctx, client.StartWorkflowOptions{ID: s.ID, TaskQueue: s.TaskQueue}, s.Workflow, s.Args...)
		if err != nil {
			t.Fatalf("execute %q: %v", s.ID, err)
		}
		runs = append(runs, run)
	}
	for i, run := range runs {
		if err := run.Get(ctx, nil); err != nil {
			t.Fatalf("workflow %q: %v", starts[i].ID, err)
		}
	}
	waitForVisibleCount(ctx, t, cl, defaultNamespace, len(starts))

	// A single, shared window so both paths lay buckets on identical boundaries.
	window, err := temporalsampler.ResolveWindow("", "", 1, time.Now())
	if err != nil {
		t.Fatalf("resolve window: %v", err)
	}

	// Activities reach the target namespace via the transport package, which
	// reads SAMPLER_* from the environment; point it at this dev server.
	t.Setenv("SAMPLER_ADDRESS", srv.FrontendHostPort())
	t.Setenv("SAMPLER_TRANSPORT", "grpc")

	samplerWorker := worker.New(clControl, temporalsampler.TaskQueue, worker.Options{})
	samplerWorker.RegisterWorkflow(temporalsampler.SampleNamespaceWorkflow)
	samplerWorker.RegisterWorkflow(temporalsampler.EnumerateTypesWorkflow)
	samplerWorker.RegisterWorkflow(temporalsampler.SampleTypeWorkflow)
	samplerWorker.RegisterActivity(temporalsampler.NewActivities())
	if err := samplerWorker.Start(); err != nil {
		t.Fatalf("start sampler worker: %v", err)
	}
	defer samplerWorker.Stop()

	// compare runs both paths with the same sampling knobs and asserts the
	// serialized graphs match exactly.
	compare := func(t *testing.T, id string, samplePercent, minPerType int) {
		t.Helper()

		// --- Path 1: the existing single-process sampler. ---
		hs, err := sampling.Sample(ctx, cl, sampling.Options{
			Namespace:     defaultNamespace,
			SamplePercent: samplePercent,
			MinPerType:    minPerType,
		})
		if err != nil {
			t.Fatalf("single-process sample: %v", err)
		}
		single := history.Build(hs, history.Options{Namespace: defaultNamespace, Window: window})

		// --- Path 2: the parallel Temporal workflow. ---
		run, err := clControl.ExecuteWorkflow(ctx, client.StartWorkflowOptions{
			ID:        id,
			TaskQueue: temporalsampler.TaskQueue,
		}, temporalsampler.SampleNamespaceWorkflow, temporalsampler.SampleRequest{
			Namespace:       defaultNamespace,
			Window:          window,
			SamplePercent:   samplePercent,
			MinPerType:      minPerType,
			BatchSize:       2, // multiple leaf activities per type → exercises the fold
			TypeConcurrency: 3,
			ExecConcurrency: 4,
		})
		if err != nil {
			t.Fatalf("start SampleNamespaceWorkflow: %v", err)
		}
		var result temporalsampler.SampleResult
		if err := run.Get(ctx, &result); err != nil {
			t.Fatalf("SampleNamespaceWorkflow result: %v", err)
		}
		parallel := result.Graph

		// These fixtures are the whole namespace, so discovery's exclusion loop
		// must be able to PROVE it found every type — the assurance the artifact
		// carries is only worth anything if it is actually verified somewhere.
		if !result.Coverage.Exhaustive {
			t.Errorf("coverage should be exhaustive over a closed fixture set, got %+v", result.Coverage)
		}
		if result.Coverage.Types != 2 {
			t.Errorf("coverage types = %d, want 2", result.Coverage.Types)
		}

		// --- The proof: byte-for-byte identical envelopes. ---
		wantJSON, err := json.MarshalIndent(envelope{ObservedGraph: single}, "", "  ")
		if err != nil {
			t.Fatal(err)
		}
		gotJSON, err := json.MarshalIndent(envelope{ObservedGraph: parallel}, "", "  ")
		if err != nil {
			t.Fatal(err)
		}
		if string(wantJSON) != string(gotJSON) {
			t.Fatalf("parallel observed graph differs from single-process.\n--- single-process ---\n%s\n--- parallel ---\n%s", wantJSON, gotJSON)
		}
	}

	// Exhaustive: both paths necessarily select every execution, so this
	// isolates the correctness of the parallel fold itself.
	t.Run("exhaustive", func(t *testing.T) {
		compare(t, "sample-namespace-e2e-exhaustive", 100, 1<<20)
	})

	// Partial: 2 of 5 Branching and 2 of 3 Alpha executions, so the two paths
	// agree only if they SELECT the same subset — a constraint an exhaustive
	// sample structurally cannot check. This is the coverage gap that let the
	// paths drift apart (single-process selecting from the enumeration scan's
	// candidates while the parallel path re-queried per type); both now go
	// through sampling.SelectExecutions.
	//
	// NOTE: these fixtures are all COMPLETED, so the prefer-running pass in
	// queryByType is never exercised. A mixed running/closed fixture would
	// constrain selection harder and is the obvious next hardening step.
	t.Run("partial", func(t *testing.T) {
		compare(t, "sample-namespace-e2e-partial", 0, 2)
	})
}

// itoa builds a stable "<prefix><n>" id without importing strconv at call sites.
func itoa(prefix string, n int) string {
	digits := ""
	if n == 0 {
		digits = "0"
	}
	for n > 0 {
		digits = string(rune('0'+n%10)) + digits
		n /= 10
	}
	return prefix + digits
}
