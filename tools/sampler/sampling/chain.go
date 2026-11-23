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
// to it. A run the caller cannot read is skipped when it is linked to the
// candidate, or when lenient; the candidate's own is otherwise an error.
func fetchChain(cand candidate, fetched map[string]bool, lenient bool, fetch func(runID string) ([]*historypb.HistoryEvent, error)) ([]run, error) {
	var runs []run
	for pending := []string{cand.runID}; len(pending) > 0; pending = pending[1:] {
		id := pending[0]
		if fetched[id] {
			continue
		}
		events, err := fetch(id)
		if unreadable(err) && (lenient || id != cand.runID) {
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

// unreadable reports an error that says a run is gone or closed to the caller:
// past retention, in a namespace the caller cannot see, or denied.
func unreadable(err error) bool {
	var gone *serviceerror.NotFound
	var denied *serviceerror.PermissionDenied
	var noNamespace *serviceerror.NamespaceNotFound
	return errors.As(err, &gone) || errors.As(err, &denied) || errors.As(err, &noNamespace)
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
