package history

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	enumspb "go.temporal.io/api/enums/v1"
	historypb "go.temporal.io/api/history/v1"
)

// fixtureTime is the time exec_*.json gives an event: its ID in minutes past
// the epoch.
func fixtureTime(id int64) time.Time {
	return time.Date(2026, 1, 1, 0, int(id), 0, 0, time.UTC)
}

func TestDecode(t *testing.T) {
	const (
		wf, tm, act, sig, upd = SubjectWorkflow, SubjectTimer, SubjectActivity, SubjectSignal, SubjectUpdate
		child, xsig, xcancel  = SubjectChild, SubjectExternalSignal, SubjectExternalCancel
		nexus, marker         = SubjectNexus, SubjectMarker
	)
	started := Event{ID: 1, Subject: wf, Phase: PhaseStarted, Name: "OrderWorkflow"}
	done := func(id int64) Event { return Event{ID: id, Subject: wf, Phase: PhaseCompleted} }
	startedAttempt := func(n int32) Event { e := started; e.Attempt = n; return e }

	cases := []struct {
		fixture string
		want    []Event
	}{
		{"exec_activities.json", []Event{
			startedAttempt(1),
			{ID: 2, Subject: act, Phase: PhaseScheduled, Name: "ChargeCard"},
			{ID: 3, Subject: act, Phase: PhaseStarted, Opener: 2, Attempt: 1},
			{ID: 4, Subject: act, Phase: PhaseCompleted, Opener: 2},
			{ID: 5, Subject: act, Phase: PhaseScheduled, Name: "Ship"},
			{ID: 6, Subject: act, Phase: PhaseStarted, Opener: 5, Attempt: 3},
			{ID: 7, Subject: act, Phase: PhaseFailed, Opener: 5, Failure: "carrier rejected"},
			{ID: 8, Subject: act, Phase: PhaseScheduled, Name: "Notify"},
			{ID: 9, Subject: act, Phase: PhaseStarted, Opener: 8, Attempt: 1},
			{ID: 10, Subject: act, Phase: PhaseTimedOut, Opener: 8, Failure: "activity StartToClose timeout"},
			{ID: 11, Subject: act, Phase: PhaseScheduled, Name: "Audit"},
			{ID: 12, Subject: act, Phase: PhaseCancelRequested, Opener: 11},
			{ID: 13, Subject: act, Phase: PhaseCanceled, Opener: 11},
			done(14),
		}},
		{"exec_timers_signals_updates.json", []Event{
			started,
			{ID: 2, Subject: tm, Phase: PhaseStarted, Name: "t1"},
			{ID: 3, Subject: tm, Phase: PhaseFired, Name: "t1", Opener: 2},
			{ID: 4, Subject: tm, Phase: PhaseStarted, Name: "t2"},
			{ID: 5, Subject: tm, Phase: PhaseCanceled, Name: "t2", Opener: 4},
			{ID: 6, Subject: sig, Phase: PhaseReceived, Name: "approve"},
			{ID: 7, Subject: upd, Phase: PhaseAccepted, Name: "setLimit"},
			{ID: 8, Subject: upd, Phase: PhaseCompleted, Opener: 7},
			{ID: 9, Subject: upd, Phase: PhaseAccepted, Name: "raiseLimit"},
			{ID: 10, Subject: upd, Phase: PhaseCompleted, Opener: 9, Failure: "limit exceeded"},
			{ID: 11, Subject: upd, Phase: PhaseRejected, Name: "setLimit", Failure: "limit is negative"},
			{ID: 12, Subject: marker, Phase: PhaseRecorded, Name: "Version"},
			done(13),
		}},
		{"exec_children.json", []Event{
			started,
			{ID: 2, Subject: child, Phase: PhaseInitiated, Name: "Payment", Target: "pay-1"},
			{ID: 3, Subject: child, Phase: PhaseStarted, Name: "Payment", Target: "pay-1", Opener: 2},
			{ID: 4, Subject: child, Phase: PhaseCompleted, Name: "Payment", Target: "pay-1", Opener: 2},
			{ID: 5, Subject: child, Phase: PhaseInitiated, Name: "Refund", Target: "ref-1"},
			{ID: 6, Subject: child, Phase: PhaseFailed, Name: "Refund", Target: "ref-1", Opener: 5, Failure: "WorkflowAlreadyExists"},
			{ID: 7, Subject: child, Phase: PhaseInitiated, Name: "Ship", Target: "ship-1"},
			{ID: 8, Subject: child, Phase: PhaseStarted, Name: "Ship", Target: "ship-1", Opener: 7},
			{ID: 9, Subject: child, Phase: PhaseFailed, Name: "Ship", Target: "ship-1", Opener: 7, Failure: "carrier rejected"},
			{ID: 10, Subject: child, Phase: PhaseInitiated, Name: "Audit", Target: "audit-1"},
			{ID: 11, Subject: child, Phase: PhaseStarted, Name: "Audit", Target: "audit-1", Opener: 10},
			{ID: 12, Subject: child, Phase: PhaseCanceled, Name: "Audit", Target: "audit-1", Opener: 10},
			{ID: 13, Subject: child, Phase: PhaseInitiated, Name: "Report", Target: "report-1"},
			{ID: 14, Subject: child, Phase: PhaseStarted, Name: "Report", Target: "report-1", Opener: 13},
			{ID: 15, Subject: child, Phase: PhaseTimedOut, Name: "Report", Target: "report-1", Opener: 13},
			{ID: 16, Subject: child, Phase: PhaseInitiated, Name: "Cleanup", Target: "cleanup-1"},
			{ID: 17, Subject: child, Phase: PhaseStarted, Name: "Cleanup", Target: "cleanup-1", Opener: 16},
			{ID: 18, Subject: child, Phase: PhaseTerminated, Name: "Cleanup", Target: "cleanup-1", Opener: 16},
			done(19),
		}},
		{"exec_external.json", []Event{
			started,
			{ID: 2, Subject: xsig, Phase: PhaseInitiated, Name: "poke", Target: "peer-1"},
			{ID: 3, Subject: xsig, Phase: PhaseCompleted, Target: "peer-1", Opener: 2},
			{ID: 4, Subject: xsig, Phase: PhaseInitiated, Name: "poke", Target: "gone-1"},
			{ID: 5, Subject: xsig, Phase: PhaseFailed, Target: "gone-1", Opener: 4, Failure: "ExternalWorkflowExecutionNotFound"},
			{ID: 6, Subject: xcancel, Phase: PhaseInitiated, Target: "peer-1"},
			{ID: 7, Subject: xcancel, Phase: PhaseCompleted, Target: "peer-1", Opener: 6},
			{ID: 8, Subject: xcancel, Phase: PhaseInitiated, Target: "gone-1"},
			{ID: 9, Subject: xcancel, Phase: PhaseFailed, Target: "gone-1", Opener: 8, Failure: "ExternalWorkflowExecutionNotFound"},
			done(10),
		}},
		{"exec_nexus.json", []Event{
			started,
			{ID: 2, Subject: nexus, Phase: PhaseScheduled, Name: "Invoices.Create", Target: "billing"},
			{ID: 3, Subject: nexus, Phase: PhaseStarted, Opener: 2},
			{ID: 4, Subject: nexus, Phase: PhaseCompleted, Opener: 2},
			{ID: 5, Subject: nexus, Phase: PhaseScheduled, Name: "Invoices.Create", Target: "billing"},
			{ID: 6, Subject: nexus, Phase: PhaseFailed, Opener: 5, Failure: "invoice rejected"},
			{ID: 7, Subject: nexus, Phase: PhaseScheduled, Name: "Invoices.Create", Target: "billing"},
			{ID: 8, Subject: nexus, Phase: PhaseCancelRequested, Opener: 7},
			{ID: 9, Subject: nexus, Phase: PhaseCanceled, Opener: 7, Failure: "operation canceled"},
			{ID: 10, Subject: nexus, Phase: PhaseScheduled, Name: "Invoices.Create", Target: "billing"},
			{ID: 11, Subject: nexus, Phase: PhaseTimedOut, Opener: 10, Failure: "operation timed out"},
			done(12),
		}},
		{"exec_failed.json", []Event{
			startedAttempt(2),
			{ID: 2, Subject: wf, Phase: PhaseFailed, Failure: "boom"},
		}},
		{"exec_timed_out.json", []Event{started, {ID: 2, Subject: wf, Phase: PhaseTimedOut}}},
		{"exec_terminated.json", []Event{started, {ID: 2, Subject: wf, Phase: PhaseTerminated, Failure: "operator request"}}},
		{"exec_canceled.json", []Event{
			started,
			{ID: 2, Subject: wf, Phase: PhaseCancelRequested, Failure: "operator request"},
			{ID: 3, Subject: wf, Phase: PhaseCanceled},
		}},
	}
	for _, tc := range cases {
		t.Run(tc.fixture, func(t *testing.T) {
			h, err := LoadFile(filepath.Join("testdata", tc.fixture), "wf-1", "run-1")
			if err != nil {
				t.Fatalf("LoadFile: %v", err)
			}
			want := append([]Event(nil), tc.want...)
			for i := range want {
				want[i].Time = fixtureTime(want[i].ID)
			}
			if got := Decode(h); !reflect.DeepEqual(got, want) {
				t.Errorf("Decode =\n%+v\nwant\n%+v", got, want)
			}
		})
	}
}

