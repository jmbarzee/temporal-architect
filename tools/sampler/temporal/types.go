// Package temporal is the durable twin of the single-process sampler CLI: it
// pulls a representative sample of a namespace's workflow histories as a
// Temporal workflow tree (SampleNamespaceWorkflow → EnumerateTypesWorkflow +
// per-type SampleTypeWorkflow → FetchFoldHistoryActivity), so the pull gets the
// Web UI's live child/activity progress tree, a queryable progress handler,
// durability/retries, and bounded fan-out concurrency.
//
// It reuses the sampler's existing seams verbatim: sampling.Enumerate /
// SelectExecutions / SampleTarget for the query math, history.Build for the
// history→graph fold, and observe.Merge for the associative fan-in. All
// target-namespace IO is confined to the activities (which build the backend
// worker-side via the transport package); workflow code stays pure and
// deterministic. See sample-namespace.twf for the design.
package temporal

import (
	"fmt"
	"time"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/observe"
	"github.com/jmbarzee/temporal-architect/tools/sampler/sampling"
)

// TaskQueue is the task queue the sampler's own worker polls (the sampler
// control plane — distinct from the target namespace being sampled).
const TaskQueue = "sampler"

// Workflow / query names, centralized so the starter and tests don't drift from
// registration.
const (
	SampleNamespaceWorkflowName = "SampleNamespaceWorkflow"
	EnumerateTypesWorkflowName  = "EnumerateTypesWorkflow"
	SampleTypeWorkflowName      = "SampleTypeWorkflow"

	GetProgressQuery     = "GetProgress"
	GetTypeProgressQuery = "GetTypeProgress"
)

// SampleRequest is the input to SampleNamespaceWorkflow. The starter resolves
// --since/--until to an ABSOLUTE Window (RFC3339) before submitting, so the
// window never drifts on replay and every partial graph is index-aligned for
// observe.Merge. Concurrency knobs bound in-workflow fan-out (paired with the
// worker's MaxConcurrent* limits).
type SampleRequest struct {
	Namespace     string         `json:"namespace"`
	Window        observe.Window `json:"window"`
	Status        string         `json:"status,omitempty"`
	SamplePercent int            `json:"samplePercent"`
	MinPerType    int            `json:"minPerType"`

	// BatchSize is how many executions one FetchFoldHistoryActivity folds; 0
	// defaults to DefaultBatchSize. BatchesPerRun caps batches processed before a
	// SampleTypeWorkflow continues-as-new to bound its history; 0 = unbounded.
	BatchSize     int `json:"batchSize"`
	BatchesPerRun int `json:"batchesPerRun"`

	// TypeConcurrency bounds in-flight SampleTypeWorkflow children;
	// ExecConcurrency bounds in-flight FetchFoldHistoryActivity per type. Both
	// default to 1 when <= 0.
	TypeConcurrency int `json:"typeConcurrency"`
	ExecConcurrency int `json:"execConcurrency"`

	// Discovery configures how the workflow type list is found (see
	// sampling.DiscoveryPolicy). No Temporal server supports counting GROUP BY
	// WorkflowType, so the type list comes from a bounded random sample of the
	// window rather than a grouped count or an O(executions) scan.
	Discovery DiscoveryOptions `json:"discovery"`
}

// DiscoveryOptions is the wire form of sampling.DiscoveryPolicy. Seed is
// resolved by the STARTER (like the window) so it is fixed in workflow input:
// replays and continue-as-new then probe the identical slices.
type DiscoveryOptions struct {
	// WorkflowTypes short-circuits discovery. Prefer this whenever the types are
	// known — they are compiled into the workers, so a service registry, the
	// codebase, or `tctl`-style worker metadata is a cheaper and exhaustive
	// source than inferring them from execution data.
	WorkflowTypes []string `json:"workflowTypes,omitempty"`
	// Probes is the discovery call budget: one ListWorkflow per stratified time
	// slice. 0 uses sampling.DefaultProbes.
	Probes int `json:"probes"`
	// PageSize is executions read per probe. 0 uses sampling.DefaultPageSize.
	PageSize int `json:"pageSize"`
	// Seed fixes probe placement.
	Seed int64 `json:"seed"`
	// MaxRounds caps discovery's exclusion loop. 0 uses
	// sampling.DefaultMaxRounds.
	MaxRounds int `json:"maxRounds"`
}

// policy converts the wire options to the sampling policy.
func (d DiscoveryOptions) policy() sampling.DiscoveryPolicy {
	return sampling.DiscoveryPolicy{
		ExplicitTypes: d.WorkflowTypes,
		Probes:        d.Probes,
		PageSize:      int32(d.PageSize),
		Seed:          d.Seed,
		MaxRounds:     d.MaxRounds,
	}
}

