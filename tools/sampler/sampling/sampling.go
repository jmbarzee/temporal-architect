// Package sampling is the importable core of the sampler: it pulls a
// representative set of workflow histories from a live Temporal namespace and
// returns them in memory as []history.History, ready for history.Build.
//
// The sampler CLI (package main) wraps Sample with flag parsing, a client
// connection, the history→graph build, and writing the single observed-graph
// JSON. Tests call Sample directly.
package sampling

import (
	"context"
	"fmt"
	"sort"
	"time"

	commonpb "go.temporal.io/api/common/v1"
	enumspb "go.temporal.io/api/enums/v1"
	historypb "go.temporal.io/api/history/v1"
	"go.temporal.io/api/workflowservice/v1"
	"go.temporal.io/sdk/client"
	"go.temporal.io/sdk/converter"

	"github.com/jmbarzee/temporal-architect/tools/sampler/history"
)

// Backend is the subset of the Temporal SDK client the sampler depends on:
// the three read RPCs used across enumeration, candidate selection, and history
// download. *client.Client (the gRPC transport) satisfies it directly, and the
// webapi package provides an HTTP-API implementation for Temporal Cloud's web
// endpoint (where a browser-scoped bearer token is the only credential). This
// seam is what lets one bearer token drive the sampler over either transport.
type Backend interface {
	CountWorkflow(ctx context.Context, request *workflowservice.CountWorkflowExecutionsRequest) (*workflowservice.CountWorkflowExecutionsResponse, error)
	ListWorkflow(ctx context.Context, request *workflowservice.ListWorkflowExecutionsRequest) (*workflowservice.ListWorkflowExecutionsResponse, error)
	GetWorkflowHistory(ctx context.Context, workflowID string, runID string, isLongPoll bool, filterType enumspb.HistoryEventFilterType) client.HistoryEventIterator
}

// Options configures one Sample call. Namespace is required; the returned
// histories are tagged with it so history.Build groups them correctly.
type Options struct {
	Namespace     string
	SamplePercent int
	MinPerType    int

	// Status, when non-empty, restricts sampling to a single ExecutionStatus
	// (e.g. "Running", "Completed", "Failed").
	Status string
	// Since / Until bound the StartTime window applied to enumeration and
	// candidate selection. A zero time means that side is unbounded.
	Since time.Time
	Until time.Time

	// ScanLimit / DisableScanFallback govern the enumeration safety valve used
	// when the O(1) grouped Count is unavailable (see EnumeratePolicy). Zero
	// ScanLimit uses DefaultScanLimit.
	ScanLimit           int
	DisableScanFallback bool
}

// DefaultScanLimit caps the ListWorkflow fallback scan (used only when the O(1)
// grouped Count is unavailable) so a failed/expired credential or an
// unsupported GROUP BY cannot trigger an O(executions) walk of a large
// namespace (e.g. millions of rows). Callers may raise it, allow an unbounded
// scan with a negative value, or disable the fallback outright.
const DefaultScanLimit = 200_000

// EnumeratePolicy governs the enumeration safety valve: what happens when the
// preferred O(1) grouped Count (CountWorkflowExecutions GROUP BY WorkflowType)
// is unavailable and enumeration would otherwise fall back to a paginated
// ListWorkflow scan of the whole namespace.
type EnumeratePolicy struct {
	// ScanLimit caps how many executions the fallback scan pages through before
	// aborting with an error. 0 uses DefaultScanLimit; a negative value allows an
	// unbounded scan (not recommended on large namespaces).
	ScanLimit int
	// DisableScanFallback makes enumeration fail immediately when grouped Count is
	// unavailable, instead of scanning at all — the safest setting for a durable
	// run pointed at a large namespace.
	DisableScanFallback bool
}

func (p EnumeratePolicy) scanLimit() int {
	if p.ScanLimit == 0 {
		return DefaultScanLimit
	}
	return p.ScanLimit
}

// Sample pulls a bounded, representative sample of workflow histories from the
// namespace and returns them in memory.
//
// Phase A enumerates the distinct workflow types and their counts. Phase B,
// for each type, selects max(MinPerType, ceil(SamplePercent% * count))
// executions (preferring running ones) and downloads their full histories.
// Selection goes through the exported SelectExecutions — the same call the
// parallel Temporal path makes — so both paths pick the identical execution set
// for identical inputs. (They previously diverged: this path selected from the
// enumeration scan's in-memory candidates while the parallel path re-queried per
// type, which only agreed for an exhaustive sample.)
func Sample(ctx context.Context, c Backend, opts Options) ([]history.History, error) {
	sel := Selector{Status: opts.Status, Since: opts.Since, Until: opts.Until}
	pol := EnumeratePolicy{ScanLimit: opts.ScanLimit, DisableScanFallback: opts.DisableScanFallback}

	counts, err := enumerate(ctx, c, opts.Namespace, sel.filters(), pol)
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

		selected, err := SelectExecutions(ctx, c, opts.Namespace, wfType, n, sel)
		if err != nil {
			return nil, err
		}

		for _, e := range selected {
			events, err := fetchHistory(ctx, c, candidate{workflowID: e.WorkflowID, runID: e.RunID, running: e.Running})
			if err != nil {
				return nil, fmt.Errorf("fetch history %s/%s: %w", wfType, e.WorkflowID, err)
			}
			out = append(out, history.History{
				WorkflowID: e.WorkflowID,
				Namespace:  opts.Namespace,
				Events:     events,
			})
		}
	}
	return out, nil
}