func TestDecode_ContinuedAsNew(t *testing.T) {
	run := func(file, runID string) []Event {
		h, err := LoadFile(file, "inventory-001", runID)
		if err != nil {
			t.Fatalf("LoadFile: %v", err)
		}
		return Decode(h)
	}
	run1 := run("testdata/continue_as_new_run1.json", "run-1")
	run2 := run("testdata/continue_as_new_run2.json", "run-2")

	last := run1[len(run1)-1]
	if last.Subject != SubjectWorkflow || last.Phase != PhaseContinuedAsNew || last.Name != "InventoryWorkflow" || last.Target != "run-2" {
		t.Errorf("run 1 ends with %+v, want workflow continuedAsNew into InventoryWorkflow run-2", last)
	}
	if run2[0].ID != 1 || run2[0].Phase != PhaseStarted {
		t.Errorf("run 2 begins with %+v, want its own event 1, workflow started", run2[0])
	}
	for _, e := range run2 {
		if e.Phase == PhaseContinuedAsNew {
			t.Errorf("run 2 holds run 1's %+v", e)
		}
	}
}

// TestEventTable pins the README's event table to the decoder: every Temporal
// event type has exactly one row, a row says "ignored" exactly when Decode
// yields nothing for the type, a decoded row names the decoder's subject.phase,
// and a decoded type appears in a fixture.
func TestEventTable(t *testing.T) {
	readme, err := os.ReadFile("../README.md")
	if err != nil {
		t.Fatal(err)
	}
	rows := map[string][]string{} // event type -> its row's execution-event cell
	for _, line := range strings.Split(string(readme), "\n") {
		cells := strings.Split(line, "|")
		if len(cells) == 5 && strings.HasPrefix(strings.TrimSpace(cells[1]), "`") {
			name := strings.Trim(strings.TrimSpace(cells[1]), "`")
			rows[name] = append(rows[name], strings.TrimSpace(cells[3]))
		}
	}

	fixtures, err := filepath.Glob("testdata/*.json")
	if err != nil {
		t.Fatal(err)
	}
	inFixture := map[enumspb.EventType]bool{}
	for _, f := range fixtures {
		h, err := LoadFile(f, "wf-1", "run-1")
		if err != nil {
			t.Fatalf("LoadFile %s: %v", f, err)
		}
		for _, e := range h.Events {
			inFixture[e.EventType] = true
		}
	}

	for n, name := range enumspb.EventType_name {
		if n == int32(enumspb.EVENT_TYPE_UNSPECIFIED) {
			continue
		}
		typ := enumspb.EventType(n)
		short := strings.TrimPrefix(name, "EVENT_TYPE_")
		t.Run(short, func(t *testing.T) {
			cells := rows[short]
			if len(cells) != 1 {
				t.Fatalf("README has %d rows for %s, want 1", len(cells), short)
			}
			ev, decoded := decode(&historypb.HistoryEvent{EventType: typ})
			if ignored := strings.HasPrefix(cells[0], "ignored, because "); ignored == decoded {
				t.Errorf("README execution event %q, but decoded = %v", cells[0], decoded)
			}
			if want := "`" + string(ev.Subject) + "." + string(ev.Phase) + "`"; decoded && !strings.HasPrefix(cells[0], want) {
				t.Errorf("README execution event %q, want it to start with %s", cells[0], want)
			}
			if decoded && !inFixture[typ] {
				t.Errorf("no fixture holds a %s event", short)
			}
		})
	}
}
