package sampling

import (
	"testing"

	enumspb "go.temporal.io/api/enums/v1"
	historypb "go.temporal.io/api/history/v1"
	"go.temporal.io/api/serviceerror"
)

func started(continuedFrom string) *historypb.HistoryEvent {
	return &historypb.HistoryEvent{
		EventType: enumspb.EVENT_TYPE_WORKFLOW_EXECUTION_STARTED,
		Attributes: &historypb.HistoryEvent_WorkflowExecutionStartedEventAttributes{
			WorkflowExecutionStartedEventAttributes: &historypb.WorkflowExecutionStartedEventAttributes{
				ContinuedExecutionRunId: continuedFrom,
			},
		},
	}
}

func continuedAs(next string) *historypb.HistoryEvent {
	return &historypb.HistoryEvent{
		EventType: enumspb.EVENT_TYPE_WORKFLOW_EXECUTION_CONTINUED_AS_NEW,
		Attributes: &historypb.HistoryEvent_WorkflowExecutionContinuedAsNewEventAttributes{
			WorkflowExecutionContinuedAsNewEventAttributes: &historypb.WorkflowExecutionContinuedAsNewEventAttributes{
				NewExecutionRunId: next,
			},
		},
	}
}

func TestFetchChain(t *testing.T) {
	// run-1 → run-2 → run-3; run-0 (before run-1) is past retention.
	histories := map[string][]*historypb.HistoryEvent{
		"run-1": {started("run-0"), continuedAs("run-2")},
		"run-2": {started("run-1"), continuedAs("run-3")},
		"run-3": {started("run-2")},
	}
	fetch := func(id string) ([]*historypb.HistoryEvent, error) {
		if h, ok := histories[id]; ok {
			return h, nil
		}
		return nil, serviceerror.NewNotFound("retention")
	}
	ids := func(runs []run) []string {
		var out []string
		for _, r := range runs {
			out = append(out, r.runID)
		}
		return out
	}

	for _, seed := range []string{"run-1", "run-2", "run-3"} {
		fetched := map[string]bool{}
		runs, err := fetchChain(candidate{runID: seed}, fetched, fetch)
		if err != nil {
			t.Fatalf("seed %s: %v", seed, err)
		}
		if got := len(runs); got != 3 {
			t.Errorf("seed %s fetched %v, want all 3 runs", seed, ids(runs))
		}
		// A second candidate from the same chain adds nothing.
		again, err := fetchChain(candidate{runID: "run-2"}, fetched, fetch)
		if err != nil || len(again) != 0 {
			t.Errorf("seed %s: refetch = %v, %v; want none", seed, ids(again), err)
		}
	}

	if _, err := fetchChain(candidate{runID: "run-0"}, map[string]bool{}, fetch); err == nil {
		t.Error("a candidate past retention must fail")
	}
}