// enumerate returns the per-type execution counts.
//
// It first tries CountWorkflowExecutions with GROUP BY WorkflowType (one cheap
// call, no per-execution listing). When the server doesn't support that
// grouping, it falls back — subject to the EnumeratePolicy — to a paginated
// ListWorkflow scan that yields counts and candidates together. The policy caps
// (or disables) that fallback so a failed/expired credential or an unsupported
// GROUP BY can't trigger an O(executions) walk of a large namespace.
func enumerate(ctx context.Context, c Backend, namespace string, f filters, pol EnumeratePolicy) (map[string]int, error) {
	counts, cerr := countByType(ctx, c, namespace, f)
	if cerr == nil && len(counts) > 0 {
		return counts, nil
	}
	if pol.DisableScanFallback {
		if cerr == nil {
			cerr = fmt.Errorf("grouped Count returned no groups")
		}
		return nil, fmt.Errorf("grouped CountWorkflowExecutions unavailable and scan fallback disabled: %w", cerr)
	}
	return scanByType(ctx, c, namespace, f, pol.scanLimit())
}

// countByType enumerates types and counts via a single grouped Count call,
// applying any active filters so the counts match the filtered candidate path.
// Returns an error when the server ignores GROUP BY (no groups), so the caller
// falls back to a scan.
//
// KNOWN LIMITATION: no Temporal server supports this today. `GROUP BY` is
// implemented only for ExecutionStatus — Cloud and OSS alike reject
// `GROUP BY WorkflowType` with "operation is not supported: 'group by' clause is
// only supported for ExecutionStatus search attribute". So this call currently
// ALWAYS fails and enumeration always takes the scan fallback. It is kept
// because it is the correct O(1) request the moment grouping by arbitrary search
// attributes ships (promised "in a future release" since v1.20), and because the
// wasted call is one request per run. Replacing it needs a different strategy for
// discovering the distinct type list — see the sampler README.
func countByType(ctx context.Context, c Backend, namespace string, f filters) (map[string]int, error) {
	resp, err := c.CountWorkflow(ctx, &workflowservice.CountWorkflowExecutionsRequest{
		Namespace: namespace,
		Query:     countQuery(f),
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

// scanByType paginates ListWorkflow over the namespace, building both the
// per-type counts and the candidate execution lists. Portable fallback for
// servers without GROUP BY support. Any active filters are applied via the
// list query so the fallback's counts match the filtered candidate path.
// limit caps how many executions are paged before the scan aborts (see
// EnumeratePolicy); limit <= 0 means unbounded.
// It accumulates only per-type COUNTS, never the executions themselves: on a
// large namespace holding every candidate in memory is what makes this path
// untenable, and selection re-queries per type anyway (see Sample).
func scanByType(ctx context.Context, c Backend, namespace string, f filters, limit int) (map[string]int, error) {
	counts := map[string]int{}
	query := scanQuery(f)
	total := 0
	var token []byte
	for {
		resp, err := c.ListWorkflow(ctx, &workflowservice.ListWorkflowExecutionsRequest{
			Namespace:     namespace,
			Query:         query,
			PageSize:      1000,
			NextPageToken: token,
		})
		if err != nil {
			return nil, err
		}
		for _, info := range resp.GetExecutions() {
			if wfType := info.GetType().GetName(); wfType != "" {
				counts[wfType]++
			}
		}
		total += len(resp.GetExecutions())
		if limit > 0 && total > limit {
			return nil, fmt.Errorf("enumeration scan exceeded %d executions in namespace %q; refusing a full O(executions) walk (grouped Count is unavailable — no server supports GROUP BY WorkflowType — so raise --scan-limit if this namespace really must be scanned, or narrow the window with --since/--until)", limit, namespace)
		}
		token = resp.GetNextPageToken()
		if len(token) == 0 {
			break
		}
	}
	return counts, nil
}

// queryByType pulls up to n candidate executions for one workflow type,
// applying any active filters. Absent an explicit status filter it prefers
// running executions (a first ExecutionStatus = 'Running' pass) and tops up
// with the rest; when a status filter is set the prefer-running pass is
// skipped so the two never contradict. Used by the GROUP BY path so we list
// only the executions we will keep.
func queryByType(ctx context.Context, c Backend, namespace, wfType string, n int, f filters) ([]candidate, error) {
	seen := map[string]bool{}
	var out []candidate

	if f.status == "" {
		running := typeQuery(wfType, f, true)
		if err := pageInto(ctx, c, namespace, running, n, seen, &out); err != nil {
			return nil, err
		}
	}
	if len(out) < n {
		all := typeQuery(wfType, f, false)
		if err := pageInto(ctx, c, namespace, all, n, seen, &out); err != nil {
			return nil, err
		}
	}
	return out, nil
}

// pageInto appends candidates matching query (deduped by workflow ID) into out
// until it holds limit entries or the result set is exhausted.
func pageInto(ctx context.Context, c Backend, namespace, query string, limit int, seen map[string]bool, out *[]candidate) error {
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
func fetchHistory(ctx context.Context, c Backend, cand candidate) ([]*historypb.HistoryEvent, error) {
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
