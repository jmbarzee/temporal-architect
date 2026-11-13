package sampling

import (
	"errors"

	enumspb "go.temporal.io/api/enums/v1"
	historypb "go.temporal.io/api/history/v1"
	"go.temporal.io/api/serviceerror"
)

// run is one fetched run of a workflow.
type run struct {
	runID  string
	events []*historypb.HistoryEvent
}

// fetchChain fetches the candidate's run and every run linked to it by
// continue-as-new, in both directions, so a sampled workflow contributes its
// whole chain. Runs already in fetched are skipped, and those fetched are added
// to it. A linked run past retention is skipped; the candidate's own is not.
func fetchChain(cand candidate, fetched map[string]bool, fetch func(runID string) ([]*historypb.HistoryEvent, error)) ([]run, error) {
	var runs []run
	for pending := []string{cand.runID}; len(pending) > 0; pending = pending[1:] {
		id := pending[0]
		if fetched[id] {
			continue
		}
		events, err := fetch(id)
		var gone *serviceerror.NotFound
		if errors.As(err, &gone) && id != cand.runID {
			continue
		}
		if err != nil {
			return nil, err
		}
		fetched[id] = true
		runs = append(runs, run{runID: id, events: events})
		pending = append(pending, linkedRuns(events)...)
	}
	return runs, nil
}

// linkedRuns names the runs a history chains to: the one it continued from, and
// the one it continued as.
func linkedRuns(events []*historypb.HistoryEvent) []string {
	var ids []string
	for _, e := range events {
		switch e.EventType {
		case enumspb.EVENT_TYPE_WORKFLOW_EXECUTION_STARTED:
			if id := e.GetWorkflowExecutionStartedEventAttributes().GetContinuedExecutionRunId(); id != "" {
				ids = append(ids, id)
			}
		case enumspb.EVENT_TYPE_WORKFLOW_EXECUTION_CONTINUED_AS_NEW:
			if id := e.GetWorkflowExecutionContinuedAsNewEventAttributes().GetNewExecutionRunId(); id != "" {
				ids = append(ids, id)
			}
		}
	}
	return ids
}
