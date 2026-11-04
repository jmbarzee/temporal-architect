package ast

import (
	"encoding/json"
	"testing"
)

// TestWorkflowStartWire pins the wire strings for a start's mode and kind.
func TestWorkflowStartWire(t *testing.T) {
	tests := []struct {
		mode      WorkflowCallMode
		start     StartKind
		wantMode  string
		wantStart string
	}{
		{CallAttached, StartChild, "attached", "child"},
		{CallDetach, StartChild, "detach", "child"},
		{CallAttached, StartClient, "attached", "client"},
	}
	for _, tt := range tests {
		raw, err := marshalWorkflowCall(&WorkflowCall{Mode: tt.mode, Start: tt.start, Workflow: Ref[*WorkflowDef]{Name: "Q"}})
		if err != nil {
			t.Fatal(err)
		}
		var got WorkflowCallJSON
		if err := json.Unmarshal(raw, &got); err != nil {
			t.Fatal(err)
		}
		if got.Mode != tt.wantMode || got.Start != tt.wantStart {
			t.Errorf("mode/start = %s/%s, want %s/%s", got.Mode, got.Start, tt.wantMode, tt.wantStart)
		}
		target := marshalAsyncTarget(&WorkflowTarget{Start: tt.start, Workflow: Ref[*WorkflowDef]{Name: "Q"}})
		if target.Workflow.Start != tt.wantStart {
			t.Errorf("target start = %s, want %s", target.Workflow.Start, tt.wantStart)
		}
	}
}
