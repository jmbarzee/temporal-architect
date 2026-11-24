package execution

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

const (
	a     = "workflow:p.A"
	b     = "workflow:p.B"
	cloud = "outside:cloud"
	host1 = "worker:h @1"
	host2 = "worker:h @2"
	run   = a + " › activity Run()"
)

// valid is a small execution that keeps every rule: a run starts another,
// retries a call on a host an outside lane launches and loses, and signals.
func valid() *Execution {
	return &Execution{
		Lanes: []Lane{
			{ID: a, Node: a + "/worker:w/namespace:n", EndedBy: a + "/7"},
			{ID: b, Node: b + "/worker:w/namespace:n", StartedBy: a + "/2"},
			{ID: host1, Node: "worker:h/namespace:n", StartedBy: cloud + "/1", EndedBy: cloud + "/2"},
			{ID: host2, Node: "worker:h/namespace:n", StartedBy: cloud + "/3"},
			{ID: cloud},
		},
		Events: []Event{
			{ID: cloud + "/1", Lane: cloud, Kind: Occur, Label: "launch"},
			{ID: a + "/1", Lane: a, Kind: Reach, Stmt: run, Edge: &Edge{a + "/worker:w/namespace:n", "activity:p.Run/worker:h/namespace:n", "activityCall"}},
			{ID: a + "/2", Lane: a, Kind: Reach, Stmt: a + " › detach workflow B()"},
			{ID: a + "/3", Lane: a, Kind: Start, Stmt: run, Attempt: 1, On: host1, After: []string{cloud + "/1"}},
			{ID: cloud + "/2", Lane: cloud, Kind: Occur, Label: "lost", Outcome: Failed},
			{ID: a + "/4", Lane: a, Kind: End, Stmt: run, Attempt: 1, Outcome: TimedOut},
			{ID: cloud + "/3", Lane: cloud, Kind: Occur, Label: "launch"},
			{ID: a + "/5", Lane: a, Kind: Start, Stmt: run, Attempt: 2, On: host2},
			{ID: a + "/6", Lane: a, Kind: Reach, Stmt: a + " › signal B.Go()", Edge: &Edge{a + "/worker:w/namespace:n", b + "/worker:w/namespace:n", "signalSend"}},
			{ID: b + "/1", Lane: b, Kind: Arrive, Stmt: b + " › signal Go", Visit: []int{1}, From: a + "/6"},
			{ID: a + "/7", Lane: a, Kind: Reach, Stmt: a + " › close complete", Time: "2026-11-23T00:00:00Z"},
		},
	}
}

func TestJSON_RoundTrips(t *testing.T) {
	in := []byte(`{"lanes":[` +
		`{"id":"workflow:p.A @2","node":"workflow:p.A/worker:w/namespace:n","startedBy":"outside:u/1","endedBy":"workflow:p.A @2/2","follows":"workflow:p.A @1","workflowId":"a","runId":"r2"}],` +
		`"events":[` +
		`{"id":"workflow:p.A @2/1","lane":"workflow:p.A @2","kind":"start","stmt":"workflow:p.A › for › activity Run()","visit":[3],"attempt":2,"after":["outside:u/1"],"on":"worker:h","time":"2026-11-23T00:00:00Z"},` +
		`{"id":"workflow:p.A @2/2","lane":"workflow:p.A @2","kind":"reach","stmt":"workflow:p.A › signal B.Go()","edge":{"from":"x","to":"y","kind":"signalSend"},"from":"outside:u/2"},` +
		`{"id":"outside:u/1","lane":"outside:u","kind":"occur","outcome":"failed","label":"lost"}]}`)
	var x Execution
	if err := json.Unmarshal(in, &x); err != nil {
		t.Fatal(err)
	}
	out, err := json.Marshal(x)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(out, in) {
		t.Errorf("round trip\n got %s\nwant %s", out, in)
	}
}

func TestKey(t *testing.T) {
	e := Event{ID: "x/9", Lane: "x", Kind: End, Stmt: "s", Visit: []int{2, 10}, Attempt: 3, Outcome: Failed, From: "y/1"}
	if want := (Key{"x", "s", "2.10", End, 3}); e.Key() != want {
		t.Errorf("Key = %+v, want %+v", e.Key(), want)
	}
}

func TestCheck_Valid(t *testing.T) {
	if errs := Check(valid()); errs != nil {
		t.Errorf("Check = %v, want none", errs)
	}
}

