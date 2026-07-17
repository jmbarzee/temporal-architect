package history

import (
	"encoding/json"
	"testing"
	"time"

	commonpb "go.temporal.io/api/common/v1"
	enumspb "go.temporal.io/api/enums/v1"
	historypb "go.temporal.io/api/history/v1"
	taskqueuepb "go.temporal.io/api/taskqueue/v1"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/observe"
)

var defaultOpts = Options{Namespace: "default"}

// buildGraph runs Build and projects to graph.Graph so the structural
// assertions can reuse the graph vocabulary.
func buildGraph(hs []History, opts Options) *graph.Graph {
	return observe.ToGraph(Build(hs, opts))
}

// ---------------------------------------------------------------------------
// Fixture 1: single workflow + two activities on the same queue
// ---------------------------------------------------------------------------

func TestBuild_SingleWorkflowActivities(t *testing.T) {
	h, err := LoadFile("testdata/single_wf_activities.json", "order-001")
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}
	g := buildGraph([]History{h}, defaultOpts)

	nsID := graph.NamespaceID("default")
	workerID := graph.WorkerID("orders", "default")
	wfID := graph.HostedID(graph.KindWorkflow, "OrderWorkflow", "orders", "default", false)
	actValidate := graph.HostedID(graph.KindActivity, "ValidateOrder", "orders", "default", false)
	actCharge := graph.HostedID(graph.KindActivity, "ChargePayment", "orders", "default", false)

	wantNodes := []string{nsID, workerID, wfID, actValidate, actCharge}
	for _, id := range wantNodes {
		if !hasNode(g, id) {
			t.Errorf("missing node %q", id)
		}
	}
	if got := len(g.Nodes); got != len(wantNodes) {
		t.Errorf("node count = %d, want %d", got, len(wantNodes))
	}

	if !hasEdge(g, workerID, nsID, graph.EdgeContainment) {
		t.Errorf("missing containment %s → %s", workerID, nsID)
	}
	if !hasEdge(g, wfID, workerID, graph.EdgeContainment) {
		t.Errorf("missing containment %s → %s", wfID, workerID)
	}
	if !hasEdge(g, actValidate, workerID, graph.EdgeContainment) {
		t.Errorf("missing containment %s → %s", actValidate, workerID)
	}
	if !hasEdge(g, actCharge, workerID, graph.EdgeContainment) {
		t.Errorf("missing containment %s → %s", actCharge, workerID)
	}

	if !hasEdge(g, wfID, actValidate, graph.EdgeActivityCall) {
		t.Errorf("missing activityCall %s → %s", wfID, actValidate)
	}
	if !hasEdge(g, wfID, actCharge, graph.EdgeActivityCall) {
		t.Errorf("missing activityCall %s → %s", wfID, actCharge)
	}

	if g.Summary.Nodes != len(g.Nodes) {
		t.Errorf("summary.nodes mismatch: %d vs %d", g.Summary.Nodes, len(g.Nodes))
	}
	if g.Summary.Edges != len(g.Edges) {
		t.Errorf("summary.edges mismatch: %d vs %d", g.Summary.Edges, len(g.Edges))
	}
}

// ---------------------------------------------------------------------------
// Fixture 2: parent workflow starts child on a different queue
// ---------------------------------------------------------------------------

func TestBuild_ParentChildCrossQueue(t *testing.T) {
	parent, err := LoadFile("testdata/parent_child_cross_queue_parent.json", "parent-001")
	if err != nil {
		t.Fatalf("LoadFile parent: %v", err)
	}
	child, err := LoadFile("testdata/parent_child_cross_queue_child.json", "child-001")
	if err != nil {
		t.Fatalf("LoadFile child: %v", err)
	}
	g := buildGraph([]History{parent, child}, defaultOpts)

	parentWorker := graph.WorkerID("parent-q", "default")
	childWorker := graph.WorkerID("child-q", "default")
	parentWF := graph.HostedID(graph.KindWorkflow, "ParentWorkflow", "parent-q", "default", false)
	childWF := graph.HostedID(graph.KindWorkflow, "ChildWorkflow", "child-q", "default", false)

	for _, id := range []string{parentWorker, childWorker, parentWF, childWF} {
		if !hasNode(g, id) {
			t.Errorf("missing node %q", id)
		}
	}

	if !hasEdge(g, parentWF, childWF, graph.EdgeWorkflowCall) {
		t.Errorf("missing workflowCall %s → %s", parentWF, childWF)
	}

	foundCoarsened := false
	for _, ce := range g.CoarsenedEdges {
		if ce.Tier == graph.TierWorker && ce.From == parentWorker && ce.To == childWorker {
			foundCoarsened = true
		}
	}
	if !foundCoarsened {
		t.Errorf("missing worker-tier coarsened edge %s → %s", parentWorker, childWorker)
	}
}

