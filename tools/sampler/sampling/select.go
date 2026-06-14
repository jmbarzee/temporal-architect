package sampling

import (
	"fmt"
	"strings"
	"time"
)

// candidate is one workflow execution discovered during enumeration.
// running marks executions in the RUNNING status, which sampling prefers.
type candidate struct {
	workflowID string
	runID      string
	running    bool
}

// filters narrows which executions the sampler considers, layered on top of
// the always-present WorkflowType selection. A zero filters value selects
// everything (the v1 behavior).
type filters struct {
	// status, when non-empty, restricts to a single ExecutionStatus value
	// (e.g. "Running", "Completed", "Failed").
	status string
	// since / until bound the StartTime window. A zero time means that side
	// is unbounded.
	since time.Time
	until time.Time
}

// whereClauses returns the Visibility WHERE clauses for the time/status
// filters in a deterministic order (status, then StartTime), so composed
// queries are stable across runs. Returns nil when no filter is set.
func (f filters) whereClauses() []string {
	var cs []string
	if f.status != "" {
		cs = append(cs, fmt.Sprintf("ExecutionStatus = '%s'", f.status))
	}
	switch {
	case !f.since.IsZero() && !f.until.IsZero():
		cs = append(cs, fmt.Sprintf("StartTime BETWEEN '%s' AND '%s'",
			f.since.Format(time.RFC3339), f.until.Format(time.RFC3339)))
	case !f.since.IsZero():
		cs = append(cs, fmt.Sprintf("StartTime >= '%s'", f.since.Format(time.RFC3339)))
	case !f.until.IsZero():
		cs = append(cs, fmt.Sprintf("StartTime <= '%s'", f.until.Format(time.RFC3339)))
	}
	return cs
}

// countQuery builds the grouped Count query for type enumeration, prepending
// any filter clauses before the GROUP BY so the per-type counts reflect the
// same window/status the candidate selection will use.
func countQuery(f filters) string {
	where := strings.Join(f.whereClauses(), " AND ")
	if where == "" {
		return "GROUP BY WorkflowType"
	}
	return where + " GROUP BY WorkflowType"
}

// scanQuery builds the ListWorkflow query for the portable fallback scan. An
// empty string means "all executions" (the v1 behavior, no filter set).
func scanQuery(f filters) string {
	return strings.Join(f.whereClauses(), " AND ")
}

// typeQuery builds a per-type ListWorkflow query: the WorkflowType selector
// plus any active filter clauses. When runningOnly is set, an
// ExecutionStatus = 'Running' clause is appended for the prefer-running first
// pass — callers only request that pass when no explicit status filter is set,
// so the two never contradict.
func typeQuery(wfType string, f filters, runningOnly bool) string {
	clauses := append([]string{fmt.Sprintf("WorkflowType = '%s'", wfType)}, f.whereClauses()...)
	if runningOnly {
		clauses = append(clauses, "ExecutionStatus = 'Running'")
	}
	return strings.Join(clauses, " AND ")
}

// sampleCount returns how many executions to pull for a workflow type:
// max(minPerType, ceil(percent/100 * total)), capped at total.
//
// Negative or zero inputs are clamped so the result is always within
// [0, total]. A type with fewer executions than minPerType yields all of
// them (the total cap wins).
func sampleCount(total, percent, minPerType int) int {
	if total <= 0 {
		return 0
	}
	if percent < 0 {
		percent = 0
	}
	if minPerType < 0 {
		minPerType = 0
	}

	// ceil(percent/100 * total) using integer arithmetic.
	pct := (total*percent + 99) / 100

	n := pct
	if minPerType > n {
		n = minPerType
	}
	if n > total {
		n = total
	}
	return n
}

// selectCandidates returns up to n candidates, running executions first
// (in their original order), topped up with the rest (also in original
// order). Deterministic for a given input slice.
func selectCandidates(cands []candidate, n int) []candidate {
	if n <= 0 {
		return nil
	}
	if n >= len(cands) {
		// Return a copy so callers can't mutate the source slice.
		out := make([]candidate, len(cands))
		copy(out, cands)
		return out
	}

	out := make([]candidate, 0, n)
	// Running first, preserving order.
	for _, c := range cands {
		if len(out) == n {
			break
		}
		if c.running {
			out = append(out, c)
		}
	}
	// Top up with closed executions, preserving order.
	for _, c := range cands {
		if len(out) == n {
			break
		}
		if !c.running {
			out = append(out, c)
		}
	}
	return out
}
