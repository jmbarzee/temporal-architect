package history

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	commonpb "go.temporal.io/api/common/v1"
	enumspb "go.temporal.io/api/enums/v1"
	historypb "go.temporal.io/api/history/v1"
	taskqueuepb "go.temporal.io/api/taskqueue/v1"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/execution"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/observe"
	"github.com/jmbarzee/temporal-architect/tools/sampler/design"
)

var update = flag.Bool("update", false, "rewrite testdata/order/order.golden.json")

// orderRuns loads testdata/order: each run of an order that charges until a
// charge holds, ships through a child it signals, and continues as new once,
// captured from a dev server at testdata/order/<workflowId>/<runId>.json.
func orderRuns(t *testing.T) []History {
	paths, err := filepath.Glob("testdata/order/*/*.json")
	if err != nil || len(paths) == 0 {
		t.Fatalf("glob: %v", err)
	}
	var hs []History
	for _, p := range paths {
		h, err := LoadFile(p, filepath.Base(filepath.Dir(p)), strings.TrimSuffix(filepath.Base(p), ".json"))
		if err != nil {
			t.Fatal(err)
		}
		h.Namespace = "default"
		hs = append(hs, h)
	}
	return hs
}

func buildOrder(t *testing.T, d *design.Design, runID string) (*observe.ObservedGraph, *execution.Execution) {
	t.Helper()
	og, x, err := BuildExecution(orderRuns(t), Options{Namespace: "default", Design: d}, "order-1", runID)
	if err != nil {
		t.Fatal(err)
	}
	if errs := execution.Check(x); errs != nil {
		t.Fatalf("Check = %v, want none", errs)
	}
	return og, x
}

// stmts lists each event as "<lane>/<n> <kind> <its stmt below the definition> <visit>".
func stmts(x *execution.Execution) []string {
	var out []string
	for _, e := range x.Events {
		_, below, _ := strings.Cut(e.Stmt, " › ")
		line := fmt.Sprintf("%s %s %s", e.ID, e.Kind, below)
		if len(e.Visit) > 0 {
			line += fmt.Sprintf(" %v", e.Visit)
		}
		out = append(out, line)
	}
	return out
}

func codes(og *observe.ObservedGraph) []string {
	var out []string
	for _, d := range og.Diagnostics {
		if strings.HasPrefix(d.Code, "EXECUTION_") {
			out = append(out, d.Code+": "+d.Message)
		}
	}
	return out
}

