package sampling

import (
	"context"
	"fmt"
	"math/rand"
	"sort"
	"strings"
	"time"

	"go.temporal.io/api/workflowservice/v1"
)

// Type DISCOVERY — the replacement for the grouped-Count enumeration that no
// Temporal server actually supports (GROUP BY is implemented for
// ExecutionStatus only; see countByType).
//
// The core trick is EXCLUSION. Every query carries `WorkflowType != 'A' AND
// WorkflowType != 'B' AND ...` for every type already known, so the server only
// ever returns executions of types we have NOT seen. Two consequences, and they
// are what make this work at 16M-execution scale:
//
//   - Every round makes guaranteed progress. Any row that comes back is a new
//     type by construction, so the loop runs at most once per distinct type —
//     O(types), never O(executions). No luck required, unlike a plain random
//     sample that mostly re-finds whatever runs most.
//   - Termination is PROVEN, not assumed. Counting the excluded set answers
//     "how many executions have a type I don't know about?" — and when that
//     count reaches zero, discovery is exhaustive over the window as a fact
//     rather than a hope. Short of that, the count is an honest progress
//     metric: how much is still unaccounted for.
//
// Around that core:
//
//  1. Each round also fires stratified StartTime probes (see probeQueries) as
//     an accelerant — they find several new types per round instead of one, and
//     spread reads across the window rather than clustering on the newest rows.
//     The full-window query runs first regardless, so progress never depends on
//     a probe happening to land on a rare type.
//  2. SIZE exactly. Once the type list exists, per-type counts are the
//     *supported* filtered Count (WorkflowType='X'), one cheap call each.
//  3. CLOSE over relationships. Executions reached while sampling reference
//     other workflows — children (typed directly in the history event), and
//     signal targets / parents / roots (identified only by workflow ID).
//     ResolveTypes turns those IDs into types in batched IN queries.
//
// NOT IN is not a documented List Filter operator, so exclusion is chained !=,
// which is supported for Keyword attributes like WorkflowType. That makes the
// query grow with the type count, hence MaxExcludedTypes.
//
// Everything here is deterministic given DiscoveryPolicy.Seed, so a workflow
// replay or a re-run probes the identical slices.

// DiscoveryPolicy configures the random seed pass and its call budget.
type DiscoveryPolicy struct {
	// ExplicitTypes short-circuits discovery entirely — the always-correct,
	// zero-cost path when the caller already knows the namespace's types (they
	// are compiled into the workers, after all).
	ExplicitTypes []string
	// Probes is how many stratified StartTime slices the seed pass samples.
	// This is the discovery call budget: one ListWorkflow call per probe.
	Probes int
	// PageSize is how many executions each probe pulls. Small is fine — a probe
	// only needs enough rows to reveal which types live in its slice.
	PageSize int32
	// Seed makes slice placement deterministic, so replays and re-runs probe
	// identically. The starter supplies it alongside the window.
	Seed int64
	// MaxRounds caps the exclusion loop. Each round discovers at least one new
	// type (or stops), so this is effectively a cap on distinct types found.
	// 0 uses DefaultMaxRounds.
	MaxRounds int
}

// Discovery defaults: 32 probes × 200 rows bounds the seed pass at 32 calls and
// ~6.4k rows — trivial next to a 16M-row scan, and enough to surface the
// handful of types most namespaces actually have.
const (
	DefaultProbes   = 32
	DefaultPageSize = 200
	// DefaultResolveChunk is how many workflow IDs are packed into one
	// `WorkflowId IN (...)` resolution query.
	DefaultResolveChunk = 100
	// DefaultMaxRounds caps the exclusion loop.
	DefaultMaxRounds = 20
	// MaxExcludedTypes bounds how many `WorkflowType != 'X'` clauses go into one
	// query, since exclusion must be chained (NOT IN is unsupported) and the
	// query string grows with it. Past this, exclusion can no longer be
	// expressed, so discovery stops and reports itself non-exhaustive rather
	// than sending a query the server may reject.
	MaxExcludedTypes = 200
)

