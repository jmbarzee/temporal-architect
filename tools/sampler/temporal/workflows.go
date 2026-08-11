package temporal

import (
	"fmt"
	"time"

	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/observe"
	"github.com/jmbarzee/temporal-architect/tools/sampler/sampling"
)

// SampleNamespaceWorkflow is the orchestrator (one per sample run): discover
// the types (child), fan out one SampleTypeWorkflow per type with bounded
// concurrency, fold the per-type ObservedGraphs with observe.Merge, and return
// the merged graph PLUS its coverage assurance to the starter (which writes
// observed-graph.json).
//
// Determinism: no clock reads (the Window is already absolute in the input) and
// no server IO — the only IO is inside the activities the children invoke; the
// observe.Merge fold here is pure. The same req.Window is threaded UNCHANGED
// into every child so every partial is index-aligned.
func SampleNamespaceWorkflow(ctx workflow.Context, req SampleRequest) (*SampleResult, error) {
	log := workflow.GetLogger(ctx)

	prog := SampleProgress{PerType: map[string]TypeProgress{}}
	if err := workflow.SetQueryHandler(ctx, GetProgressQuery, func() (SampleProgress, error) {
		return prog, nil
	}); err != nil {
		return nil, err
	}

	// --- Phase A: discover types (child wraps the discovery activity) ---
	var discovery TypeDiscovery
	enumReq := EnumerateRequest{
		Namespace: req.Namespace,
		Window:    req.Window,
		Status:    req.Status,
		Discovery: req.Discovery,
	}
	if err := workflow.ExecuteChildWorkflow(ctx, EnumerateTypesWorkflow, enumReq).Get(ctx, &discovery); err != nil {
		return nil, fmt.Errorf("discover types: %w", err)
	}
	typeCounts := discovery.TypeCounts
	prog.TypesTotal = len(typeCounts)
	prog.Coverage = discovery.Coverage
	log.Info("discovered types",
		"namespace", req.Namespace,
		"types", len(typeCounts),
		"exhaustive", discovery.Coverage.Exhaustive,
		"remaining", discovery.Coverage.Remaining)

	// --- Phase B: bounded fan-out of one SampleTypeWorkflow child per type ---
	k := req.TypeConcurrency
	if k < 1 {
		k = 1
	}
	sem := workflow.NewSemaphore(ctx, int64(k))
	wg := workflow.NewWaitGroup(ctx)
	samples := make([]TypeSample, len(typeCounts))
	errs := make([]error, len(typeCounts))

	for i, tc := range typeCounts {
		if err := sem.Acquire(ctx, 1); err != nil {
			return nil, err
		}
		i, tc := i, tc
		wg.Add(1)
		workflow.Go(ctx, func(gctx workflow.Context) {
			defer wg.Done()
			defer sem.Release(1)

			childReq := SampleTypeRequest{
				Namespace:       req.Namespace,
				WorkflowType:    tc.WorkflowType,
				Target:          sampling.SampleTarget(tc.Count, req.SamplePercent, req.MinPerType),
				Status:          req.Status,
				Window:          req.Window,
				BatchSize:       req.BatchSize,
				BatchesPerRun:   req.BatchesPerRun,
				ExecConcurrency: req.ExecConcurrency,
			}
			var sample TypeSample
			err := workflow.ExecuteChildWorkflow(gctx, SampleTypeWorkflow, childReq).Get(gctx, &sample)
			samples[i] = sample
			errs[i] = err
			if err == nil {
				// Live progress as each child finishes (safe: workflow
				// coroutines are cooperatively scheduled, single-threaded).
				prog.TypesDone++
				prog.ExecutionsSampled += sample.Sampled
				prog.PerType[tc.WorkflowType] = TypeProgress{Sampled: sample.Sampled, Target: sample.Target}
			}
		})
	}
	wg.Wait(ctx)

	// --- Phase C: fold the per-type graphs (deterministic index order) ---
	merged := observe.New()
	for i := range typeCounts {
		if errs[i] != nil {
			return nil, fmt.Errorf("sample type %q: %w", typeCounts[i].WorkflowType, errs[i])
		}
		merged = observe.Merge(merged, samples[i].Graph)
	}
	// Merge inherits its Window from the (empty) accumulator, so stamp the real
	// one to stay byte-identical to single-process history.Build output.
	merged.Window = normalizeWindow(req.Window)
	log.Info("merged sample",
		"types", len(typeCounts),
		"nodes", merged.Summary.Nodes,
		"edges", merged.Summary.Edges,
		"executionsSampled", prog.ExecutionsSampled,
		"exhaustive", discovery.Coverage.Exhaustive)
	return &SampleResult{Graph: merged, Coverage: discovery.Coverage}, nil
}

