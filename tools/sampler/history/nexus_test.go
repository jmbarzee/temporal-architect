package history

import (
	"reflect"
	"slices"
	"testing"
	"time"

	enumspb "go.temporal.io/api/enums/v1"
	historypb "go.temporal.io/api/history/v1"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/observe"
	"github.com/jmbarzee/temporal-architect/tools/sampler/design"
)

const nexusDesign = "../design/testdata/nexus"

// exec_nexus.json is an OrderWorkflow run on queue orders that schedules
// Invoices.Create through the endpoint billing four times, at minutes 2, 5, 7
// and 10.
func nexusHistories(t *testing.T) []History {
	t.Helper()
	h, err := LoadFile("testdata/exec_nexus.json", "order-001", "run-1")
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}
	return []History{h}
}

func nexusScheduled(endpoint, service, operation string, at time.Time) *historypb.HistoryEvent {
	return &historypb.HistoryEvent{
		EventType: enumspb.EVENT_TYPE_NEXUS_OPERATION_SCHEDULED,
		EventTime: timestamppb.New(at),
		Attributes: &historypb.HistoryEvent_NexusOperationScheduledEventAttributes{
			NexusOperationScheduledEventAttributes: &historypb.NexusOperationScheduledEventAttributes{
				Endpoint: endpoint, Service: service, Operation: operation,
			},
		},
	}
}

// Without a design nothing places the endpoint, so its endpoint, service and
// operation are orphans, joined by the call, the route and the operation's
// service.
func TestBuild_NexusWithoutDesign(t *testing.T) {
	opts := Options{Namespace: "shop", Window: observe.Window{Since: "2026-01-01T00:00:00Z", Until: "2026-01-01T00:10:00Z", Buckets: 2}}
	og := Build(nexusHistories(t), opts)

	wf := graph.HostedID(graph.KindWorkflow, "OrderWorkflow", "orders", "shop", false)
	endpoint := "nexusEndpoint:billing/orphan"
	service := "nexusService:Invoices/orphan"
	op := "nexusOperation:Invoices.Create/orphan"

	wantNodes := []graph.Node{
		{ID: endpoint, Definition: "nexusEndpoint:billing", Name: "billing", Orphan: true},
		{ID: service, Definition: "nexusService:Invoices", Name: "Invoices", Orphan: true},
		{ID: op, Definition: "nexusOperation:Invoices.Create", Name: "Invoices.Create", Orphan: true},
	}
	for _, want := range wantNodes {
		if !slices.ContainsFunc(og.Nodes, func(n graph.Node) bool { return reflect.DeepEqual(n, want) }) {
			t.Errorf("missing node %+v", want)
		}
	}
	if got, want := len(og.Nodes), 6; got != want { // the namespace, worker and workflow, and the three orphans
		t.Errorf("node count = %d, want %d", got, want)
	}

	call := findEdge(t, og, wf, op, graph.EdgeNexusCall)
	if !slices.Equal(call.Buckets, []int{1, 3}) {
		t.Errorf("nexusCall buckets = %v, want [1 3]", call.Buckets)
	}
	if call.Routing == nil || call.Routing.NexusEndpoint != endpoint {
		t.Errorf("nexusCall routing = %+v, want endpoint %s", call.Routing, endpoint)
	}
	for _, e := range []struct{ from, to, kind string }{
		{op, service, graph.EdgeContainment},
		{op, endpoint, graph.EdgeNexusRoute},
	} {
		if got := findEdge(t, og, e.from, e.to, e.kind); !slices.Equal(got.Buckets, []int{0, 0}) {
			t.Errorf("%s buckets = %v, want zeros", e.kind, got.Buckets)
		}
	}
	if got, want := len(og.Edges), 5; got != want { // the call, the two above, worker → namespace, workflow → worker
		t.Errorf("edge count = %d, want %d", got, want)
	}
	if len(og.Diagnostics) != 0 || len(og.Unresolved) != 0 {
		t.Errorf("unexpected diagnostics %+v or unresolved %+v", og.Diagnostics, og.Unresolved)
	}
}