func (p DiscoveryPolicy) withDefaults() DiscoveryPolicy {
	if p.Probes <= 0 {
		p.Probes = DefaultProbes
	}
	if p.PageSize <= 0 {
		p.PageSize = DefaultPageSize
	}
	if p.MaxRounds <= 0 {
		p.MaxRounds = DefaultMaxRounds
	}
	return p
}

// Discovered is the outcome of type discovery. Exhaustive is the valuable part:
// it means a Count of "executions whose type is not in Types" came back zero, so
// the list is provably complete for the window — not merely whatever a sample
// happened to reach. When it is false, Remaining says how many executions are
// still unaccounted for.
type Discovered struct {
	Types      []string `json:"types"`
	Exhaustive bool     `json:"exhaustive"`
	Remaining  int64    `json:"remaining"`
	Rounds     int      `json:"rounds"`
	Calls      int      `json:"calls"`
}

// DiscoverTypeCounts is the full Phase A replacement: discover the distinct
// workflow types, then size each with a supported per-type Count. The result is
// sorted by type name, matching the old Enumerate contract so the orchestration
// above it is unchanged.
func DiscoverTypeCounts(ctx context.Context, c Backend, namespace string, sel Selector, pol DiscoveryPolicy) ([]TypeCount, error) {
	d, err := DiscoverTypes(ctx, c, namespace, sel, pol)
	if err != nil {
		return nil, err
	}
	return CountTypes(ctx, c, namespace, d.Types, sel)
}

// DiscoverTypes runs the exclusion loop: count what is still unknown, pull a
// page of it (every row is a new type, because known types are excluded), and
// repeat until the unknown count is zero.
//
// When ExplicitTypes is set the loop is skipped, but the count still runs once —
// so a caller-supplied list gets VERIFIED for one call, reporting whether it
// actually covers the namespace or silently misses types.
func DiscoverTypes(ctx context.Context, c Backend, namespace string, sel Selector, pol DiscoveryPolicy) (Discovered, error) {
	pol = pol.withDefaults()
	d := Discovered{Types: sortedUnique(pol.ExplicitTypes)}

	for d.Rounds < pol.MaxRounds {
		remaining, ok, err := countUnknown(ctx, c, namespace, sel, d.Types)
		d.Calls++
		if err != nil {
			return d, err
		}
		if !ok {
			// Too many known types to express as an exclusion — stop rather than
			// send a query the server may reject. Types found so far stand; we
			// just can't prove completeness.
			return d, nil
		}
		d.Remaining = remaining
		if remaining == 0 {
			d.Exhaustive = true
			return d, nil
		}
		if len(pol.ExplicitTypes) > 0 {
			// Verification only: the caller asked for a fixed list, so report the
			// shortfall rather than expanding past what they asked for.
			return d, nil
		}

		found, calls, err := probeUnknown(ctx, c, namespace, sel, pol, d.Types)
		d.Calls += calls
		if err != nil {
			return d, err
		}
		d.Rounds++
		if len(found) == 0 {
			// Count says something is out there but no page returned it. Stop
			// instead of spinning; Remaining records the shortfall.
			return d, nil
		}
		d.Types = sortedUnique(append(d.Types, found...))
	}
	return d, nil
}

// countUnknown counts executions whose type is NOT among known — the loop's
// termination test and progress metric. ok is false when the exclusion would
// need more clauses than MaxExcludedTypes.
func countUnknown(ctx context.Context, c Backend, namespace string, sel Selector, known []string) (int64, bool, error) {
	clause, ok := excludeTypesClause(known)
	if !ok {
		return 0, false, nil
	}
	query := andClauses(scanQuery(sel.filters()), clause)
	resp, err := c.CountWorkflow(ctx, &workflowservice.CountWorkflowExecutionsRequest{
		Namespace: namespace,
		Query:     query,
	})
	if err != nil {
		return 0, false, fmt.Errorf("count unknown types (%q): %w", query, err)
	}
	return resp.GetCount(), true, nil
}

