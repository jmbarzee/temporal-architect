package sampling

import (
	"fmt"
	"slices"
	"testing"

	commonpb "go.temporal.io/api/common/v1"
	enumspb "go.temporal.io/api/enums/v1"
	historypb "go.temporal.io/api/history/v1"
	"go.temporal.io/api/serviceerror"

	"github.com/jmbarzee/temporal-architect/tools/sampler/history"
)

func childStarted(namespace, workflowID, runID, workflowType string) *historypb.HistoryEvent {
	return &historypb.HistoryEvent{
		EventType: enumspb.EVENT_TYPE_CHILD_WORKFLOW_EXECUTION_STARTED,
		Attributes: &historypb.HistoryEvent_ChildWorkflowExecutionStartedEventAttributes{
			ChildWorkflowExecutionStartedEventAttributes: &historypb.ChildWorkflowExecutionStartedEventAttributes{
				Namespace:         namespace,
				WorkflowExecution: &commonpb.WorkflowExecution{WorkflowId: workflowID, RunId: runID},
				WorkflowType:      &commonpb.WorkflowType{Name: workflowType},
			},
		},
	}
}

func nexusScheduled(id int64, endpoint, service, operation string) *historypb.HistoryEvent {
	return &historypb.HistoryEvent{
		EventId:   id,
		EventType: enumspb.EVENT_TYPE_NEXUS_OPERATION_SCHEDULED,
		Attributes: &historypb.HistoryEvent_NexusOperationScheduledEventAttributes{
			NexusOperationScheduledEventAttributes: &historypb.NexusOperationScheduledEventAttributes{
				Endpoint: endpoint, Service: service, Operation: operation,
			},
		},
	}
}

// nexusStarted is the started event of the operation scheduled at scheduledID;
// handler, if set, is the workflow link the server attaches for a workflow run.
func nexusStarted(scheduledID int64, handler *commonpb.Link_WorkflowEvent) *historypb.HistoryEvent {
	e := &historypb.HistoryEvent{
		EventType: enumspb.EVENT_TYPE_NEXUS_OPERATION_STARTED,
		Attributes: &historypb.HistoryEvent_NexusOperationStartedEventAttributes{
			NexusOperationStartedEventAttributes: &historypb.NexusOperationStartedEventAttributes{ScheduledEventId: scheduledID},
		},
	}
	if handler != nil {
		e.Links = []*commonpb.Link{{Variant: &commonpb.Link_WorkflowEvent_{WorkflowEvent: handler}}}
	}
	return e
}

func handlerLink(namespace, workflowID, runID string) *commonpb.Link_WorkflowEvent {
	return &commonpb.Link_WorkflowEvent{Namespace: namespace, WorkflowId: workflowID, RunId: runID}
}

func nsHistory(namespace, workflowID, runID string, events ...*historypb.HistoryEvent) history.History {
	return history.History{WorkflowID: workflowID, RunID: runID, Namespace: namespace, Events: events}
}

// world is the runs a fake namespace holds, keyed "namespace/workflowID/runID".
// A key in errs answers its error; any other missing run is past retention.
type world struct {
	runs  map[string][]*historypb.HistoryEvent
	errs  map[string]error
	calls []string
}

func (w *world) fetch(namespace, workflowID, runID string) ([]*historypb.HistoryEvent, error) {
	key := fmt.Sprintf("%s/%s/%s", namespace, workflowID, runID)
	w.calls = append(w.calls, key)
	if err := w.errs[key]; err != nil {
		return nil, err
	}
	if events, ok := w.runs[key]; ok {
		return events, nil
	}
	return nil, serviceerror.NewNotFound("retention")
}

// walk runs fetchTransitive from the seeds, which count as fetched, with held
// executions already in counts, and names the found runs "workflowID/runID".
func walk(t *testing.T, w *world, seed []history.History, held map[typeKey]int, limit int) (found []string, unreached []history.Unreached) {
	t.Helper()
	fetched := map[string]bool{}
	for _, h := range seed {
		fetched[h.RunID] = true
	}
	hs, unreached, err := fetchTransitive(seed, fetched, held, limit, w.fetch)
	if err != nil {
		t.Fatalf("fetchTransitive: %v", err)
	}
	for _, h := range hs {
		found = append(found, h.WorkflowID+"/"+h.RunID)
	}
	return found, unreached
}