// EnumerateTypesWorkflow is a thin child around the discovery activity, so
// "find the types" is its own node in the Web UI progress tree with its own
// failure/retry boundary. Returns the sized type list plus the coverage
// assurance describing how complete it is.
func EnumerateTypesWorkflow(ctx workflow.Context, req EnumerateRequest) (*TypeDiscovery, error) {
	ctx = workflow.WithActivityOptions(ctx, enumerateActivityOptions())
	var a *Activities
	var out TypeDiscovery
	if err := workflow.ExecuteActivity(ctx, a.EnumerateTypes, req).Get(ctx, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// SampleTypeWorkflow samples one workflow type: select its candidate executions
// once, fan out the leaf activity over them (batched + bounded to
// ExecConcurrency), fold the partials with observe.Merge, and return the
// per-type graph. Uses continue-as-new to bound its own history when a type has
// many candidates — it processes up to BatchesPerRun batches per run, carrying
// the already-folded partial + a cursor forward.
func SampleTypeWorkflow(ctx workflow.Context, req SampleTypeRequest) (TypeSample, error) {
	log := workflow.GetLogger(ctx)

	if err := workflow.SetQueryHandler(ctx, GetTypeProgressQuery, func() (TypeProgress, error) {
		return TypeProgress{Sampled: req.Processed, Target: req.Target}, nil
	}); err != nil {
		return TypeSample{}, err
	}

	var a *Activities

	// First run selects candidates once; continue-as-new runs carry them (plus
	// the running partial + cursor) forward, so selection is not re-queried.
	if req.Candidates == nil {
		selCtx := workflow.WithActivityOptions(ctx, selectActivityOptions())
		selReq := SelectRequest{
			Namespace:    req.Namespace,
			WorkflowType: req.WorkflowType,
			Target:       req.Target,
			Status:       req.Status,
			Window:       req.Window,
		}
		var selected []sampling.Execution
		if err := workflow.ExecuteActivity(selCtx, a.SelectCandidates, selReq).Get(ctx, &selected); err != nil {
			return TypeSample{}, err
		}
		if selected == nil {
			// Non-nil so a "no candidates" type doesn't re-select forever.
			selected = []sampling.Execution{}
		}
		req.Candidates = selected
		req.Accumulated = observe.New()
		req.Processed = 0
	}

	// Take up to BatchesPerRun batches this run and fan out the leaf activity,
	// bounded to ExecConcurrency in-flight.
	wave := nextBatches(req.Candidates, req.Processed, req.BatchSize, req.BatchesPerRun)
	fetchCtx := workflow.WithActivityOptions(ctx, fetchActivityOptions())

	kc := req.ExecConcurrency
	if kc < 1 {
		kc = 1
	}
	sem := workflow.NewSemaphore(ctx, int64(kc))
	wg := workflow.NewWaitGroup(ctx)
	graphs := make([]*observe.ObservedGraph, len(wave))
	errs := make([]error, len(wave))

	for i, batch := range wave {
		if err := sem.Acquire(ctx, 1); err != nil {
			return TypeSample{}, err
		}
		i, batch := i, batch
		wg.Add(1)
		workflow.Go(ctx, func(gctx workflow.Context) {
			defer wg.Done()
			defer sem.Release(1)
			fetchReq := FetchRequest{Namespace: req.Namespace, Executions: batch, Window: req.Window}
			var g *observe.ObservedGraph
			errs[i] = workflow.ExecuteActivity(fetchCtx, a.FetchFoldHistory, fetchReq).Get(gctx, &g)
			graphs[i] = g
		})
	}
	wg.Wait(ctx)

	for i := range wave {
		if errs[i] != nil {
			return TypeSample{}, fmt.Errorf("fetch/fold %q batch %d: %w", req.WorkflowType, i, errs[i])
		}
		req.Accumulated = observe.Merge(req.Accumulated, graphs[i])
		req.Processed += len(wave[i])
	}
	log.Info("sampled type wave", "workflowType", req.WorkflowType, "processed", req.Processed, "candidates", len(req.Candidates))

	// More candidates remain → reset history and continue; else return the graph.
	if req.Processed < len(req.Candidates) {
		return TypeSample{}, workflow.NewContinueAsNewError(ctx, SampleTypeWorkflow, req)
	}
	// Stamp the real Window (Merge inherited it from the empty accumulator).
	req.Accumulated.Window = normalizeWindow(req.Window)
	return TypeSample{Graph: req.Accumulated, Sampled: req.Processed, Target: req.Target}, nil
}

// ---------------------------------------------------------------------------
// Activity option presets
// ---------------------------------------------------------------------------

func enumerateActivityOptions() workflow.ActivityOptions {
	return workflow.ActivityOptions{
		StartToCloseTimeout: 5 * time.Minute,
		HeartbeatTimeout:    60 * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			InitialInterval:    2 * time.Second,
			BackoffCoefficient: 2.0,
			MaximumAttempts:    5,
		},
	}
}

func selectActivityOptions() workflow.ActivityOptions {
	return workflow.ActivityOptions{
		StartToCloseTimeout: 5 * time.Minute,
		HeartbeatTimeout:    60 * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			InitialInterval:    2 * time.Second,
			BackoffCoefficient: 2.0,
			MaximumAttempts:    5,
		},
	}
}

func fetchActivityOptions() workflow.ActivityOptions {
	return workflow.ActivityOptions{
		StartToCloseTimeout: 10 * time.Minute,
		HeartbeatTimeout:    60 * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			InitialInterval:    2 * time.Second,
			BackoffCoefficient: 2.0,
			MaximumInterval:    30 * time.Second,
			MaximumAttempts:    5,
		},
	}
}
