package sampling

import (
	"context"
	"fmt"
	"sort"
	"time"
)

// This file exposes the sampler's three phases as activity-sized, importable
// units for the Temporal orchestration (tools/sampler/temporal). Each wraps the
// same unexported helpers the monolithic Sample uses (enumerate/queryByType/
// selectCandidates/sampleCount), so the parallel path and the single-process
// path share one implementation of the sampling math and query construction.

// TypeCount is one workflow type and its (filtered) execution count. It is the
// serializable result of Enumerate — the "find the types" phase — carried
// across the workflow/activity boundary.
type TypeCount struct {
	WorkflowType string `json:"workflowType"`
	Count        int    `json:"count"`
}

// Execution is a lightweight candidate reference (identity only — no history,
// no live client), safe to carry through workflow state and activity payloads.
type Execution struct {
	WorkflowID string `json:"workflowID"`
	RunID      string `json:"runID"`
	Running    bool   `json:"running"`
}

// Selector narrows enumeration and candidate selection identically to the
// single-process path: an optional single ExecutionStatus and a StartTime
// window. A zero Selector selects everything. It is the exported projection of
// the internal filters, built activity-side from the request's Window+Status.
type Selector struct {
	Status string
	Since  time.Time
	Until  time.Time
}

func (s Selector) filters() filters {
	return filters{status: s.Status, since: s.Since, until: s.Until}
}

// Enumerate returns the distinct workflow types and their filtered counts,
// deterministically ordered by type name. It is the importable form of Phase A:
// a grouped Count (GROUP BY WorkflowType), falling back — subject to pol — to a
// paginated scan when the server doesn't support grouping. Read-only, so an
// activity wrapping it is safe to retry. pol is the enumeration safety valve
// (scan cap / disable) that keeps a durable run from walking a huge namespace on
// a bad credential.
func Enumerate(ctx context.Context, c Backend, namespace string, sel Selector, pol EnumeratePolicy) ([]TypeCount, error) {
	counts, err := enumerate(ctx, c, namespace, sel.filters(), pol)
	if err != nil {
		return nil, fmt.Errorf("enumerate workflow types: %w", err)
	}
	types := make([]string, 0, len(counts))
	for t := range counts {
		types = append(types, t)
	}
	sort.Strings(types)
	out := make([]TypeCount, 0, len(types))
	for _, t := range types {
		out = append(out, TypeCount{WorkflowType: t, Count: counts[t]})
	}
	return out, nil
}

// SelectExecutions returns up to target candidate executions for one workflow
// type — Phase B's selection, minus the history download. It queries only the
// executions it will keep (per-type ListWorkflow), preferring running
// executions and topping up with closed ones (skipping the prefer-running pass
// when a status filter is set), matching the single-process path's selection.
func SelectExecutions(ctx context.Context, c Backend, namespace, wfType string, target int, sel Selector) ([]Execution, error) {
	if target <= 0 {
		return nil, nil
	}
	cands, err := queryByType(ctx, c, namespace, wfType, target, sel.filters())
	if err != nil {
		return nil, fmt.Errorf("query %q executions: %w", wfType, err)
	}
	selected := selectCandidates(cands, target)
	out := make([]Execution, len(selected))
	for i, cand := range selected {
		out[i] = Execution{WorkflowID: cand.workflowID, RunID: cand.runID, Running: cand.running}
	}
	return out, nil
}

// SampleTarget is the exported sample-count math: how many executions to pull
// for a type given its total and the percent / minimum knobs. The workflow
// computes the per-type target with it before fanning out, so the parallel and
// single-process paths agree on sample size.
func SampleTarget(total, percent, minPerType int) int {
	return sampleCount(total, percent, minPerType)
}