func TestFetchTransitive_Child(t *testing.T) {
	parent := nsHistory("ns", "parent", "p1", childStarted("ns", "kid", "k1", "Kid"))

	t.Run("an unsampled child type is fetched", func(t *testing.T) {
		w := &world{runs: map[string][]*historypb.HistoryEvent{"ns/kid/k1": {started("")}}}
		found, unreached := walk(t, w, []history.History{parent}, map[typeKey]int{}, 5)
		if !slices.Equal(found, []string{"kid/k1"}) || len(unreached) != 0 {
			t.Errorf("found %v, unreached %v; want kid/k1 and none", found, unreached)
		}
	})

	t.Run("a repeat is fetched once", func(t *testing.T) {
		other := nsHistory("ns", "parent-2", "p2", childStarted("ns", "kid", "k1", "Kid"))
		w := &world{runs: map[string][]*historypb.HistoryEvent{"ns/kid/k1": {started("")}}}
		found, _ := walk(t, w, []history.History{parent, other}, map[typeKey]int{}, 5)
		if !slices.Equal(found, []string{"kid/k1"}) || len(w.calls) != 1 {
			t.Errorf("found %v after %v; want one fetch of kid/k1", found, w.calls)
		}
	})

	t.Run("a child's continue-as-new chain comes whole", func(t *testing.T) {
		w := &world{runs: map[string][]*historypb.HistoryEvent{
			"ns/kid/k1": {started(""), continuedAs("k2")},
			"ns/kid/k2": {started("k1")},
		}}
		found, _ := walk(t, w, []history.History{parent}, map[typeKey]int{}, 5)
		if !slices.Equal(found, []string{"kid/k1", "kid/k2"}) {
			t.Errorf("found %v, want both runs", found)
		}
	})

	t.Run("a grandchild is fetched", func(t *testing.T) {
		w := &world{runs: map[string][]*historypb.HistoryEvent{
			"ns/kid/k1":   {started(""), childStarted("ns", "grand", "g1", "Grand")},
			"ns/grand/g1": {started("")},
		}}
		found, _ := walk(t, w, []history.History{parent}, map[typeKey]int{}, 5)
		if !slices.Equal(found, []string{"kid/k1", "grand/g1"}) {
			t.Errorf("found %v, want kid/k1 and grand/g1", found)
		}
	})

	t.Run("a cycle terminates", func(t *testing.T) {
		// a1 starts b1, which starts a new run a2 of A, which starts b1 again.
		a1 := nsHistory("ns", "a", "a1", childStarted("ns", "b", "b1", "B"))
		w := &world{runs: map[string][]*historypb.HistoryEvent{
			"ns/b/b1": {started(""), childStarted("ns", "a", "a2", "A")},
			"ns/a/a2": {started(""), childStarted("ns", "b", "b1", "B")},
		}}
		found, _ := walk(t, w, []history.History{a1}, map[typeKey]int{}, 5)
		if !slices.Equal(found, []string{"b/b1", "a/a2"}) {
			t.Errorf("found %v, want b/b1 and a/a2", found)
		}
	})
}

func TestFetchTransitive_Cap(t *testing.T) {
	var events []*historypb.HistoryEvent
	w := &world{runs: map[string][]*historypb.HistoryEvent{}}
	for _, id := range []string{"k1", "k2", "k3"} {
		events = append(events, childStarted("ns", "kid-"+id, id, "Kid"))
		w.runs["ns/kid-"+id+"/"+id] = []*historypb.HistoryEvent{started("")}
	}
	parent := nsHistory("ns", "parent", "p1", events...)
	kid := typeKey{name: "Kid"}

	found, unreached := walk(t, w, []history.History{parent}, map[typeKey]int{}, 2)
	if got := len(found); got != 2 {
		t.Errorf("fetched %v under a cap of 2, want 2", found)
	}
	if len(unreached) != 0 {
		t.Errorf("a run left to the cap is not unreached, got %v", unreached)
	}

	// A reference to a run already fetched does not consume the cap.
	repeat := nsHistory("ns", "parent", "p1",
		childStarted("ns", "kid-k1", "k1", "Kid"), childStarted("ns", "kid-k1", "k1", "Kid"), childStarted("ns", "kid-k2", "k2", "Kid"))
	found, _ = walk(t, w, []history.History{repeat}, map[typeKey]int{}, 2)
	if !slices.Equal(found, []string{"kid-k1/k1", "kid-k2/k2"}) {
		t.Errorf("found %v under a cap of 2 with k1 named twice, want k1 and k2", found)
	}

	// An execution already held, sampled or fetched, counts against the cap.
	found, _ = walk(t, w, []history.History{parent}, map[typeKey]int{kid: 1}, 2)
	if got := len(found); got != 1 {
		t.Errorf("fetched %v with one Kid held under a cap of 2, want 1", found)
	}
}