// probeUnknown reads pages of the excluded set and returns the new types found.
// The full-window query runs first so a round always makes progress; the
// stratified probes that follow are an accelerant, surfacing several new types
// per round rather than one.
func probeUnknown(ctx context.Context, c Backend, namespace string, sel Selector, pol DiscoveryPolicy, known []string) ([]string, int, error) {
	clause, ok := excludeTypesClause(known)
	if !ok {
		return nil, 0, nil
	}

	queries := []string{andClauses(scanQuery(sel.filters()), clause)}
	if pol.Probes > 1 {
		strata := pol
		strata.Probes = pol.Probes - 1
		for _, q := range probeQueries(sel, strata) {
			queries = append(queries, andClauses(q, clause))
		}
	}

	seen := map[string]bool{}
	for _, t := range known {
		seen[t] = true
	}
	var found []string
	calls := 0
	for _, q := range queries {
		resp, err := c.ListWorkflow(ctx, &workflowservice.ListWorkflowExecutionsRequest{
			Namespace: namespace,
			Query:     q,
			PageSize:  pol.PageSize,
		})
		calls++
		if err != nil {
			return nil, calls, fmt.Errorf("discovery probe %q: %w", q, err)
		}
		for _, info := range resp.GetExecutions() {
			if name := info.GetType().GetName(); name != "" && !seen[name] {
				seen[name] = true
				found = append(found, name)
			}
		}
	}
	sort.Strings(found)
	return found, calls, nil
}

// excludeTypesClause builds `WorkflowType != 'A' AND WorkflowType != 'B' ...`.
// NOT IN is not a supported List Filter operator, so the exclusion is chained
// != (which Keyword attributes do support). Returns ok=false past
// MaxExcludedTypes; an empty known set yields an empty clause.
func excludeTypesClause(known []string) (string, bool) {
	if len(known) > MaxExcludedTypes {
		return "", false
	}
	if len(known) == 0 {
		return "", true
	}
	parts := make([]string, len(known))
	for i, t := range known {
		parts[i] = fmt.Sprintf("WorkflowType != %s", quote(t))
	}
	return strings.Join(parts, " AND "), true
}

// andClauses joins two optional query fragments with AND, tolerating either
// being empty (an unfiltered window, or nothing yet to exclude).
func andClauses(a, b string) string {
	switch {
	case a == "":
		return b
	case b == "":
		return a
	default:
		return a + " AND " + b
	}
}

// probeQueries builds the stratified sample: the window is cut into Probes
// equal slices and each slice is probed once, so coverage spans the whole time
// range instead of clustering on the most recent executions (Visibility orders
// by close/start time descending and Cloud does not support ORDER BY, so an
// unstratified sample only ever sees the newest rows).
//
// Slice boundaries are jittered by Seed so different runs land on different
// rows while any single run stays reproducible.
//
// When the window is not bounded on both sides there is nothing to stratify
// over, so this degrades to one plain probe — correct, but far weaker coverage.
// Callers wanting real discovery should bound the window (--since/--until).
func probeQueries(sel Selector, pol DiscoveryPolicy) []string {
	f := sel.filters()
	if f.since.IsZero() || f.until.IsZero() || !f.until.After(f.since) {
		return []string{scanQuery(f)}
	}

	rng := rand.New(rand.NewSource(pol.Seed))
	span := f.until.Sub(f.since)
	width := span / time.Duration(pol.Probes)
	if width <= 0 {
		return []string{scanQuery(f)}
	}

	queries := make([]string, 0, pol.Probes)
	for i := 0; i < pol.Probes; i++ {
		start := f.since.Add(time.Duration(i) * width)
		end := start.Add(width)
		// Jitter within the slice, keeping the probe inside its own stratum so
		// slices stay disjoint and coverage stays uniform.
		if off := time.Duration(rng.Int63n(int64(width))); off > 0 {
			start = start.Add(off / 2)
		}
		if end.After(f.until) {
			end = f.until
		}
		queries = append(queries, scanQuery(filters{status: f.status, since: start, until: end}))
	}
	return queries
}

