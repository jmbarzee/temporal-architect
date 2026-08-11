package sampling

import (
	"context"
	"sort"
	"strings"
	"testing"
	"time"

	commonpb "go.temporal.io/api/common/v1"
	enumspb "go.temporal.io/api/enums/v1"
	workflowpb "go.temporal.io/api/workflow/v1"
	"go.temporal.io/api/workflowservice/v1"
	"go.temporal.io/sdk/client"
)

// discoverBackend records every query it is asked and answers from caller-
// supplied hooks, so tests can assert the exact Visibility queries the
// discovery pass emits (its whole value is the shape of those queries).
type discoverBackend struct {
	listQueries  []string
	countQueries []string
	list         func(query string) []*workflowpb.WorkflowExecutionInfo
	count        func(query string) int64
}

func (d *discoverBackend) CountWorkflow(_ context.Context, req *workflowservice.CountWorkflowExecutionsRequest) (*workflowservice.CountWorkflowExecutionsResponse, error) {
	d.countQueries = append(d.countQueries, req.GetQuery())
	var n int64
	if d.count != nil {
		n = d.count(req.GetQuery())
	}
	return &workflowservice.CountWorkflowExecutionsResponse{Count: n}, nil
}

func (d *discoverBackend) ListWorkflow(_ context.Context, req *workflowservice.ListWorkflowExecutionsRequest) (*workflowservice.ListWorkflowExecutionsResponse, error) {
	d.listQueries = append(d.listQueries, req.GetQuery())
	var execs []*workflowpb.WorkflowExecutionInfo
	if d.list != nil {
		execs = d.list(req.GetQuery())
	}
	return &workflowservice.ListWorkflowExecutionsResponse{Executions: execs}, nil
}

func (d *discoverBackend) GetWorkflowHistory(context.Context, string, string, bool, enumspb.HistoryEventFilterType) client.HistoryEventIterator {
	return nil
}

func execInfo(id, wfType string) *workflowpb.WorkflowExecutionInfo {
	return &workflowpb.WorkflowExecutionInfo{
		Execution: &commonpb.WorkflowExecution{WorkflowId: id},
		Type:      &commonpb.WorkflowType{Name: wfType},
		Status:    enumspb.WORKFLOW_EXECUTION_STATUS_COMPLETED,
	}
}

var discoverWindow = Selector{
	Since: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
	Until: time.Date(2026, 1, 2, 0, 0, 0, 0, time.UTC),
}

func TestProbeQueriesStratifyAndAreDeterministic(t *testing.T) {
	pol := DiscoveryPolicy{Probes: 8, Seed: 42}.withDefaults()

	a := probeQueries(discoverWindow, pol)
	b := probeQueries(discoverWindow, pol)
	if len(a) != 8 {
		t.Fatalf("got %d probes, want 8", len(a))
	}
	for i := range a {
		if a[i] != b[i] {
			t.Fatalf("probe %d not deterministic for a fixed seed:\n%s\n%s", i, a[i], b[i])
		}
		if !strings.Contains(a[i], "StartTime BETWEEN") {
			t.Fatalf("probe %d is not time-bounded: %s", i, a[i])
		}
	}
	// Distinct strata: probes must not all collapse onto the same slice, which
	// is what makes this a stratified sample rather than N copies of "newest".
	unique := map[string]bool{}
	for _, q := range a {
		unique[q] = true
	}
	if len(unique) != len(a) {
		t.Fatalf("probes overlap: %d unique of %d", len(unique), len(a))
	}

	// A different seed jitters to different slices.
	if c := probeQueries(discoverWindow, DiscoveryPolicy{Probes: 8, Seed: 7}.withDefaults()); c[0] == a[0] {
		t.Error("expected a different seed to move the probe window")
	}
}

func TestProbeQueriesUnboundedWindowDegradesToOne(t *testing.T) {
	got := probeQueries(Selector{}, DiscoveryPolicy{Probes: 8}.withDefaults())
	if len(got) != 1 {
		t.Fatalf("unbounded window should yield a single probe, got %d", len(got))
	}
}

// fakeNamespace answers count/list queries out of a fixed execution set,
// honoring `WorkflowType != 'X'` exclusion clauses. That is enough to exercise
// the real loop: exclusion drives progress, and the count drives termination.
type fakeNamespace struct {
	byType map[string]int // type -> execution count
}