func TestFetchTransitive_Unreadable(t *testing.T) {
	t.Run("a child past retention", func(t *testing.T) {
		parent := nsHistory("ns", "parent", "p1", childStarted("ns", "kid", "k1", "Kid"))
		found, unreached := walk(t, &world{}, []history.History{parent}, map[typeKey]int{}, 5)
		want := history.Unreached{WorkflowID: "parent", RunID: "p1", Subject: history.SubjectChild, Name: "Kid"}
		if len(found) != 0 || !slices.Equal(unreached, []history.Unreached{want}) {
			t.Errorf("found %v, unreached %v; want none and %v", found, unreached, want)
		}
	})

	for name, err := range map[string]error{
		"denied":            serviceerror.NewPermissionDenied("no access", ""),
		"no such namespace": serviceerror.NewNamespaceNotFound("other"),
	} {
		t.Run("a child in another namespace that is "+name, func(t *testing.T) {
			parent := nsHistory("ns", "parent", "p1", childStarted("other", "kid", "k1", "Kid"))
			w := &world{
				runs: map[string][]*historypb.HistoryEvent{"other/kid/k1": {started("")}},
				errs: map[string]error{"other/kid/k1": err},
			}
			found, unreached := walk(t, w, []history.History{parent}, map[typeKey]int{}, 5)
			if len(found) != 0 || len(unreached) != 1 {
				t.Errorf("found %v, unreached %v; want none and one", found, unreached)
			}
		})
	}

	t.Run("a child in another namespace is fetched there", func(t *testing.T) {
		parent := nsHistory("ns", "parent", "p1", childStarted("other", "kid", "k1", "Kid"))
		w := &world{runs: map[string][]*historypb.HistoryEvent{"other/kid/k1": {started("")}}}
		found, _ := walk(t, w, []history.History{parent}, map[typeKey]int{}, 5)
		if !slices.Equal(found, []string{"kid/k1"}) {
			t.Errorf("found %v, want kid/k1", found)
		}
	})

	t.Run("any other error is fatal", func(t *testing.T) {
		parent := nsHistory("ns", "parent", "p1", childStarted("ns", "kid", "k1", "Kid"))
		boom := func(string, string, string) ([]*historypb.HistoryEvent, error) {
			return nil, serviceerror.NewInternal("boom")
		}
		if _, _, err := fetchTransitive([]history.History{parent}, map[string]bool{}, map[typeKey]int{}, 5, boom); err == nil {
			t.Error("an Internal error must fail the pass")
		}
	})
}

func TestFetchTransitive_Nexus(t *testing.T) {
	op := func(handler *commonpb.Link_WorkflowEvent) history.History {
		return nsHistory("ns", "caller", "c1", nexusScheduled(5, "billing", "Invoices", "Create"), nexusStarted(5, handler))
	}
	opKey := typeKey{endpoint: "billing", name: "Invoices.Create"}

	t.Run("a linked handler run is fetched", func(t *testing.T) {
		w := &world{runs: map[string][]*historypb.HistoryEvent{"billing-ns/handler/h1": {started("")}}}
		counts := map[typeKey]int{}
		found, unreached := walk(t, w, []history.History{op(handlerLink("billing-ns", "handler", "h1"))}, counts, 5)
		if !slices.Equal(found, []string{"handler/h1"}) || len(unreached) != 0 || counts[opKey] != 1 {
			t.Errorf("found %v, unreached %v, counted %d; want handler/h1, none, 1", found, unreached, counts[opKey])
		}
	})

	t.Run("an unreadable handler run is unreached", func(t *testing.T) {
		_, unreached := walk(t, &world{}, []history.History{op(handlerLink("ns", "handler", "h1"))}, map[typeKey]int{}, 5)
		want := history.Unreached{WorkflowID: "caller", RunID: "c1", Subject: history.SubjectNexus, Name: "Invoices.Create", Target: "billing"}
		if !slices.Equal(unreached, []history.Unreached{want}) {
			t.Errorf("unreached %v, want %v", unreached, want)
		}
	})

	t.Run("a started operation with no link is unlinked", func(t *testing.T) {
		w := &world{}
		found, unreached := walk(t, w, []history.History{op(nil)}, map[typeKey]int{}, 5)
		want := history.Unreached{WorkflowID: "caller", RunID: "c1", Subject: history.SubjectNexus, Name: "Invoices.Create", Target: "billing", Unlinked: true}
		if len(found) != 0 || len(w.calls) != 0 || !slices.Equal(unreached, []history.Unreached{want}) {
			t.Errorf("found %v, fetched %v, unreached %v; want none, none and %v", found, w.calls, unreached, want)
		}
	})

	t.Run("a synchronous operation is silent", func(t *testing.T) {
		sync := nsHistory("ns", "caller", "c1", nexusScheduled(5, "billing", "Invoices", "Create"))
		w := &world{}
		found, unreached := walk(t, w, []history.History{sync}, map[typeKey]int{}, 5)
		if len(found)+len(unreached)+len(w.calls) != 0 {
			t.Errorf("found %v, unreached %v, fetched %v; want nothing", found, unreached, w.calls)
		}
	})
}
