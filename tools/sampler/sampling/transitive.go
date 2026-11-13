package sampling

import (
	"cmp"
	"slices"

	enumspb "go.temporal.io/api/enums/v1"
	historypb "go.temporal.io/api/history/v1"

	"github.com/jmbarzee/temporal-architect/tools/sampler/history"
)

// typeKey is what a run is counted under: a workflow type, or for a Nexus
// handler the operation (endpoint, "service.operation").
type typeKey struct {
	endpoint, name string
}

// ref is a run a fetched history names. An empty runID is a started Nexus
// operation that links none.
type ref struct {
	typeKey
	subject                      history.Subject
	namespace, workflowID, runID string
}

// fetchTransitive fetches the runs the histories name, and those the fetched
// runs name in turn: children from their started events, Nexus handlers from the
// workflow link of their started operation. Each run comes whole through
// fetchChain, and a type already holding limit executions in counts is not
// fetched further. It returns the new histories and the references it did not
// reach. A run the fetch cannot read is skipped, and is among the unreached.
func fetchTransitive(
	seed []history.History,
	fetched map[string]bool,
	counts map[typeKey]int,
	limit int,
	fetch func(namespace, workflowID, runID string) ([]*historypb.HistoryEvent, error),
) (found []history.History, unreached []history.Unreached, err error) {
	queue := slices.Clone(seed)
	slices.SortFunc(queue, func(a, b history.History) int {
		return cmp.Or(cmp.Compare(a.WorkflowID, b.WorkflowID), cmp.Compare(a.RunID, b.RunID))
	})
	for ; len(queue) > 0; queue = queue[1:] {
		caller := queue[0]
		for _, r := range references(caller) {
			u := history.Unreached{
				WorkflowID: caller.WorkflowID, RunID: caller.RunID,
				Subject: r.subject, Name: r.name, Target: r.endpoint, Unlinked: r.runID == "",
			}
			if u.Unlinked {
				unreached = append(unreached, u)
				continue
			}
			if fetched[r.runID] || counts[r.typeKey] >= limit {
				continue
			}
			counts[r.typeKey]++
			runs, err := fetchChain(candidate{workflowID: r.workflowID, runID: r.runID}, fetched, true,
				func(runID string) ([]*historypb.HistoryEvent, error) {
					return fetch(r.namespace, r.workflowID, runID)
				})
			if err != nil {
				return nil, nil, err
			}
			if !fetched[r.runID] {
				unreached = append(unreached, u)
			}
			for _, run := range runs {
				h := history.History{WorkflowID: r.workflowID, RunID: run.runID, Namespace: r.namespace, Events: run.events}
				found = append(found, h)
				queue = append(queue, h)
			}
		}
	}
	return found, unreached, nil
}

// references lists the runs a history names, in event order.
func references(h history.History) []ref {
	var refs []ref
	scheduled := map[int64]*historypb.NexusOperationScheduledEventAttributes{}
	for _, e := range h.Events {
		switch e.EventType {
		case enumspb.EVENT_TYPE_CHILD_WORKFLOW_EXECUTION_STARTED:
			a := e.GetChildWorkflowExecutionStartedEventAttributes()
			refs = append(refs, ref{
				typeKey:    typeKey{name: a.GetWorkflowType().GetName()},
				subject:    history.SubjectChild,
				namespace:  cmp.Or(a.GetNamespace(), h.Namespace),
				workflowID: a.GetWorkflowExecution().GetWorkflowId(),
				runID:      a.GetWorkflowExecution().GetRunId(),
			})
		case enumspb.EVENT_TYPE_NEXUS_OPERATION_SCHEDULED:
			scheduled[e.GetEventId()] = e.GetNexusOperationScheduledEventAttributes()
		case enumspb.EVENT_TYPE_NEXUS_OPERATION_STARTED:
			op := scheduled[e.GetNexusOperationStartedEventAttributes().GetScheduledEventId()]
			r := ref{
				typeKey:   typeKey{endpoint: op.GetEndpoint(), name: op.GetService() + "." + op.GetOperation()},
				subject:   history.SubjectNexus,
				namespace: h.Namespace,
			}
			for _, l := range e.GetLinks() {
				if w := l.GetWorkflowEvent(); w.GetRunId() != "" {
					r.namespace, r.workflowID, r.runID = cmp.Or(w.GetNamespace(), h.Namespace), w.GetWorkflowId(), w.GetRunId()
					break
				}
			}
			refs = append(refs, r)
		}
	}
	return refs
}