func (f fakeNamespace) excluded(query string) map[string]bool {
	out := map[string]bool{}
	for _, part := range strings.Split(query, " AND ") {
		if rest, ok := strings.CutPrefix(strings.TrimSpace(part), "WorkflowType != "); ok {
			out[strings.Trim(rest, "'")] = true
		}
	}
	return out
}

func (f fakeNamespace) backend() *discoverBackend {
	return &discoverBackend{
		count: func(query string) int64 {
			ex := f.excluded(query)
			var n int64
			for t, c := range f.byType {
				if !ex[t] {
					n += int64(c)
				}
			}
			return n
		},
		list: func(query string) []*workflowpb.WorkflowExecutionInfo {
			ex := f.excluded(query)
			types := make([]string, 0, len(f.byType))
			for t := range f.byType {
				if !ex[t] {
					types = append(types, t)
				}
			}
			sort.Strings(types)
			// A page is dominated by the highest-count type, mimicking a real
			// namespace where one type swamps everything: without exclusion a
			// sample would keep re-finding it and never reach the rare ones.
			sort.SliceStable(types, func(i, j int) bool { return f.byType[types[i]] > f.byType[types[j]] })
			var out []*workflowpb.WorkflowExecutionInfo
			if len(types) > 0 {
				out = append(out, execInfo("x", types[0]))
			}
			return out
		},
	}
}

func TestDiscoverTypesExclusionFindsEveryTypeAndProvesIt(t *testing.T) {
	// One dominant type and two rare ones — the shape that defeats random
	// sampling and that exclusion handles deterministically.
	ns := fakeNamespace{byType: map[string]int{
		"CAPRefreshWorkflow": 3_000_000,
		"NeoWorkflow":        1_000,
		"RareOrchestrator":   1,
	}}
	be := ns.backend()

	got, err := DiscoverTypes(context.Background(), be, "ns", discoverWindow, DiscoveryPolicy{Probes: 1, Seed: 1})
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"CAPRefreshWorkflow", "NeoWorkflow", "RareOrchestrator"}
	if len(got.Types) != len(want) {
		t.Fatalf("types = %v, want %v", got.Types, want)
	}
	for i := range want {
		if got.Types[i] != want[i] {
			t.Fatalf("types = %v, want %v", got.Types, want)
		}
	}
	if !got.Exhaustive {
		t.Errorf("expected discovery to prove exhaustiveness, remaining=%d", got.Remaining)
	}
	if got.Remaining != 0 {
		t.Errorf("remaining = %d, want 0 once exhaustive", got.Remaining)
	}
	// One page yields one new type here, so it takes one round per type plus a
	// final count that proves nothing is left. The point is that it is bounded
	// by the TYPE count, not the 3M executions.
	if got.Rounds != 3 {
		t.Errorf("rounds = %d, want 3 (one per type)", got.Rounds)
	}
}

func TestDiscoverTypesReportsShortfallWhenCapped(t *testing.T) {
	ns := fakeNamespace{byType: map[string]int{"Alpha": 10, "Beta": 5, "Gamma": 2}}
	be := ns.backend()

	// Stop after one round: two types remain undiscovered, and the caller must
	// be able to tell rather than assume the list is complete.
	got, err := DiscoverTypes(context.Background(), be, "ns", discoverWindow,
		DiscoveryPolicy{Probes: 1, Seed: 1, MaxRounds: 1})
	if err != nil {
		t.Fatal(err)
	}
	if got.Exhaustive {
		t.Error("must not claim exhaustiveness after hitting the round cap")
	}
	if len(got.Types) != 1 || got.Types[0] != "Alpha" {
		t.Fatalf("types = %v, want [Alpha]", got.Types)
	}
	if got.Remaining != 17 {
		t.Errorf("remaining = %d, want 17 (all executions before the first round)", got.Remaining)
	}
}

func TestDiscoverTypesExplicitIsVerifiedNotExpanded(t *testing.T) {
	ns := fakeNamespace{byType: map[string]int{"Alpha": 10, "Missed": 4}}
	be := ns.backend()

	got, err := DiscoverTypes(context.Background(), be, "ns", discoverWindow,
		DiscoveryPolicy{ExplicitTypes: []string{"Alpha"}})
	if err != nil {
		t.Fatal(err)
	}
	// The caller's list is honored verbatim...
	if len(got.Types) != 1 || got.Types[0] != "Alpha" {
		t.Fatalf("types = %v, want [Alpha]", got.Types)
	}
	// ...but the single verification count tells them it is incomplete.
	if got.Exhaustive || got.Remaining != 4 {
		t.Errorf("expected a reported shortfall of 4, got exhaustive=%v remaining=%d", got.Exhaustive, got.Remaining)
	}
	if len(be.listQueries) != 0 {
		t.Errorf("explicit types must not list at all, made %d list calls", len(be.listQueries))
	}
	if len(be.countQueries) != 1 {
		t.Errorf("verification should cost exactly one count, made %d", len(be.countQueries))
	}
}

