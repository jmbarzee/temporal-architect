// Package sampling is the importable core of the sampler: it pulls a
// representative set of workflow histories from a live Temporal namespace and
// returns them in memory as []history.History, ready for history.Build.
//
// The sampler CLI (package main) wraps Sample with flag parsing, a client
// connection, and disk writing. Tests call Sample directly.
package sampling

import (
	"context"
	"fmt"
	"sort"

	commonpb "go.temporal.io/api/common/v1"
	enumspb "go.temporal.io/api/enums/v1"
	historypb "go.temporal.io/api/history/v1"
	"go.temporal.io/api/workflowservice/v1"
	"go.temporal.io/sdk/client"
	"go.temporal.io/sdk/converter"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/history"
)

// Options configures one Sample call. Namespace is required; the returned
// histories are tagged with it so history.Build groups them correctly.
type Options struct {
	Namespace     string
	SamplePercent int
	MinPerType    int
}

// Sample pulls a bounded, representative sample of workflow histories from the
// namespace and returns them in memory.
//
// Phase A enumerates the distinct workflow types and their counts. Phase B,
// for each type, selects max(MinPerType, ceil(SamplePercent% * count))
// executions (preferring running ones) and downloads their full histories.
func Sample(ctx context.Context, c client.Client, opts Options) ([]history.History, error) {
	counts, candidates, err := enumerate(ctx, c, opts.Namespace)
	if err != nil {
		return nil, fmt.Errorf("enumerate workflow types: %w", err)
	}

	// Deterministic type order so repeated runs produce stable output.
	types := make([]string, 0, len(counts))
	for t := range counts {
		types = append(types, t)
	}
	sort.Strings(types)

	var out []history.History
	for _, wfType := range types {
		n := sampleCount(counts[wfType], opts.SamplePercent, opts.MinPerType)
		if n <= 0 {
			continue
		}

		var selected []candidate
		if candidates != nil {
			// Fallback path already has every candidate in memory.
			selected = selectCandidates(candidates[wfType], n)
		} else {
			// GROUP BY path: query just the executions we will keep.
			cands, err := queryByType(ctx, c, opts.Namespace, wfType, n)
			if err != nil {
				return nil, fmt.Errorf("query %q executions: %w", wfType, err)
			}
			selected = selectCandidates(cands, n)
		}

		for _, cand := range selected {
			events, err := fetchHistory(ctx, c, cand)
			if err != nil {
				return nil, fmt.Errorf("fetch history %s/%s: %w", wfType, cand.workflowID, err)
			}
			out = append(out, history.History{
				WorkflowID: cand.workflowID,
				Namespace:  opts.Namespace,
				Events:     events,
			})
		}
	}
	return out, nil
}

// enumerate returns the per-type execution counts and, when the fallback scan
// is used, the candidate executions per type (so Phase B need not re-query).
//
// It first tries CountWorkflowExecutions with GROUP BY WorkflowType (one cheap
// call, no per-execution listing). When the server doesn't support that
// grouping, it falls back to a paginated ListWorkflow scan that yields counts
// and candidates together.
func enumerate(ctx context.Context, c client.Client, namespace string) (counts map[string]int, candidates map[string][]candidate, err error) {
	if counts, err = countByType(ctx, c, namespace); err == nil && len(counts) > 0 {
		return counts, nil, nil
	}
	return scanByType(ctx, c, namespace)
}

// countByType enumerates types and counts via a single grouped Count call.
// Returns an error when the server ignores GROUP BY (no groups), so the caller
// falls back to a scan.
func countByType(ctx context.Context, c client.Client, namespace string) (map[string]int, error) {
	resp, err := c.CountWorkflow(ctx, &workflowservice.CountWorkflowExecutionsRequest{
		Namespace: namespace,
		Query:     "GROUP BY WorkflowType",
	})
	if err != nil {
		return nil, err
	}
	if len(resp.GetGroups()) == 0 {
		return nil, fmt.Errorf("GROUP BY WorkflowType not supported (no groups returned)")
	}
	counts := make(map[string]int, len(resp.GetGroups()))
	for _, g := range resp.GetGroups() {
		vals := g.GetGroupValues()
		if len(vals) == 0 {
			continue
		}
		name, err := decodeGroupValue(vals[0])
		if err != nil {
			return nil, fmt.Errorf("decode group value: %w", err)
		}
		if name != "" {
			counts[name] = int(g.GetCount())
		}
	}
	return counts, nil
}