// With the design the endpoint is in, the call lands on the nodes the design
// graph has for the endpoint, service and operation.
func TestBuild_NexusMatchesDesignGraph(t *testing.T) {
	d, err := design.Load(nexusDesign)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	og := Build(nexusHistories(t), Options{Namespace: "shop", Design: d})

	requireDesignGraph(t, og, d)
	if len(og.Diagnostics) != 0 || len(og.Unresolved) != 0 {
		t.Errorf("unexpected diagnostics %+v or unresolved %+v", og.Diagnostics, og.Unresolved)
	}
}

// An endpoint the design lacks is reported once, however many calls go through
// it, and its nodes stay orphans; a call through an endpoint it has is placed.
func TestBuild_NexusEndpointNotInDesign(t *testing.T) {
	d, err := design.Load(nexusDesign)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	h := History{WorkflowID: "order-001", RunID: "run-1", Events: []*historypb.HistoryEvent{
		startedEvent("OrderWorkflow", "orders", at),
		nexusScheduled("refunds", "Invoices", "Create", at),
		nexusScheduled("refunds", "Invoices", "Create", at),
		nexusScheduled("billing", "Invoices", "Create", at),
	}}
	og := Build([]History{h}, Options{Namespace: "shop", Design: d})

	refunds := "nexusEndpoint:refunds/orphan"
	want := []graph.Diagnostic{{
		Severity: "warning",
		Code:     "NEXUS_ENDPOINT_NOT_IN_DESIGN",
		Message:  `the design declares no static endpoint "refunds", so its nodes stay orphans`,
		From:     refunds,
	}}
	if !reflect.DeepEqual(og.Diagnostics, want) {
		t.Errorf("Diagnostics = %+v, want %+v", og.Diagnostics, want)
	}
	g := observe.ToGraph(og)
	wf := graph.HostedID(graph.KindWorkflow, "OrderWorkflow", "orders", "shop", false)
	orphanOp := "nexusOperation:Invoices.Create/orphan"
	placedOp := graph.HostedID(graph.KindNexusOperation, "Invoices.Create", "billing", "shop", false)
	if got := findEdge(t, og, wf, orphanOp, graph.EdgeNexusCall); !slices.Equal(got.Buckets, []int{2}) {
		t.Errorf("orphan nexusCall buckets = %v, want [2]", got.Buckets)
	}
	for _, e := range []struct{ from, to, kind string }{
		{wf, placedOp, graph.EdgeNexusCall},
		{orphanOp, refunds, graph.EdgeNexusRoute},
		{placedOp, graph.EndpointID("billing", "shop"), graph.EdgeNexusRoute},
	} {
		if !hasEdge(g, e.from, e.to, e.kind) {
			t.Errorf("missing %s %s → %s", e.kind, e.from, e.to)
		}
	}
}

// A service the design does not have on the endpoint's queue keeps its bare
// name and is reported unresolved, as a workflow or activity is.
func TestBuild_NexusServiceNotInDesign(t *testing.T) {
	d, err := design.Load(nexusDesign)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	h := History{WorkflowID: "order-001", RunID: "run-1", Events: []*historypb.HistoryEvent{
		startedEvent("OrderWorkflow", "orders", at),
		nexusScheduled("billing", "Ledger", "Post", at),
	}}
	og := Build([]History{h}, Options{Namespace: "shop", Design: d})

	service := graph.HostedID(graph.KindNexusService, "Ledger", "billing", "shop", false)
	op := graph.HostedID(graph.KindNexusOperation, "Ledger.Post", "billing", "shop", false)
	wantUnresolved := []graph.Unresolved{
		{From: op, Name: "Ledger.Post", Kind: graph.KindNexusOperation},
		{From: service, Name: "Ledger", Kind: graph.KindNexusService},
	}
	if !reflect.DeepEqual(og.Unresolved, wantUnresolved) {
		t.Errorf("Unresolved = %+v, want %+v", og.Unresolved, wantUnresolved)
	}
	g := observe.ToGraph(og)
	if !hasEdge(g, op, service, graph.EdgeContainment) || !hasEdge(g, service, graph.WorkerID("billing", "shop"), graph.EdgeContainment) {
		t.Errorf("the bare operation is not contained in its service on the billing worker")
	}
}
