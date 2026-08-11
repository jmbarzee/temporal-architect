package history

import (
	"testing"

	commonpb "go.temporal.io/api/common/v1"
	enumspb "go.temporal.io/api/enums/v1"
	historypb "go.temporal.io/api/history/v1"
	taskqueuepb "go.temporal.io/api/taskqueue/v1"
)

func refTaskQueue() *taskqueuepb.TaskQueue {
	return &taskqueuepb.TaskQueue{Name: "q"}
}

func startedWithLinks(wfType, parentID, rootID string) *historypb.HistoryEvent {
	attr := &historypb.WorkflowExecutionStartedEventAttributes{
		WorkflowType: &commonpb.WorkflowType{Name: wfType},
		TaskQueue:    refTaskQueue(),
	}
	if parentID != "" {
		attr.ParentWorkflowExecution = &commonpb.WorkflowExecution{WorkflowId: parentID}
	}
	if rootID != "" {
		attr.RootWorkflowExecution = &commonpb.WorkflowExecution{WorkflowId: rootID}
	}
	return &historypb.HistoryEvent{
		EventType:  enumspb.EVENT_TYPE_WORKFLOW_EXECUTION_STARTED,
		Attributes: &historypb.HistoryEvent_WorkflowExecutionStartedEventAttributes{WorkflowExecutionStartedEventAttributes: attr},
	}
}

func childInitiated(childID string) *historypb.HistoryEvent {
	return &historypb.HistoryEvent{
		EventType: enumspb.EVENT_TYPE_START_CHILD_WORKFLOW_EXECUTION_INITIATED,
		Attributes: &historypb.HistoryEvent_StartChildWorkflowExecutionInitiatedEventAttributes{
			StartChildWorkflowExecutionInitiatedEventAttributes: &historypb.StartChildWorkflowExecutionInitiatedEventAttributes{
				WorkflowId:   childID,
				WorkflowType: &commonpb.WorkflowType{Name: "Child"},
				TaskQueue:    refTaskQueue(),
			},
		},
	}
}

func signalInitiated(targetID string) *historypb.HistoryEvent {
	return &historypb.HistoryEvent{
		EventType: enumspb.EVENT_TYPE_SIGNAL_EXTERNAL_WORKFLOW_EXECUTION_INITIATED,
		Attributes: &historypb.HistoryEvent_SignalExternalWorkflowExecutionInitiatedEventAttributes{
			SignalExternalWorkflowExecutionInitiatedEventAttributes: &historypb.SignalExternalWorkflowExecutionInitiatedEventAttributes{
				WorkflowExecution: &commonpb.WorkflowExecution{WorkflowId: targetID},
				SignalName:        "Ping",
			},
		},
	}
}

func TestReferences(t *testing.T) {
	histories := []History{
		{WorkflowID: "child-1", Events: []*historypb.HistoryEvent{
			startedWithLinks("ChildWorkflow", "parent-1", "root-1"),
			signalInitiated("peer-1"),
		}},
		{WorkflowID: "root-2", Events: []*historypb.HistoryEvent{
			// A root: no parent, and its own root so the field is absent.
			startedWithLinks("OrchestratorWorkflow", "", ""),
			childInitiated("kid-1"),
			signalInitiated("peer-1"), // duplicate across histories
		}},
	}

	refs := References(histories)

	assertStrings(t, "parents", refs.ParentWorkflowIDs, []string{"parent-1"})
	assertStrings(t, "roots", refs.RootWorkflowIDs, []string{"root-1"})
	assertStrings(t, "signal targets", refs.SignalTargetIDs, []string{"peer-1"})
	assertStrings(t, "children", refs.ChildWorkflowIDs, []string{"kid-1"})

	// IDs() is the untyped frontier: parents + roots + signal targets, never
	// children (whose type the initiating event already gave us).
	assertStrings(t, "IDs", refs.IDs(), []string{"parent-1", "peer-1", "root-1"})
}

func TestReferencesEmptyForSelfContainedHistory(t *testing.T) {
	refs := References([]History{
		{WorkflowID: "solo", Events: []*historypb.HistoryEvent{startedWithLinks("Solo", "", "")}},
	})
	if got := refs.IDs(); len(got) != 0 {
		t.Fatalf("expected no references, got %v", got)
	}
}

func assertStrings(t *testing.T, label string, got, want []string) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("%s = %v, want %v", label, got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("%s = %v, want %v", label, got, want)
		}
	}
}