func TestCheck_Broken(t *testing.T) {
	event := func(x *Execution, id string) *Event {
		for i := range x.Events {
			if x.Events[i].ID == id {
				return &x.Events[i]
			}
		}
		panic(id)
	}
	tests := []struct {
		name   string
		mutate func(*Execution)
		want   string
	}{
		{"lane of no kind", func(x *Execution) { x.Lanes = append(x.Lanes, Lane{ID: "activity:p.Run"}) }, "is not a workflow:, worker: or outside: key"},
		{"lane listed twice", func(x *Execution) { x.Lanes = append(x.Lanes, x.Lanes[4]) }, "is listed twice"},
		{"outside lane with a node", func(x *Execution) { x.Lanes[4].Node = "worker:h/namespace:n" }, "has no node"},
		{"node of another definition", func(x *Execution) { x.Lanes[1].Node = a + "/worker:w/namespace:n" }, "is not a deployment of " + b},
		{"ranks out of start order", func(x *Execution) { x.Lanes[2].ID, x.Lanes[3].ID = host2, host1 }, "is run 1 of 2 of worker:h"},
		{"repeated key unranked", func(x *Execution) { x.Lanes[3].ID = "worker:h" }, "is run 2 of 2 of worker:h"},
		{"lone key ranked", func(x *Execution) { x.Lanes[1].ID = b + " @1" }, "is run 1 of 1"},
		{"start of no event", func(x *Execution) { x.Lanes[1].StartedBy = "nothing" }, `"nothing" is not an event`},
		{"started by itself", func(x *Execution) { x.Lanes[1].StartedBy = b + "/1" }, "is started by its own event"},
		{"follows another definition", func(x *Execution) { x.Lanes[1].Follows = a }, "which is no run of " + b},
		{"id out of place", func(x *Execution) { event(x, a+"/7").ID = a + "/9" }, `so its id is "` + a + `/7"`},
		{"lane not listed", func(x *Execution) { event(x, a+"/7").Lane = "workflow:p.C" }, "is not listed"},
		{"unknown kind", func(x *Execution) { event(x, a+"/2").Kind = "begin" }, `kind "begin"`},
		{"stmt under another definition", func(x *Execution) { event(x, a+"/2").Stmt = b + " › close complete" }, "is not under " + a},
		{"reach without stmt", func(x *Execution) { event(x, a+"/2").Stmt = "" }, "stmt:"},
		{"reach in an outside lane", func(x *Execution) { e := event(x, cloud+"/3"); e.Kind, e.Label, e.Stmt = Reach, "", cloud+" › x" }, "a reach is in a run's lane"},
		{"occur in a run", func(x *Execution) { e := event(x, a+"/2"); e.Kind, e.Stmt = Occur, "" }, "an occur is in a host or outside lane"},
		{"occur with a stmt", func(x *Execution) { event(x, cloud+"/3").Stmt = run }, "an occur has no stmt"},
		{"visit from 0", func(x *Execution) { event(x, b+"/1").Visit = []int{0} }, "visit counts passes from 1"},
		{"start without attempt", func(x *Execution) { event(x, a+"/3").Attempt = 0 }, "a start counts its attempt from 1"},
		{"attempt on a reach", func(x *Execution) { event(x, a+"/2").Attempt = 1 }, "only a start or end has an attempt"},
		{"end of no start", func(x *Execution) { event(x, a+"/4").Attempt = 3 }, "ends attempt 3, which never started"},
		{"unknown outcome", func(x *Execution) { event(x, a+"/4").Outcome = "lost" }, `outcome "lost"`},
		{"outcome on a reach", func(x *Execution) { event(x, a+"/2").Outcome = Cancelled }, "only an end or occur has an outcome"},
		{"edge on a start", func(x *Execution) { event(x, a+"/3").Edge = event(x, a+"/1").Edge }, "only a reach dispatches"},
		{"edge from another node", func(x *Execution) { event(x, a+"/1").Edge.From = "elsewhere" }, "not its lane's node"},
		{"edge of no dispatch", func(x *Execution) { event(x, a+"/1").Edge.Kind = "containment" }, `edge kind "containment"`},
		{"on outside a start", func(x *Execution) { event(x, a+"/2").On = host1 }, "only a start runs on a host"},
		{"on no host", func(x *Execution) { event(x, a+"/3").On = cloud }, "is not a host lane"},
		{"label on a reach", func(x *Execution) { event(x, a+"/2").Label = "go" }, "only an occur has a label"},
		{"time not RFC 3339", func(x *Execution) { event(x, a+"/7").Time = "today" }, "time:"},
		{"from its own lane", func(x *Execution) { event(x, a+"/7").From = a + "/6" }, "is in its own lane"},
		{"from later", func(x *Execution) { event(x, b+"/1").From = a + "/7" }, "does not come before it"},
		{"after no event", func(x *Execution) { event(x, a+"/3").After = []string{"nothing"} }, `after "nothing" is not an event`},
		{"before its lane starts", func(x *Execution) { x.Lanes[1].StartedBy = a + "/7" }, "lane " + b + " starts after it"},
		{"after its lane ends", func(x *Execution) { x.Lanes[0].EndedBy = a + "/6" }, "lane " + a + " has ended before it"},
		{"on a host that has ended", func(x *Execution) { x.Lanes[2].EndedBy = cloud + "/1" }, "host " + host1 + " has ended before it"},
		{"key repeated", func(x *Execution) {
			x.Events = append(x.Events, Event{ID: b + "/2", Lane: b, Kind: Arrive, Stmt: b + " › signal Go", Visit: []int{1}})
		}, "has the key of " + b + "/1"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			x := valid()
			tt.mutate(x)
			errs := Check(x)
			for _, err := range errs {
				if strings.Contains(err.Error(), tt.want) {
					return
				}
			}
			t.Errorf("Check = %v, want an error containing %q", errs, tt.want)
		})
	}
}
