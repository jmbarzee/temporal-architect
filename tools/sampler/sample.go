package main

import (
	"path/filepath"
	"strings"
)

// candidate is one workflow execution discovered during the Phase A scan.
// running marks executions in the RUNNING status, which Phase B prefers.
type candidate struct {
	workflowID string
	runID      string
	running    bool
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

// outputPath builds <out>/<namespace>/<workflowType>/<workflowId>.json,
// sanitizing path-hostile characters in the namespace / type / id
// segments so an exotic workflow ID can't escape the output tree.
func outputPath(out, namespace, wfType, wfID string) string {
	return filepath.Join(
		out,
		sanitizeSegment(namespace),
		sanitizeSegment(wfType),
		sanitizeSegment(wfID)+".json",
	)
}

// sanitizeSegment replaces characters that are unsafe in a single path
// segment (separators and the parent-dir marker) with underscores.
func sanitizeSegment(s string) string {
	replacer := strings.NewReplacer(
		"/", "_",
		"\\", "_",
		"\x00", "_",
	)
	s = replacer.Replace(s)
	switch s {
	case "", ".", "..":
		return "_"
	}
	return s
}