// scanByType paginates ListWorkflow over the whole namespace, building both the
// per-type counts and the candidate execution lists. Portable fallback for
// servers without GROUP BY support.
func scanByType(ctx context.Context, c client.Client, namespace string) (map[string]int, map[string][]candidate, error) {
	counts := map[string]int{}
	byType := map[string][]candidate{}
	var token []byte
	for {
		resp, err := c.ListWorkflow(ctx, &workflowservice.ListWorkflowExecutionsRequest{
			Namespace:     namespace,
			PageSize:      1000,
			NextPageToken: token,
		})
		if err != nil {
			return nil, nil, err
		}
		for _, info := range resp.GetExecutions() {
			wfType := info.GetType().GetName()
			if wfType == "" {
				continue
			}
			counts[wfType]++
			byType[wfType] = append(byType[wfType], candidate{
				workflowID: info.GetExecution().GetWorkflowId(),
				runID:      info.GetExecution().GetRunId(),
				running:    info.GetStatus() == enumspb.WORKFLOW_EXECUTION_STATUS_RUNNING,
			})
		}
		token = resp.GetNextPageToken()
		if len(token) == 0 {
			break
		}
	}
	return counts, byType, nil
}

// queryByType pulls up to n candidate executions for one workflow type,
// preferring running executions and topping up with any remaining ones.
// Used by the GROUP BY path so we list only the executions we will keep.
func queryByType(ctx context.Context, c client.Client, namespace, wfType string, n int) ([]candidate, error) {
	seen := map[string]bool{}
	var out []candidate

	running := fmt.Sprintf("WorkflowType = '%s' AND ExecutionStatus = 'Running'", wfType)
	if err := pageInto(ctx, c, namespace, running, n, seen, &out); err != nil {
		return nil, err
	}
	if len(out) < n {
		all := fmt.Sprintf("WorkflowType = '%s'", wfType)
		if err := pageInto(ctx, c, namespace, all, n, seen, &out); err != nil {
			return nil, err
		}
	}
	return out, nil
}

// pageInto appends candidates matching query (deduped by workflow ID) into out
// until it holds limit entries or the result set is exhausted.
func pageInto(ctx context.Context, c client.Client, namespace, query string, limit int, seen map[string]bool, out *[]candidate) error {
	var token []byte
	for len(*out) < limit {
		resp, err := c.ListWorkflow(ctx, &workflowservice.ListWorkflowExecutionsRequest{
			Namespace:     namespace,
			Query:         query,
			PageSize:      int32(limit),
			NextPageToken: token,
		})
		if err != nil {
			return err
		}
		for _, info := range resp.GetExecutions() {
			wid := info.GetExecution().GetWorkflowId()
			if seen[wid] {
				continue
			}
			seen[wid] = true
			*out = append(*out, candidate{
				workflowID: wid,
				runID:      info.GetExecution().GetRunId(),
				running:    info.GetStatus() == enumspb.WORKFLOW_EXECUTION_STATUS_RUNNING,
			})
			if len(*out) >= limit {
				break
			}
		}
		token = resp.GetNextPageToken()
		if len(token) == 0 {
			break
		}
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

// decodeGroupValue extracts the string value of a Count GROUP BY group key
// (e.g. the workflow type name) from its encoded payload.
func decodeGroupValue(p *commonpb.Payload) (string, error) {
	var s string
	if err := converter.GetDefaultDataConverter().FromPayload(p, &s); err != nil {
		return "", err
	}
	return s, nil
}
