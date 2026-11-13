package history

import (
	"testing"
	"time"

	commonpb "go.temporal.io/api/common/v1"
	enumspb "go.temporal.io/api/enums/v1"
	historypb "go.temporal.io/api/history/v1"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
	"github.com/jmbarzee/temporal-architect/tools/sampler/design"
)

const schemesDesign = "../design/testdata/schemes"

var at = time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

func signalEvent(targetID, namespace string) *historypb.HistoryEvent {
	return &historypb.HistoryEvent{
		EventType: enumspb.EVENT_TYPE_SIGNAL_EXTERNAL_WORKFLOW_EXECUTION_INITIATED,
		EventTime: timestamppb.New(at),
		Attributes: &historypb.HistoryEvent_SignalExternalWorkflowExecutionInitiatedEventAttributes{
			SignalExternalWorkflowExecutionInitiatedEventAttributes: &historypb.SignalExternalWorkflowExecutionInitiatedEventAttributes{
				Namespace:         namespace,
				WorkflowExecution: &commonpb.WorkflowExecution{WorkflowId: targetID},
			},
		},
	}
}

// checkout is a run of Checkout that signals targetID in the sampled namespace.
func checkout(targetID string) History {
	return History{WorkflowID: "checkout-1", RunID: "run-1", Events: []*historypb.HistoryEvent{
		startedEvent("Checkout", "checkout", at),
		signalEvent(targetID, ""),
	}}
}

func checkoutID() string {
	return graph.HostedID(graph.KindWorkflow, "Checkout", "checkout", "prod", false)
}

func schemesOpts(t *testing.T) Options {
	t.Helper()
	d, err := design.Load(schemesDesign)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	return Options{Namespace: "prod", Design: d}
}

// A signal to an unsampled ID that fits one scheme lands on that scheme's
// workflow, on the queue its worker listens on.
func TestBuild_SignalTargetFromOneScheme(t *testing.T) {
	opts := schemesOpts(t)
	og := Build([]History{checkout("refund-7")}, opts)

	refund := graph.HostedID(graph.KindWorkflow, "Refund", "refunds", "prod", false)
	e := findEdge(t, og, checkoutID(), refund, graph.EdgeSignalSend)
	if !equalInts(e.Buckets, []int{1}) {
		t.Errorf("signalSend buckets = %v, want [1]", e.Buckets)
	}
	if len(og.Unresolved) != 0 || len(og.Diagnostics) != 0 {
		t.Errorf("unexpected unresolved %+v or diagnostics %+v", og.Unresolved, og.Diagnostics)
	}
}

// An ID that fits several schemes resolves to none, and the diagnostic names the
// candidates.
func TestBuild_SignalTargetFromManySchemes(t *testing.T) {
	opts := schemesOpts(t)
	og := Build([]History{checkout("ship-42-sku")}, opts)

	for _, e := range og.Edges {
		if e.Kind == graph.EdgeSignalSend {
			t.Errorf("unexpected signalSend edge: %+v", e)
		}
	}
	if len(og.Unresolved) != 1 || og.Unresolved[0].Kind != graph.EdgeSignalSend || og.Unresolved[0].Name != "ship-42-sku" {
		t.Errorf("Unresolved = %+v, want the signalSend to ship-42-sku", og.Unresolved)
	}
	want := graph.Diagnostic{
		Severity: "warning",
		Code:     DiagSignalTargetAmbiguous,
		Message:  `workflow ID "ship-42-sku" fits the id_schemes of ShipItem on queue shipping, ShipOrder on queue shipping`,
		From:     checkoutID(),
	}
	if len(og.Diagnostics) != 1 || og.Diagnostics[0] != want {
		t.Errorf("Diagnostics = %+v, want [%+v]", og.Diagnostics, want)
	}
}

// An ID that fits no scheme stays unresolved, as does one fitting a scheme
// whose workflow is not hosted in the target namespace.
func TestBuild_SignalTargetFromNoScheme(t *testing.T) {
	for _, id := range []string{"audit-1", "checkout-2"} {
		opts := schemesOpts(t)
		og := Build([]History{checkout(id)}, opts)
		if len(og.Unresolved) != 1 || og.Unresolved[0].Name != id || len(og.Diagnostics) != 0 {
			t.Errorf("%s: Unresolved = %+v, Diagnostics = %+v; want it unresolved, undiagnosed", id, og.Unresolved, og.Diagnostics)
		}
	}
	h := checkout("refund-7")
	h.Events[1] = signalEvent("refund-7", "staging")
	opts := schemesOpts(t)
	if og := Build([]History{h}, opts); len(og.Unresolved) != 1 {
		t.Errorf("signal to another namespace: Unresolved = %+v, want it unresolved", og.Unresolved)
	}
}

// A sampled run with the target's ID wins over the schemes.
func TestBuild_SampledRunBeatsScheme(t *testing.T) {
	opts := schemesOpts(t)
	sampled := History{WorkflowID: "refund-7", RunID: "run-1", Events: []*historypb.HistoryEvent{startedEvent("Refund", "elsewhere", at)}}
	og := Build([]History{checkout("refund-7"), sampled}, opts)

	elsewhere := graph.HostedID(graph.KindWorkflow, "Refund", "elsewhere", "prod", false)
	findEdge(t, og, checkoutID(), elsewhere, graph.EdgeSignalSend)
	refunds := graph.HostedID(graph.KindWorkflow, "Refund", "refunds", "prod", false)
	for _, e := range og.Edges {
		if e.To == refunds {
			t.Errorf("unexpected edge to the scheme's target: %+v", e)
		}
	}
}

// Without a design the schemes are unknown and the signal stays unresolved.
func TestBuild_SignalTargetWithoutDesign(t *testing.T) {
	og := Build([]History{checkout("refund-7")}, Options{Namespace: "prod"})
	if len(og.Unresolved) != 1 || len(og.Diagnostics) != 0 {
		t.Errorf("Unresolved = %+v, Diagnostics = %+v; want one unresolved", og.Unresolved, og.Diagnostics)
	}
}