// ---------------------------------------------------------------------------
// Fixture 3: in-batch signal-target resolution + determinism
// ---------------------------------------------------------------------------

func TestBuild_SignalSend(t *testing.T) {
	saga, err := LoadFile("testdata/signal_send_saga.json", "saga-001")
	if err != nil {
		t.Fatalf("LoadFile saga: %v", err)
	}
	target, err := LoadFile("testdata/signal_send_target.json", "process-payment-001")
	if err != nil {
		t.Fatalf("LoadFile target: %v", err)
	}

	sagaWF := graph.HostedID(graph.KindWorkflow, "OrderSaga", "saga-q", "default", false)
	payWF := graph.HostedID(graph.KindWorkflow, "ProcessPayment", "saga-q", "default", false)

	og := Build([]History{saga, target}, defaultOpts)
	g := observe.ToGraph(og)

	if !hasEdge(g, sagaWF, payWF, graph.EdgeSignalSend) {
		t.Errorf("missing signalSend %s → %s", sagaWF, payWF)
	}
	if len(og.Unresolved) != 0 {
		t.Errorf("unexpected unresolved entries: %+v", og.Unresolved)
	}

	// Determinism: shuffled input → byte-identical JSON output.
	og2 := Build([]History{target, saga}, defaultOpts)
	j1, _ := json.Marshal(og)
	j2, _ := json.Marshal(og2)
	if string(j1) != string(j2) {
		t.Errorf("Build is not deterministic:\n  run1: %s\n  run2: %s", j1, j2)
	}
}

// ---------------------------------------------------------------------------
// Fixture 3b: unresolved signal (target not in batch)
// ---------------------------------------------------------------------------

func TestBuild_SignalSend_Unresolved(t *testing.T) {
	saga, err := LoadFile("testdata/signal_send_saga.json", "saga-001")
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}

	og := Build([]History{saga}, defaultOpts)
	sagaWF := graph.HostedID(graph.KindWorkflow, "OrderSaga", "saga-q", "default", false)

	for _, e := range og.Edges {
		if e.Kind == graph.EdgeSignalSend {
			t.Errorf("unexpected signalSend edge: %+v", e)
		}
	}
	found := false
	for _, u := range og.Unresolved {
		if u.Kind == graph.EdgeSignalSend && u.From == sagaWF {
			found = true
		}
	}
	if !found {
		t.Errorf("expected Unresolved signalSend from %s; got %+v", sagaWF, og.Unresolved)
	}
}

// ---------------------------------------------------------------------------
// Occurrence time series
// ---------------------------------------------------------------------------

// TestBuild_Buckets_Default asserts that with the default (single-bucket)
// window, every dispatch edge carries a length-1 series counting occurrences,
// and containment edges carry an all-zero series.
func TestBuild_Buckets_Default(t *testing.T) {
	epoch := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	// One workflow that calls the same activity twice.
	h := History{
		WorkflowID: "wf-1",
		Namespace:  "default",
		Events: []*historypb.HistoryEvent{
			startedEvent("BatchWorkflow", "q", epoch),
			activityScheduled("DoThing", "q", epoch.Add(1*time.Minute)),
			activityScheduled("DoThing", "q", epoch.Add(2*time.Minute)),
		},
	}
	og := Build([]History{h}, Options{Namespace: "default"})

	if og.Window.Buckets != 1 {
		t.Fatalf("default window buckets = %d, want 1", og.Window.Buckets)
	}
	wf := graph.HostedID(graph.KindWorkflow, "BatchWorkflow", "q", "default", false)
	act := graph.HostedID(graph.KindActivity, "DoThing", "q", "default", false)

	e := findEdge(t, og, wf, act, graph.EdgeActivityCall)
	if len(e.Buckets) != 1 || e.Buckets[0] != 2 {
		t.Errorf("activityCall buckets = %v, want [2]", e.Buckets)
	}
	// Containment edge carries a zeroed series of the same length.
	c := findEdge(t, og, act, graph.WorkerID("q", "default"), graph.EdgeContainment)
	if len(c.Buckets) != 1 || c.Buckets[0] != 0 {
		t.Errorf("containment buckets = %v, want [0]", c.Buckets)
	}
}