func TestBuildExecution_JoinsTheDesign(t *testing.T) {
	d, err := design.Load("testdata/order/order.twf")
	if err != nil {
		t.Fatal(err)
	}
	og, x := buildOrder(t, d, "")

	got := stmts(x)
	for _, want := range []string{
		// The loop's second pass.
		"workflow:Order @1/6 reach for › activity Charge(n) -> charged [2]",
		// Notify fits both arms until Audit leaves the first, and the child call the second.
		"workflow:Order @1/9 reach if (n == 0) @1 › activity Notify(n)",
		"workflow:Order @2/9 reach if (n == 0) @1 › else › activity Notify(n)",
		// A signal runs its handler and ends the await it resolves.
		"workflow:Ship @1/1 arrive signal Go [1]",
		"workflow:Ship @1/2 end await signal Go",
		// Pack fits both arms to the end, and Log none: both take their flat heads.
		"workflow:Ship @1/3 reach activity Pack()",
		"workflow:Ship @1/6 reach activity Log()",
	} {
		if !slices.Contains(got, want) {
			t.Errorf("no event %q in\n%s", want, strings.Join(got, "\n"))
		}
	}
	for _, run := range []string{"ship-0/01a20b0c-e333-7a0e-b445-0190d7d4fb18", "ship-1/01a20b0c-eb30-74a3-b0b1-c1a0417452fd"} {
		for _, want := range []string{
			diagStmtAmbiguous + `: activity Pack(), event 9 of run ` + run + `, fits workflow:Ship › if (fragile) › activity Pack(n, "bubble") and workflow:Ship › if (fragile) › else › activity Pack(n, "box")`,
			diagStmtUnmatched + ": activity Log(), event 15 of run " + run + ", fits no statement of workflow:Ship the run could reach",
		} {
			if !slices.Contains(codes(og), want) {
				t.Errorf("no diagnostic %q in\n%s", want, strings.Join(codes(og), "\n"))
			}
		}
	}

	got2, err := json.MarshalIndent(struct {
		ObservedGraph *observe.ObservedGraph `json:"observedGraph"`
		Execution     *execution.Execution   `json:"execution"`
	}{og, x}, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	const golden = "testdata/order/order.golden.json"
	if *update {
		if err := os.WriteFile(golden, got2, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	want, err := os.ReadFile(golden)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got2, want) {
		t.Errorf("{observedGraph, execution} differs from %s; rerun with -update and review the diff", golden)
	}
}

func TestBuildExecution_Lanes(t *testing.T) {
	_, x := buildOrder(t, nil, "")
	want := []execution.Lane{
		{ID: "workflow:Order @1", EndedBy: "workflow:Order @1/19"},
		{ID: "workflow:Ship @1", StartedBy: "workflow:Order @1/15", EndedBy: "workflow:Ship @1/8"},
		{ID: "workflow:Order @2", EndedBy: "workflow:Order @2/16", Follows: "workflow:Order @1"},
		{ID: "workflow:Ship @2", StartedBy: "workflow:Order @2/12", EndedBy: "workflow:Ship @2/8"},
	}
	for i, l := range x.Lanes {
		l.Node, l.WorkflowID, l.RunID = "", "", ""
		if i >= len(want) || l != want[i] {
			t.Errorf("lane %d = %+v, want %+v", i, l, want[min(i, len(want)-1)])
		}
	}
	for _, e := range x.Events {
		if e.Time == "" {
			t.Errorf("%s has no time", e.ID)
		}
	}
}

func TestBuildExecution_WithoutDesign(t *testing.T) {
	_, x := buildOrder(t, nil, "")
	got := stmts(x)
	for _, want := range []string{
		"workflow:Order @1/1 reach activity Charge() @1",
		"workflow:Order @1/6 reach activity Charge() @2",
		"workflow:Order @1/15 reach workflow Ship()",
		"workflow:Order @1/17 reach signal Ship.Go()",
		"workflow:Ship @1/1 arrive signal Go [1]",
		"workflow:Order @1/19 reach close continue_as_new",
	} {
		if !slices.Contains(got, want) {
			t.Errorf("no event %q in\n%s", want, strings.Join(got, "\n"))
		}
	}
}

func TestBuildExecution_OneRun(t *testing.T) {
	_, x := buildOrder(t, nil, "01a20b0c-db2e-7d81-ba7a-a4125aa2c874")
	var ids []string
	for _, l := range x.Lanes {
		ids = append(ids, l.ID+" "+l.RunID)
	}
	want := []string{"workflow:Order 01a20b0c-db2e-7d81-ba7a-a4125aa2c874", "workflow:Ship 01a20b0c-e333-7a0e-b445-0190d7d4fb18"}
	if !slices.Equal(ids, want) {
		t.Errorf("lanes = %v, want %v", ids, want)
	}
}

func TestBuildExecution_NoRun(t *testing.T) {
	if _, _, err := BuildExecution(orderRuns(t), Options{Namespace: "default"}, "order-2", ""); err == nil {
		t.Error("BuildExecution of a workflow the sample lacks: no error")
	}
}

// TestBuildExecution_Mapping holds each row of the README's execution table
// to one run, as "<kind> <head> [attempt] [outcome]" per event, and its lane's end.
func TestBuildExecution_Mapping(t *testing.T) {
	cases := []struct {
		fixture string
		want    []string
		ended   bool
	}{
		{"exec_activities.json", []string{
			"reach activity ChargeCard()", "start activity ChargeCard() 1", "end activity ChargeCard() 1",
			"reach activity Ship()", "start activity Ship() 3", "end activity Ship() 3 failed",
			"reach activity Notify()", "start activity Notify() 1", "end activity Notify() 1 timedOut",
			"reach activity Audit()", "end activity Audit() cancelled",
			"reach close complete",
		}, true},
		{"exec_timers_signals_updates.json", []string{
			"reach await timer(0ms) @1", "end await timer(0ms) @1",
			"reach await timer(0ms) @2", "end await timer(0ms) @2 cancelled",
			"arrive signal approve", "arrive update setLimit", "arrive update raiseLimit",
			"reach close complete",
		}, true},
		{"exec_children.json", []string{
			"reach workflow Payment()", "start workflow Payment() 1", "end workflow Payment() 1",
			"reach workflow Refund()", "end workflow Refund() failed",
			"reach workflow Ship()", "start workflow Ship() 1", "end workflow Ship() 1 failed",
			"reach workflow Audit()", "start workflow Audit() 1", "end workflow Audit() 1 cancelled",
			"reach workflow Report()", "start workflow Report() 1", "end workflow Report() 1 timedOut",
			"reach workflow Cleanup()", "start workflow Cleanup() 1", "end workflow Cleanup() 1 terminated",
			"reach close complete",
		}, true},
		{"exec_external.json", []string{
			"reach signal peer-1.poke()", "reach signal gone-1.poke()", "end signal gone-1.poke() failed",
			"reach close complete",
		}, true},
		{"exec_nexus.json", []string{
			"reach nexus billing Invoices.Create() @1", "start nexus billing Invoices.Create() @1 1", "end nexus billing Invoices.Create() @1 1",
			"reach nexus billing Invoices.Create() @2", "end nexus billing Invoices.Create() @2 failed",
			"reach nexus billing Invoices.Create() @3", "end nexus billing Invoices.Create() @3 cancelled",
			"reach nexus billing Invoices.Create() @4", "end nexus billing Invoices.Create() @4 timedOut",
			"reach close complete",
		}, true},
		{"exec_failed.json", []string{"reach close fail"}, true},
		{"exec_terminated.json", nil, false},
		{"exec_timed_out.json", nil, false},
		{"exec_canceled.json", nil, false},
		{"local_activities.json", []string{
			"reach activity FormatReport()", "start activity FormatReport() 1", "end activity FormatReport() 1",
			"reach activity AuditReport()", "start activity AuditReport() 1", "end activity AuditReport() 1",
		}, false},
	}
	for _, tc := range cases {
		t.Run(tc.fixture, func(t *testing.T) {
			h, err := LoadFile(filepath.Join("testdata", tc.fixture), "wf", "run")
			if err != nil {
				t.Fatal(err)
			}
			_, x, err := BuildExecution([]History{h}, Options{Namespace: "default"}, "wf", "")
			if err != nil {
				t.Fatal(err)
			}
			if errs := execution.Check(x); errs != nil {
				t.Errorf("Check = %v, want none", errs)
			}
			var got []string
			for _, e := range x.Events {
				_, head, _ := strings.Cut(e.Stmt, " › ")
				line := string(e.Kind) + " " + head
				if e.Attempt > 0 {
					line += fmt.Sprintf(" %d", e.Attempt)
				}
				if e.Outcome != "" {
					line += " " + string(e.Outcome)
				}
				got = append(got, line)
			}
			if !slices.Equal(got, tc.want) {
				t.Errorf("events =\n%s\nwant\n%s", strings.Join(got, "\n"), strings.Join(tc.want, "\n"))
			}
			if ended := x.Lanes[0].EndedBy != ""; ended != tc.ended {
				t.Errorf("endedBy %q, want one: %v", x.Lanes[0].EndedBy, tc.ended)
			}
		})
	}
}

// run builds one run's history of Race, Sig or Twin (testdata/race.twf), an
// event a second.
type run []*historypb.HistoryEvent

func (r *run) add(t enumspb.EventType, attrs any) int64 {
	id := int64(len(*r) + 1)
	e := &historypb.HistoryEvent{EventId: id, EventType: t, EventTime: timestamppb.New(time.Date(2026, 1, 1, 0, 0, int(id), 0, time.UTC))}
	switch a := attrs.(type) {
	case *historypb.WorkflowExecutionStartedEventAttributes:
		e.Attributes = &historypb.HistoryEvent_WorkflowExecutionStartedEventAttributes{WorkflowExecutionStartedEventAttributes: a}
	case *historypb.ActivityTaskScheduledEventAttributes:
		e.Attributes = &historypb.HistoryEvent_ActivityTaskScheduledEventAttributes{ActivityTaskScheduledEventAttributes: a}
	case *historypb.ActivityTaskStartedEventAttributes:
		e.Attributes = &historypb.HistoryEvent_ActivityTaskStartedEventAttributes{ActivityTaskStartedEventAttributes: a}
	case *historypb.ActivityTaskCompletedEventAttributes:
		e.Attributes = &historypb.HistoryEvent_ActivityTaskCompletedEventAttributes{ActivityTaskCompletedEventAttributes: a}
	case *historypb.TimerStartedEventAttributes:
		e.Attributes = &historypb.HistoryEvent_TimerStartedEventAttributes{TimerStartedEventAttributes: a}
	case *historypb.TimerFiredEventAttributes:
		e.Attributes = &historypb.HistoryEvent_TimerFiredEventAttributes{TimerFiredEventAttributes: a}
	case *historypb.TimerCanceledEventAttributes:
		e.Attributes = &historypb.HistoryEvent_TimerCanceledEventAttributes{TimerCanceledEventAttributes: a}
	case *historypb.WorkflowExecutionSignaledEventAttributes:
		e.Attributes = &historypb.HistoryEvent_WorkflowExecutionSignaledEventAttributes{WorkflowExecutionSignaledEventAttributes: a}
	case *historypb.WorkflowExecutionCompletedEventAttributes:
		e.Attributes = &historypb.HistoryEvent_WorkflowExecutionCompletedEventAttributes{WorkflowExecutionCompletedEventAttributes: a}
	}
	*r = append(*r, e)
	return id
}

func (r *run) schedule(activity string) int64 {
	return r.add(enumspb.EVENT_TYPE_ACTIVITY_TASK_SCHEDULED, &historypb.ActivityTaskScheduledEventAttributes{
		ActivityType: &commonpb.ActivityType{Name: activity}, TaskQueue: &taskqueuepb.TaskQueue{Name: "orders"}})
}

func (r *run) complete(scheduled int64) {
	started := r.add(enumspb.EVENT_TYPE_ACTIVITY_TASK_STARTED, &historypb.ActivityTaskStartedEventAttributes{ScheduledEventId: scheduled, Attempt: 1})
	r.add(enumspb.EVENT_TYPE_ACTIVITY_TASK_COMPLETED, &historypb.ActivityTaskCompletedEventAttributes{ScheduledEventId: scheduled, StartedEventId: started})
}

func (r *run) timer() int64 {
	return r.add(enumspb.EVENT_TYPE_TIMER_STARTED, &historypb.TimerStartedEventAttributes{TimerId: "1"})
}

func (r *run) signal(name string) {
	r.add(enumspb.EVENT_TYPE_WORKFLOW_EXECUTION_SIGNALED, &historypb.WorkflowExecutionSignaledEventAttributes{SignalName: name})
}

func raceRun(workflow string, steps func(r *run)) History {
	r := &run{}
	r.add(enumspb.EVENT_TYPE_WORKFLOW_EXECUTION_STARTED, &historypb.WorkflowExecutionStartedEventAttributes{
		WorkflowType: &commonpb.WorkflowType{Name: workflow}, TaskQueue: &taskqueuepb.TaskQueue{Name: "orders"}})
	steps(r)
	r.add(enumspb.EVENT_TYPE_WORKFLOW_EXECUTION_COMPLETED, &historypb.WorkflowExecutionCompletedEventAttributes{})
	return History{WorkflowID: "w", RunID: "r", Namespace: "default", Events: *r}
}

// TestBuildExecution_AwaitOne holds the join to the case that won an await
// one: by its opener ending first, or by its signal arriving.
func TestBuildExecution_AwaitOne(t *testing.T) {
	d, err := design.Load("testdata/race.twf")
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name string
		run  History
		want []string
	}{
		{"the first case's opener ends first", raceRun("Race", func(r *run) {
			charge, timer := r.schedule("Charge"), r.timer()
			r.complete(charge)
			r.add(enumspb.EVENT_TYPE_TIMER_CANCELED, &historypb.TimerCanceledEventAttributes{TimerId: "1", StartedEventId: timer})
			r.complete(r.schedule("Ship"))
		}), []string{
			"workflow:Race/1 reach await one › activity Charge(n)",
			"workflow:Race/2 reach await one › timer(1h)",
			"workflow:Race/6 reach await one › activity Charge(n) › activity Ship(n)",
		}},
		{"the second case's timer fires first", raceRun("Race", func(r *run) {
			r.schedule("Charge")
			r.add(enumspb.EVENT_TYPE_TIMER_FIRED, &historypb.TimerFiredEventAttributes{TimerId: "1", StartedEventId: r.timer()})
			r.complete(r.schedule("Ship"))
		}), []string{
			"workflow:Race/4 reach await one › timer(1h) › activity Ship(n)",
		}},
		{"the second case's signal arrives", raceRun("Sig", func(r *run) {
			r.signal("B")
			r.complete(r.schedule("Ship"))
		}), []string{
			"workflow:Sig/2 end await one › signal B",
			"workflow:Sig/3 reach await one › signal B › activity Ship(n)",
		}},
		{"of two equal cases, the first wins", raceRun("Twin", func(r *run) {
			first, second := r.schedule("Charge"), r.schedule("Charge")
			r.complete(first)
			r.complete(r.schedule("Audit"))
			r.complete(second)
		}), []string{
			"workflow:Twin/1 reach await one › activity Charge(n) @1",
			"workflow:Twin/2 reach await one › activity Charge(n) @2",
			"workflow:Twin/5 reach await one › activity Charge(n) @1 › activity Audit(n)",
		}},
		{"of two equal cases, the second wins", raceRun("Twin", func(r *run) {
			first, second := r.schedule("Charge"), r.schedule("Charge")
			r.complete(second)
			r.complete(r.schedule("Ship"))
			r.complete(first)
		}), []string{
			"workflow:Twin/5 reach await one › activity Charge(n) @2 › activity Ship(n)",
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			og, x, err := BuildExecution([]History{tc.run}, Options{Namespace: "default", Design: d}, "w", "r")
			if err != nil {
				t.Fatal(err)
			}
			if errs := execution.Check(x); errs != nil {
				t.Errorf("Check = %v, want none", errs)
			}
			got := stmts(x)
			for _, want := range tc.want {
				if !slices.Contains(got, want) {
					t.Errorf("no event %q in\n%s", want, strings.Join(got, "\n"))
				}
			}
			if diags := codes(og); diags != nil {
				t.Errorf("diagnostics %v, want none", diags)
			}
		})
	}
}

// TestBuildExecution_AwaitOneUndecided keeps every case's body when nothing
// says which case won, and reports the event they all fit.
func TestBuildExecution_AwaitOneUndecided(t *testing.T) {
	d, err := design.Load("testdata/race.twf")
	if err != nil {
		t.Fatal(err)
	}
	og, x, err := BuildExecution([]History{raceRun("Race", func(r *run) {
		r.schedule("Charge")
		r.timer()
		r.complete(r.schedule("Ship"))
	})}, Options{Namespace: "default", Design: d}, "w", "r")
	if err != nil {
		t.Fatal(err)
	}
	if got := stmts(x); !slices.Contains(got, "workflow:Race/3 reach activity Ship()") {
		t.Errorf("Ship took no flat head in\n%s", strings.Join(got, "\n"))
	}
	if diags := codes(og); len(diags) != 1 || !strings.HasPrefix(diags[0], diagStmtAmbiguous) {
		t.Errorf("diagnostics %v, want one %s", diags, diagStmtAmbiguous)
	}
}

// TestBuildExecution_Crowded reports the event that takes a run past the ways
// the join keeps, and joins none of the run's events.
func TestBuildExecution_Crowded(t *testing.T) {
	d, err := design.Load("testdata/race.twf")
	if err != nil {
		t.Fatal(err)
	}
	og, x, err := BuildExecution([]History{raceRun("Many", func(r *run) {
		for range 7 {
			r.complete(r.schedule("Ship"))
		}
	})}, Options{Namespace: "default", Design: d}, "w", "r")
	if err != nil {
		t.Fatal(err)
	}
	if errs := execution.Check(x); errs != nil {
		t.Errorf("Check = %v, want none", errs)
	}
	if got := stmts(x); !slices.Contains(got, "workflow:Many/1 reach activity Ship() @1") {
		t.Errorf("the first Ship took no flat head in\n%s", strings.Join(got, "\n"))
	}
	if diags := codes(og); len(diags) != 1 || !strings.Contains(diags[0], "event 20 of run w/r, takes the run past 64 ways") {
		t.Errorf("diagnostics %v, want one for the seventh Ship", diags)
	}
}