// DefaultBatchSize is the fallback executions-per-fetch when BatchSize <= 0.
const DefaultBatchSize = 20

// TypeCoverage is the sample's self-assessment of its own type list — the
// assurance that makes an ObservedGraph interpretable.
//
// A type that was never discovered is a subgraph missing from the output, and
// nothing in the graph itself distinguishes that from a system which genuinely
// has no such workflow. Discovery can PROVE completeness (see
// sampling.DiscoverTypes: when a Count of everything excluding the known types
// returns zero, no other type exists in the window), so that proof is carried
// with the result instead of being left in a log.
type TypeCoverage struct {
	// Types is how many distinct workflow types the sample covers.
	Types int `json:"types"`
	// Exhaustive means the type list is PROVEN complete for the window: zero
	// executions remain whose type is not in the list. False means the sample
	// may be missing whole workflows.
	Exhaustive bool `json:"exhaustive"`
	// Remaining is how many executions have a type that was never identified —
	// the size of the blind spot when Exhaustive is false.
	Remaining int64 `json:"remaining"`
	// Rounds / Calls are what discovery cost, for tuning the probe budget.
	Rounds int `json:"rounds"`
	Calls  int `json:"calls"`
	// Source is "explicit" when the caller supplied the type list (in which case
	// the coverage fields are a verification of THEIR list) or "discovered".
	Source string `json:"source"`
}

// Coverage source values.
const (
	CoverageDiscovered = "discovered"
	CoverageExplicit   = "explicit"
)

// TypeDiscovery is what EnumerateTypesActivity / EnumerateTypesWorkflow return:
// the sized type list plus the assurance describing how complete it is.
type TypeDiscovery struct {
	TypeCounts []sampling.TypeCount `json:"typeCounts"`
	Coverage   TypeCoverage         `json:"coverage"`
}

// SampleResult is what SampleNamespaceWorkflow returns. The graph and the
// caveat that qualifies it are one artifact deliberately: a caller should not be
// able to hold the graph without the coverage that says whether it is the whole
// system.
type SampleResult struct {
	Graph    *observe.ObservedGraph `json:"observedGraph"`
	Coverage TypeCoverage           `json:"coverage"`
}

// EnumerateRequest is the input to EnumerateTypesWorkflow / EnumerateTypes.
type EnumerateRequest struct {
	Namespace string         `json:"namespace"`
	Window    observe.Window `json:"window"`
	Status    string         `json:"status,omitempty"`

	// Discovery is threaded from SampleRequest.
	Discovery DiscoveryOptions `json:"discovery"`
}

// SelectRequest is the input to SelectCandidatesActivity.
type SelectRequest struct {
	Namespace    string         `json:"namespace"`
	WorkflowType string         `json:"workflowType"`
	Target       int            `json:"target"`
	Status       string         `json:"status,omitempty"`
	Window       observe.Window `json:"window"`
}

// FetchRequest is the input to FetchFoldHistoryActivity: one batch of executions
// to download and fold into a partial ObservedGraph, built with Window so it is
// mergeable with every other partial.
type FetchRequest struct {
	Namespace  string               `json:"namespace"`
	Executions []sampling.Execution `json:"executions"`
	Window     observe.Window       `json:"window"`
}

// FetchProgress is the heartbeat detail FetchFoldHistoryActivity records while
// paginating, so a long batch is observable (and resumable) in the Web UI.
type FetchProgress struct {
	Executions int `json:"executions"` // executions fully downloaded so far
	Events     int `json:"events"`     // events downloaded for the current execution
	Pages      int `json:"pages"`      // history pages fetched so far
}

// SampleTypeRequest is the input to SampleTypeWorkflow. Candidates/Accumulated/
// Processed are the continue-as-new carry: nil Candidates means "first run,
// select them"; a non-nil slice is threaded forward across CAN runs so
// selection is not re-queried and the running partial + cursor survive.
type SampleTypeRequest struct {
	Namespace    string         `json:"namespace"`
	WorkflowType string         `json:"workflowType"`
	Target       int            `json:"target"`
	Status       string         `json:"status,omitempty"`
	Window       observe.Window `json:"window"`

	BatchSize       int `json:"batchSize"`
	BatchesPerRun   int `json:"batchesPerRun"`
	ExecConcurrency int `json:"execConcurrency"`

	Candidates  []sampling.Execution   `json:"candidates,omitempty"`
	Accumulated *observe.ObservedGraph `json:"accumulated,omitempty"`
	Processed   int                    `json:"processed"`
}

// TypeSample is what SampleTypeWorkflow returns: the per-type ObservedGraph plus
// the count actually sampled (for the parent's progress + fold). Target is
// echoed so the parent can fill perType without recomputation.
type TypeSample struct {
	Graph   *observe.ObservedGraph `json:"graph"`
	Sampled int                    `json:"sampled"`
	Target  int                    `json:"target"`
}