// TestBuild_Buckets_TimeSeries asserts occurrences are distributed into the
// correct absolute-time buckets, and that a re-sampled shard merges by summing.
func TestBuild_Buckets_TimeSeries(t *testing.T) {
	since := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	until := since.Add(4 * time.Hour) // 4 buckets of 1h each
	win := observe.Window{
		Since:   since.Format(time.RFC3339),
		Until:   until.Format(time.RFC3339),
		Buckets: 4,
	}
	// Two activity calls: one in bucket 0 (00:30), one in bucket 2 (02:30).
	h := History{
		WorkflowID: "wf-1",
		Namespace:  "default",
		Events: []*historypb.HistoryEvent{
			startedEvent("W", "q", since),
			activityScheduled("A", "q", since.Add(30*time.Minute)),
			activityScheduled("A", "q", since.Add(2*time.Hour+30*time.Minute)),
		},
	}
	og := Build([]History{h}, Options{Namespace: "default", Window: win})

	wf := graph.HostedID(graph.KindWorkflow, "W", "q", "default", false)
	act := graph.HostedID(graph.KindActivity, "A", "q", "default", false)
	e := findEdge(t, og, wf, act, graph.EdgeActivityCall)
	want := []int{1, 0, 1, 0}
	if !equalInts(e.Buckets, want) {
		t.Errorf("buckets = %v, want %v", e.Buckets, want)
	}

	// Merge with an identically-windowed shard: buckets sum element-wise.
	merged := observe.Merge(og, og)
	me := findEdge(t, merged, wf, act, graph.EdgeActivityCall)
	wantMerged := []int{2, 0, 2, 0}
	if !equalInts(me.Buckets, wantMerged) {
		t.Errorf("merged buckets = %v, want %v", me.Buckets, wantMerged)
	}
}

// ---------------------------------------------------------------------------
// Event constructors
// ---------------------------------------------------------------------------

func startedEvent(wfType, queue string, at time.Time) *historypb.HistoryEvent {
	return &historypb.HistoryEvent{
		EventType: enumspb.EVENT_TYPE_WORKFLOW_EXECUTION_STARTED,
		EventTime: timestamppb.New(at),
		Attributes: &historypb.HistoryEvent_WorkflowExecutionStartedEventAttributes{
			WorkflowExecutionStartedEventAttributes: &historypb.WorkflowExecutionStartedEventAttributes{
				WorkflowType: &commonpb.WorkflowType{Name: wfType},
				TaskQueue:    &taskqueuepb.TaskQueue{Name: queue},
			},
		},
	}
}

func activityScheduled(actType, queue string, at time.Time) *historypb.HistoryEvent {
	return &historypb.HistoryEvent{
		EventType: enumspb.EVENT_TYPE_ACTIVITY_TASK_SCHEDULED,
		EventTime: timestamppb.New(at),
		Attributes: &historypb.HistoryEvent_ActivityTaskScheduledEventAttributes{
			ActivityTaskScheduledEventAttributes: &historypb.ActivityTaskScheduledEventAttributes{
				ActivityType: &commonpb.ActivityType{Name: actType},
				TaskQueue:    &taskqueuepb.TaskQueue{Name: queue},
			},
		},
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func hasNode(g *graph.Graph, id string) bool {
	for _, n := range g.Nodes {
		if n.ID == id {
			return true
		}
	}
	return false
}

func hasEdge(g *graph.Graph, from, to, kind string) bool {
	for _, e := range g.Edges {
		if e.From == from && e.To == to && e.Kind == kind {
			return true
		}
	}
	return false
}

func findEdge(t *testing.T, og *observe.ObservedGraph, from, to, kind string) observe.ObservedEdge {
	t.Helper()
	for _, e := range og.Edges {
		if e.From == from && e.To == to && e.Kind == kind {
			return e
		}
	}
	t.Fatalf("edge %s -%s-> %s not found", from, kind, to)
	return observe.ObservedEdge{}
}

func equalInts(a, b []int) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