// CountTypes sizes each type with CountWorkflowExecutions filtered by
// WorkflowType — the grouping-free form that every server supports. One call
// per type, so this is O(types), not O(executions). Types that count zero under
// the active filters are dropped.
func CountTypes(ctx context.Context, c Backend, namespace string, types []string, sel Selector) ([]TypeCount, error) {
	f := sel.filters()
	out := make([]TypeCount, 0, len(types))
	for _, t := range types {
		clauses := append([]string{fmt.Sprintf("WorkflowType = %s", quote(t))}, f.whereClauses()...)
		resp, err := c.CountWorkflow(ctx, &workflowservice.CountWorkflowExecutionsRequest{
			Namespace: namespace,
			Query:     strings.Join(clauses, " AND "),
		})
		if err != nil {
			return nil, fmt.Errorf("count %q executions: %w", t, err)
		}
		if n := int(resp.GetCount()); n > 0 {
			out = append(out, TypeCount{WorkflowType: t, Count: n})
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].WorkflowType < out[j].WorkflowType })
	return out, nil
}

// ResolveTypes maps workflow IDs to their workflow types, batching them into
// `WorkflowId IN (...)` queries. This is the non-history half of relationship
// discovery: history events name a CHILD's type outright, but a parent, a root,
// and a signal target are identified only by workflow ID, so their types have
// to be looked up. Batching keeps that at O(refs/chunk) calls.
//
// IDs that no longer resolve (retention expiry, wrong namespace) are simply
// absent from the result rather than an error — a dangling reference is normal
// when sampling a window.
func ResolveTypes(ctx context.Context, c Backend, namespace string, ids []string, chunk int) (map[string]string, error) {
	if chunk <= 0 {
		chunk = DefaultResolveChunk
	}
	ids = sortedUnique(ids)
	out := make(map[string]string, len(ids))

	for start := 0; start < len(ids); start += chunk {
		end := start + chunk
		if end > len(ids) {
			end = len(ids)
		}
		batch := ids[start:end]

		quoted := make([]string, len(batch))
		for i, id := range batch {
			quoted[i] = quote(id)
		}
		query := fmt.Sprintf("WorkflowId IN (%s)", strings.Join(quoted, ", "))

		var token []byte
		for {
			resp, err := c.ListWorkflow(ctx, &workflowservice.ListWorkflowExecutionsRequest{
				Namespace:     namespace,
				Query:         query,
				PageSize:      int32(len(batch)),
				NextPageToken: token,
			})
			if err != nil {
				return nil, fmt.Errorf("resolve %d workflow ids: %w", len(batch), err)
			}
			for _, info := range resp.GetExecutions() {
				id := info.GetExecution().GetWorkflowId()
				if name := info.GetType().GetName(); id != "" && name != "" {
					out[id] = name
				}
			}
			token = resp.GetNextPageToken()
			if len(token) == 0 {
				break
			}
		}
	}
	return out, nil
}

// quote renders a Visibility string literal, escaping embedded single quotes.
// Workflow IDs are user-supplied and routinely contain punctuation, so this
// matters far more here than for type names.
func quote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "''") + "'"
}

func sortedUnique(in []string) []string {
	seen := make(map[string]bool, len(in))
	out := make([]string, 0, len(in))
	for _, s := range in {
		if s == "" || seen[s] {
			continue
		}
		seen[s] = true
		out = append(out, s)
	}
	sort.Strings(out)
	return out
}