func TestDiscoverTypesExplicitCompleteIsProven(t *testing.T) {
	ns := fakeNamespace{byType: map[string]int{"Alpha": 10}}
	got, err := DiscoverTypes(context.Background(), ns.backend(), "ns", discoverWindow,
		DiscoveryPolicy{ExplicitTypes: []string{"Alpha"}})
	if err != nil {
		t.Fatal(err)
	}
	if !got.Exhaustive {
		t.Errorf("a complete explicit list should verify as exhaustive, remaining=%d", got.Remaining)
	}
}

func TestExcludeTypesClause(t *testing.T) {
	got, ok := excludeTypesClause([]string{"Alpha", "Beta"})
	if !ok {
		t.Fatal("expected clause to be expressible")
	}
	want := "WorkflowType != 'Alpha' AND WorkflowType != 'Beta'"
	if got != want {
		t.Fatalf("clause = %q, want %q", got, want)
	}
	if _, ok := excludeTypesClause(make([]string, MaxExcludedTypes+1)); ok {
		t.Error("expected clause past MaxExcludedTypes to be inexpressible")
	}
}

func TestCountTypesUsesSupportedFilteredCount(t *testing.T) {
	be := &discoverBackend{count: func(query string) int64 {
		if strings.Contains(query, "'Alpha'") {
			return 7
		}
		return 0 // Beta has nothing in-window and should be dropped
	}}

	got, err := CountTypes(context.Background(), be, "ns", []string{"Alpha", "Beta"}, discoverWindow)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].WorkflowType != "Alpha" || got[0].Count != 7 {
		t.Fatalf("counts = %+v, want one Alpha=7", got)
	}
	for _, q := range be.countQueries {
		if strings.Contains(q, "GROUP BY") {
			t.Fatalf("count must not use GROUP BY (unsupported for WorkflowType): %s", q)
		}
		if !strings.Contains(q, "WorkflowType = ") {
			t.Fatalf("count query missing type filter: %s", q)
		}
	}
}

func TestResolveTypesBatchesIntoINQueries(t *testing.T) {
	be := &discoverBackend{list: func(query string) []*workflowpb.WorkflowExecutionInfo {
		var out []*workflowpb.WorkflowExecutionInfo
		if strings.Contains(query, "'p1'") {
			out = append(out, execInfo("p1", "ParentWorkflow"))
		}
		if strings.Contains(query, "'s1'") {
			out = append(out, execInfo("s1", "SignalTarget"))
		}
		// "gone" intentionally resolves to nothing (retention expiry).
		return out
	}}

	got, err := ResolveTypes(context.Background(), be, "ns", []string{"p1", "s1", "gone", "p1"}, 10)
	if err != nil {
		t.Fatal(err)
	}
	if got["p1"] != "ParentWorkflow" || got["s1"] != "SignalTarget" {
		t.Fatalf("resolved = %v", got)
	}
	if _, ok := got["gone"]; ok {
		t.Error("unresolvable id should be absent, not an error")
	}
	if len(be.listQueries) != 1 {
		t.Fatalf("3 ids with chunk=10 should be one batched call, made %d", len(be.listQueries))
	}
	if !strings.HasPrefix(be.listQueries[0], "WorkflowId IN (") {
		t.Fatalf("expected a batched IN query, got %s", be.listQueries[0])
	}
}

func TestResolveTypesChunks(t *testing.T) {
	be := &discoverBackend{}
	if _, err := ResolveTypes(context.Background(), be, "ns", []string{"a", "b", "c", "d", "e"}, 2); err != nil {
		t.Fatal(err)
	}
	if len(be.listQueries) != 3 { // 2 + 2 + 1
		t.Fatalf("5 ids at chunk=2 should be 3 calls, made %d", len(be.listQueries))
	}
}

func TestQuoteEscapes(t *testing.T) {
	if got := quote("order's-1"); got != "'order''s-1'" {
		t.Fatalf("quote = %s", got)
	}
}
