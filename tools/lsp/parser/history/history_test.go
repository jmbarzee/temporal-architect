package history

import (
	"encoding/json"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
)

var defaultCtx = Context{Namespace: "default"}

// ---------------------------------------------------------------------------
// Fixture 1: single workflow + two activities on the same queue
// ---------------------------------------------------------------------------

func TestBuild_SingleWorkflowActivities(t *testing.T) {
	h, err := LoadFile("testdata/single_wf_activities.json", "order-001")
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}
	g := Build([]History{h}, defaultCtx)

	// Node IDs expected by the 1-worker-per-queue rule (worker name = queue name).
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

	// Containment edges: worker→ns, wf→worker, act1→worker, act2→worker.
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

	// Dispatch edges.
	if !hasEdge(g, wfID, actValidate, graph.EdgeActivityCall) {
		t.Errorf("missing activityCall %s → %s", wfID, actValidate)
	}
	if !hasEdge(g, wfID, actCharge, graph.EdgeActivityCall) {
		t.Errorf("missing activityCall %s → %s", wfID, actCharge)
	}

	// Summary consistency.
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
	g := Build([]History{parent, child}, defaultCtx)

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

	// Coarsened worker-tier edge: parentWorker → childWorker.
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

	g := Build([]History{saga, target}, defaultCtx)

	if !hasEdge(g, sagaWF, payWF, graph.EdgeSignalSend) {
		t.Errorf("missing signalSend %s → %s", sagaWF, payWF)
	}
	if len(g.Unresolved) != 0 {
		t.Errorf("unexpected unresolved entries: %+v", g.Unresolved)
	}

	// Determinism: shuffled input → byte-identical JSON output.
	g2 := Build([]History{target, saga}, defaultCtx)
	j1, _ := json.Marshal(g)
	j2, _ := json.Marshal(g2)
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

	// Build with only the saga — target workflowID not in batch.
	g := Build([]History{saga}, defaultCtx)

	sagaWF := graph.HostedID(graph.KindWorkflow, "OrderSaga", "saga-q", "default", false)

	// No signalSend edge.
	for _, e := range g.Edges {
		if e.Kind == graph.EdgeSignalSend {
			t.Errorf("unexpected signalSend edge: %+v", e)
		}
	}
	// One Unresolved entry.
	found := false
	for _, u := range g.Unresolved {
		if u.Kind == graph.EdgeSignalSend && u.From == sagaWF {
			found = true
		}
	}
	if !found {
		t.Errorf("expected Unresolved signalSend from %s; got %+v", sagaWF, g.Unresolved)
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
