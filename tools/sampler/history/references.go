package history

import (
	"sort"

	enumspb "go.temporal.io/api/enums/v1"
	historypb "go.temporal.io/api/history/v1"
)

// Refs are the other workflow executions a history points at. They are the
// non-typed half of relationship discovery: a history names a CHILD's workflow
// type outright (StartChildWorkflowExecutionInitiated carries workflowType), but
// a parent, a root, and a signal target are identified by workflow ID only. The
// sampler resolves those IDs to types with sampling.ResolveTypes and feeds any
// new type back into the discovery set.
//
// Parent and Root are the valuable direction. A random sample is dominated by
// whatever runs most, which is usually leaf children; walking UP to the
// orchestrator that started them surfaces exactly the rare types the sample
// misses. Root reaches the top of the tree in one hop instead of climbing
// parent-by-parent, when the server populates it.
type Refs struct {
	// ParentWorkflowIDs are the immediate parents of the sampled executions.
	ParentWorkflowIDs []string
	// RootWorkflowIDs are the roots of the sampled executions' trees. Empty when
	// an execution is its own root, or on servers that predate the field.
	RootWorkflowIDs []string
	// SignalTargetIDs are external workflows signalled by the sampled
	// executions.
	SignalTargetIDs []string
	// ChildWorkflowIDs are children started by the sampled executions. Their
	// types are already known from the initiating event; the IDs are kept for
	// walking DOWN into a specific execution when that is wanted.
	ChildWorkflowIDs []string
}

// IDs returns every referenced workflow ID whose type is unknown from the
// history alone — parents, roots, and signal targets — deduped and sorted.
// Child IDs are excluded because the initiating event already names their type.
func (r Refs) IDs() []string {
	return dedupeSorted(r.ParentWorkflowIDs, r.RootWorkflowIDs, r.SignalTargetIDs)
}

// References extracts the referenced executions from a set of histories.
func References(histories []History) Refs {
	var refs Refs
	for _, h := range histories {
		for _, e := range h.Events {
			switch e.EventType {
			case enumspb.EVENT_TYPE_WORKFLOW_EXECUTION_STARTED:
				collectStarted(e, &refs)
			case enumspb.EVENT_TYPE_START_CHILD_WORKFLOW_EXECUTION_INITIATED:
				if attr := e.GetStartChildWorkflowExecutionInitiatedEventAttributes(); attr != nil {
					refs.ChildWorkflowIDs = appendNonEmpty(refs.ChildWorkflowIDs, attr.GetWorkflowId())
				}
			case enumspb.EVENT_TYPE_SIGNAL_EXTERNAL_WORKFLOW_EXECUTION_INITIATED:
				if attr := e.GetSignalExternalWorkflowExecutionInitiatedEventAttributes(); attr != nil {
					refs.SignalTargetIDs = appendNonEmpty(refs.SignalTargetIDs, attr.GetWorkflowExecution().GetWorkflowId())
				}
			}
		}
	}
	refs.ParentWorkflowIDs = dedupeSorted(refs.ParentWorkflowIDs)
	refs.RootWorkflowIDs = dedupeSorted(refs.RootWorkflowIDs)
	refs.SignalTargetIDs = dedupeSorted(refs.SignalTargetIDs)
	refs.ChildWorkflowIDs = dedupeSorted(refs.ChildWorkflowIDs)
	return refs
}

// collectStarted pulls the upward links off the first event. Both fields are
// absent for a top-level execution: a workflow with no parent has no
// parent_workflow_execution, and a workflow that is its own root has a nil
// root_workflow_execution (so an empty Root means "this IS a root").
func collectStarted(e *historypb.HistoryEvent, refs *Refs) {
	attr := e.GetWorkflowExecutionStartedEventAttributes()
	if attr == nil {
		return
	}
	refs.ParentWorkflowIDs = appendNonEmpty(refs.ParentWorkflowIDs, attr.GetParentWorkflowExecution().GetWorkflowId())
	refs.RootWorkflowIDs = appendNonEmpty(refs.RootWorkflowIDs, attr.GetRootWorkflowExecution().GetWorkflowId())
}

func appendNonEmpty(dst []string, s string) []string {
	if s == "" {
		return dst
	}
	return append(dst, s)
}

func dedupeSorted(lists ...[]string) []string {
	seen := map[string]bool{}
	var out []string
	for _, list := range lists {
		for _, s := range list {
			if s == "" || seen[s] {
				continue
			}
			seen[s] = true
			out = append(out, s)
		}
	}
	sort.Strings(out)
	return out
}