// SampleProgress is the GetProgress query result on SampleNamespaceWorkflow —
// the point of the rebuild: progress beyond the free Web UI tree.
type SampleProgress struct {
	TypesTotal        int                     `json:"typesTotal"`
	TypesDone         int                     `json:"typesDone"`
	ExecutionsSampled int                     `json:"executionsSampled"`
	PerType           map[string]TypeProgress `json:"perType"`
	// Coverage is populated once discovery finishes, so an operator can see
	// mid-run whether the type list was proven complete instead of finding out
	// after the sample lands.
	Coverage TypeCoverage `json:"coverage"`
}

// TypeProgress is one type's sampled-vs-target progress (GetTypeProgress on
// SampleTypeWorkflow, and the perType entries of SampleProgress).
type TypeProgress struct {
	Sampled int `json:"sampled"`
	Target  int `json:"target"`
}

// nextBatches returns up to batchesPerRun batches of up to batchSize executions,
// starting at offset processed into candidates. batchSize <= 0 defaults to
// DefaultBatchSize; batchesPerRun <= 0 means "all remaining batches this run".
// Pure and deterministic — safe to call from workflow code.
func nextBatches(candidates []sampling.Execution, processed, batchSize, batchesPerRun int) [][]sampling.Execution {
	if batchSize <= 0 {
		batchSize = DefaultBatchSize
	}
	var batches [][]sampling.Execution
	for i := processed; i < len(candidates); i += batchSize {
		if batchesPerRun > 0 && len(batches) >= batchesPerRun {
			break
		}
		end := i + batchSize
		if end > len(candidates) {
			end = len(candidates)
		}
		batches = append(batches, candidates[i:end])
	}
	return batches
}

// ResolveWindow turns the raw --since/--until flag values (RFC3339 or a duration
// like "24h") and a bucket count into an ABSOLUTE observe.Window (RFC3339
// strings), so the starter can pin the window before submitting and everything
// downstream inherits stable, index-aligned bucket boundaries. Mirrors the
// single-process CLI's window resolution.
func ResolveWindow(sinceFlag, untilFlag string, buckets int, now time.Time) (observe.Window, error) {
	since, err := parseTimeFlag(sinceFlag, now)
	if err != nil {
		return observe.Window{}, fmt.Errorf("since: %w", err)
	}
	until, err := parseTimeFlag(untilFlag, now)
	if err != nil {
		return observe.Window{}, fmt.Errorf("until: %w", err)
	}
	if buckets < 1 {
		buckets = 1
	}
	if buckets > 1 && since.IsZero() {
		return observe.Window{}, fmt.Errorf("buckets %d requires since (the bucket epoch)", buckets)
	}

	w := observe.Window{Buckets: buckets}
	if !since.IsZero() {
		w.Since = since.UTC().Format(time.RFC3339)
	}
	switch {
	case buckets > 1:
		end := until
		if end.IsZero() {
			end = now
		}
		w.Until = end.UTC().Format(time.RFC3339)
	case !until.IsZero():
		w.Until = until.UTC().Format(time.RFC3339)
	}
	return w, nil
}

// normalizeWindow returns the Window exactly as history.Build stamps it onto an
// ObservedGraph (Buckets clamped to >= 1, Since/Until unchanged). observe.Merge
// takes its Window from the left operand, and folding starts from an empty
// observe.New() (Buckets 0), so the merged result must be re-stamped with this
// to stay byte-identical to the single-process history.Build output.
func normalizeWindow(w observe.Window) observe.Window {
	n := w.Buckets
	if n < 1 {
		n = 1
	}
	return observe.Window{Since: w.Since, Until: w.Until, Buckets: n}
}

// parseTimeFlag interprets a --since/--until value as an RFC3339 timestamp or a
// Go duration (relative to now). Empty yields the zero time (unbounded).
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

// selectorFromWindow parses a Window's absolute RFC3339 bounds (plus a status)
// into a sampling.Selector for the enumeration/selection activities.
func selectorFromWindow(w observe.Window, status string) (sampling.Selector, error) {
	sel := sampling.Selector{Status: status}
	if w.Since != "" {
		t, err := time.Parse(time.RFC3339, w.Since)
		if err != nil {
			return sampling.Selector{}, fmt.Errorf("window.since %q: %w", w.Since, err)
		}
		sel.Since = t
	}
	if w.Until != "" {
		t, err := time.Parse(time.RFC3339, w.Until)
		if err != nil {
			return sampling.Selector{}, fmt.Errorf("window.until %q: %w", w.Until, err)
		}
		sel.Until = t
	}
	return sel, nil
}
