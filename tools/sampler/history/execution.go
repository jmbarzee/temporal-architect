package history

import (
	"fmt"
	"slices"
	"strconv"
	"time"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/execution"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/observe"
)

// BuildExecution folds the histories into an observed graph, as Build does, and
// builds the execution of one workflow among them: the run of workflowID and
// runID, or with runID empty every run of workflowID, with the children those
// runs started, theirs in turn, and each child's continue-as-new chain. Each run
// is a lane on its node; the README's execution table maps its events. With a
// design, each statement event joins to the statement it ran (join.go); without
// one, or where the join fails, it takes the head of a flat body.
func BuildExecution(histories []History, opts Options, workflowID, runID string) (*observe.ObservedGraph, *execution.Execution, error) {
	b := fold(histories, opts)
	a := &assembly{b: b, lanes: map[runKey]*lane{}}
	x, err := a.build(workflowID, runID)
	observe.Finalize(b.og)
	return b.og, x, err
}

// assembly builds one execution from a fold.
type assembly struct {
	b     *builder
	order []*lane // in the order found: the roots, then what each starts
	lanes map[runKey]*lane
}

// lane is one run as it is built.
type lane struct {
	run      runKey
	key      string // its workflow's definition key
	node     string
	events   []*event          // in history order
	next     string            // the run it continued as
	children map[*event]runKey // each started child's reach → the child's run

	startedBy, endedBy *event
	follows            *lane
	id                 string
}

// event is one execution event as it is built. A statement event (a reach or
// an arrival) carries a head and what it calls; a start or end carries its opener.
type event struct {
	execution.Event
	lane    *lane
	at      time.Time
	history int64 // the history event it maps from
	from    *event
	opener  *event
	arrival *event // an await's end: the arrival that resolves it
	head    string
	call    call
	pair    pair // a signal send's or receipt's
}

// pair is what pairs a signal's sends with its receipts: the sender's run, and
// the receiver's workflow ID and the signal's name.
type pair struct {
	sender           runKey
	receiver, signal string
}

// call is what a statement calls, as history records it and a design writes
// it: its kind, its name, and for a signal the receiver's type ("" for any).
type call struct {
	kind, name, on string
}

const (
	callActivity     = "activity"
	callWorkflow     = "workflow"
	callNexus        = "nexus"
	callSignal       = "signal"
	callTimer        = "timer"
	callClose        = "close"
	callAwaitSignal  = "await signal"
	callArriveSignal = "signal arrival"
	callArriveUpdate = "update arrival"
)

func (a *assembly) build(workflowID, runID string) (*execution.Execution, error) {
	for _, h := range a.b.histories {
		if h.WorkflowID == workflowID && (runID == "" || h.RunID == runID) {
			a.add(h)
		}
	}
	if len(a.order) == 0 {
		return nil, fmt.Errorf("no run of workflow %q is in the sample", workflowID)
	}
	for i := 0; i < len(a.order); i++ {
		l := a.order[i]
		for _, e := range l.events {
			if child, ok := l.children[e]; ok {
				a.chain(child)
			}
		}
	}
	for _, l := range a.order {
		a.join(l)
	}
	a.link()
	return a.assemble(), nil
}

// chain adds the run, and each run it continued as.
func (a *assembly) chain(run runKey) {
	for run.runID != "" && a.lanes[run] == nil {
		i := slices.IndexFunc(a.b.histories, func(h History) bool { return runKey{h.WorkflowID, h.RunID} == run })
		if i < 0 {
			return
		}
		l := a.add(a.b.histories[i])
		if l == nil {
			return
		}
		run = runKey{run.workflowID, l.next}
	}
}

// add maps a run's events into a new lane; a run with no node has none.
func (a *assembly) add(h History) *lane {
	run := runKey{h.WorkflowID, h.RunID}
	node, ok := a.b.runs[run]
	if !ok {
		return nil
	}
	l := &lane{run: run, node: node, key: a.b.node(node).Definition, children: map[*event]runKey{}}
	a.lanes[run] = l
	a.order = append(a.order, l)
	a.mapEvents(l, h)
	return l
}

// mapEvents maps each decoded event of the run as the README's execution table says.
func (a *assembly) mapEvents(l *lane, h History) {
	opened := map[int64]*event{}
	attempt := map[int64]int{}
	arrivals := map[string]int{}
	raw := map[int64]int{}
	for i, e := range h.Events {
		raw[e.GetEventId()] = i
	}
	add := func(d Event, e *event) *event {
		e.lane, e.history, e.at, e.Time = l, d.ID, d.Time, d.Time.UTC().Format(time.RFC3339Nano)
		l.events = append(l.events, e)
		return e
	}
	reach := func(d Event, head string, c call) *event {
		e := add(d, &event{Event: execution.Event{Kind: execution.Reach}, head: head, call: c})
		if k, ok := a.b.dispatch[eventAt{l.run, d.ID}]; ok {
			e.Edge = &execution.Edge{From: k.from, To: k.to, Kind: k.kind}
		}
		opened[d.ID] = e
		return e
	}
	start := func(d Event, opener int64, n int) *event {
		attempt[opener] = n
		return add(d, &event{Event: execution.Event{Kind: execution.Start, Attempt: n}, opener: opened[opener]})
	}
	end := func(d Event, outcome execution.Outcome) *event {
		return add(d, &event{Event: execution.Event{Kind: execution.End, Attempt: attempt[d.Opener], Outcome: outcome}, opener: opened[d.Opener]})
	}
	arrive := func(d Event, head string, c call) *event {
		arrivals[head]++
		return add(d, &event{Event: execution.Event{Kind: execution.Arrive, Visit: []int{arrivals[head]}}, head: head, call: c})
	}
	for _, d := range Decode(h) {
		if d.Opener != 0 && opened[d.Opener] == nil {
			continue // its opener was not mapped
		}
		switch d.Subject {
		case SubjectActivity:
			switch d.Phase {
			case PhaseScheduled:
				reach(d, "activity "+d.Name+"()", call{kind: callActivity, name: d.Name})
			case PhaseStarted:
				start(d, d.Opener, int(d.Attempt))
			case PhaseCompleted, PhaseFailed, PhaseTimedOut, PhaseCanceled:
				end(d, outcome(d.Phase))
			}
		case SubjectMarker:
			attr := h.Events[raw[d.ID]].GetMarkerRecordedEventAttributes()
			name := localActivityType(attr.GetDetails())
			if d.Name != localActivityMarker || name == "" {
				continue
			}
			reach(d, "activity "+name+"()", call{kind: callActivity, name: name})
			start(d, d.ID, 1)
			d.Opener = d.ID
			var o execution.Outcome
			if attr.GetFailure() != nil {
				o = execution.Failed
			}
			end(d, o)
		case SubjectTimer:
			switch d.Phase {
			case PhaseStarted:
				reach(d, "await timer("+duration(d.Duration)+")", call{kind: callTimer})
			case PhaseFired, PhaseCanceled:
				end(d, outcome(d.Phase))
			}
		case SubjectChild:
			switch {
			case d.Phase == PhaseInitiated:
				head := "workflow " + d.Name + "()"
				if d.Detached {
					head = "detach " + head
				}
				reach(d, head, call{kind: callWorkflow, name: d.Name})
			case d.Phase == PhaseStarted:
				l.children[start(d, d.Opener, 1).opener] = runKey{d.Target, d.TargetRun}
			default:
				end(d, outcome(d.Phase))
			}
		case SubjectNexus:
			switch d.Phase {
			case PhaseScheduled:
				reach(d, "nexus "+d.Target+" "+d.Name+"()", call{kind: callNexus, name: d.Target + " " + d.Name})
			case PhaseStarted:
				start(d, d.Opener, 1)
			case PhaseCompleted, PhaseFailed, PhaseTimedOut, PhaseCanceled:
				end(d, outcome(d.Phase))
			}
		case SubjectExternalSignal:
			switch d.Phase {
			case PhaseInitiated:
				c := call{kind: callSignal, name: d.Name}
				to := d.Target
				if k, ok := a.b.dispatch[eventAt{l.run, d.ID}]; ok {
					c.on = a.b.node(k.to).Name
					to = c.on
				}
				reach(d, "signal "+to+"."+d.Name+"()", c).pair = pair{l.run, d.Target, d.Name}
			case PhaseFailed:
				end(d, execution.Failed)
			}
		case SubjectSignal:
			e := arrive(d, "signal "+d.Name, call{kind: callArriveSignal, name: d.Name})
			if d.TargetRun != "" {
				e.pair = pair{runKey{d.Target, d.TargetRun}, l.run.workflowID, d.Name}
			}
		case SubjectUpdate:
			if d.Phase == PhaseAccepted {
				arrive(d, "update "+d.Name, call{kind: callArriveUpdate, name: d.Name})
			}
		case SubjectWorkflow:
			switch d.Phase {
			case PhaseTimedOut, PhaseCanceled, PhaseTerminated:
				// the server ended the run, and no statement did
				l.endedBy = add(d, &event{Event: execution.Event{Kind: execution.End, Outcome: outcome(d.Phase)}})
				continue
			}
			reason := map[Phase]string{PhaseCompleted: "complete", PhaseFailed: "fail", PhaseContinuedAsNew: "continue_as_new"}[d.Phase]
			if reason == "" {
				continue // started
			}
			l.endedBy = reach(d, "close "+reason, call{kind: callClose, name: reason})
			if d.Phase == PhaseContinuedAsNew {
				l.next = d.Target
			}
		}
	}
}

// outcome is how a closing phase departed from the design.
func outcome(p Phase) execution.Outcome {
	return map[Phase]execution.Outcome{
		PhaseFailed:     execution.Failed,
		PhaseTimedOut:   execution.TimedOut,
		PhaseCanceled:   execution.Cancelled,
		PhaseTerminated: execution.Terminated,
	}[p]
}

// duration writes d as a DURATION literal, in its largest whole unit.
func duration(d time.Duration) string {
	for _, u := range []struct {
		unit string
		d    time.Duration
	}{{"d", 24 * time.Hour}, {"h", time.Hour}, {"m", time.Minute}, {"s", time.Second}} {
		if d > 0 && d%u.d == 0 {
			return strconv.FormatInt(int64(d/u.d), 10) + u.unit
		}
	}
	return strconv.FormatInt(d.Milliseconds(), 10) + "ms"
}

// link joins the lanes: a child to the reach that started it, a parent's end
// of a child to the child's close, a continued run to the run it follows, and
// the k-th receipt of a signal from one run to that run's k-th send of it.
func (a *assembly) link() {
	sends := map[pair][]*event{}
	var receipts []*event
	for _, l := range a.order {
		if next := a.successor(l); next != nil {
			next.follows = l
		}
		for reach, run := range l.children {
			if child := a.lanes[run]; child != nil {
				child.startedBy = reach
			}
		}
		for _, e := range l.events {
			switch {
			case e.call.kind == callSignal:
				sends[e.pair] = append(sends[e.pair], e)
			case e.call.kind == callArriveSignal && e.pair != (pair{}):
				receipts = append(receipts, e)
			case e.Kind == execution.End:
				if run, ok := l.children[e.opener]; ok && a.lanes[run] != nil {
					e.from = a.last(a.lanes[run]).endedBy
				}
			}
		}
	}
	slices.SortStableFunc(receipts, func(x, y *event) int { return x.at.Compare(y.at) })
	for _, r := range receipts {
		if s := sends[r.pair]; len(s) > 0 {
			r.from, sends[r.pair] = s[0], s[1:]
		}
	}
	for _, l := range a.order {
		for _, e := range l.events {
			if e.arrival != nil {
				e.from = e.arrival.from
			}
		}
	}
}

// successor is the run l continued as, if the execution holds it.
func (a *assembly) successor(l *lane) *lane {
	if l.next == "" {
		return nil
	}
	return a.lanes[runKey{l.run.workflowID, l.next}]
}

// last is the last run of l's continue-as-new chain in the execution.
func (a *assembly) last(l *lane) *lane {
	for next := a.successor(l); next != nil; next = a.successor(l) {
		l = next
	}
	return l
}

// assemble names the lanes and events and lists them in one order that keeps
// every happens-before: each lane's own order, each from, and each lane's
// start, earliest time first.
func (a *assembly) assemble() *execution.Execution {
	total := 0
	for _, l := range a.order {
		l.flatten()
		total += len(l.events)
	}
	var events []*event
	placed := map[*event]bool{}
	next := map[*lane]int{}
	ready := func(l *lane) bool {
		if next[l] == len(l.events) {
			return false
		}
		e := l.events[next[l]]
		first := next[l] == 0
		return (e.from == nil || placed[e.from]) &&
			(!first || l.startedBy == nil || placed[l.startedBy]) &&
			(!first || l.follows == nil || next[l.follows] == len(l.follows.events))
	}
	for len(events) < total {
		var pick *lane
		for _, l := range a.order {
			if ready(l) && (pick == nil || l.events[next[l]].at.Before(pick.events[next[pick]].at)) {
				pick = l
			}
		}
		if pick == nil { // no order keeps every happens-before; Check reports what breaks
			for _, l := range a.order {
				if next[l] < len(l.events) {
					pick = l
					break
				}
			}
		}
		e := pick.events[next[pick]]
		next[pick]++
		placed[e] = true
		events = append(events, e)
	}

	at := map[*event]int{}
	for i, e := range events {
		at[e] = i
	}
	begins := func(l *lane) int {
		switch {
		case l.startedBy != nil:
			return at[l.startedBy]
		case l.follows != nil && l.follows.endedBy != nil:
			return at[l.follows.endedBy]
		}
		return -1
	}
	lanes := slices.Clone(a.order)
	slices.SortStableFunc(lanes, func(x, y *lane) int { return begins(x) - begins(y) })
	byKey := map[string][]*lane{}
	for _, l := range lanes {
		byKey[l.key] = append(byKey[l.key], l)
	}
	for _, same := range byKey {
		for i, l := range same {
			l.id = l.key
			if len(same) > 1 {
				l.id += " @" + strconv.Itoa(i+1)
			}
		}
	}

	x := &execution.Execution{}
	count := map[*lane]int{}
	for _, e := range events {
		count[e.lane]++
		e.ID, e.Lane = e.lane.id+"/"+strconv.Itoa(count[e.lane]), e.lane.id
	}
	for _, e := range events {
		if e.from != nil {
			e.Event.From = e.from.ID
		}
		x.Events = append(x.Events, e.Event)
	}
	for _, l := range lanes {
		xl := execution.Lane{ID: l.id, Node: l.node, WorkflowID: l.run.workflowID, RunID: l.run.runID}
		if l.startedBy != nil {
			xl.StartedBy = l.startedBy.ID
		}
		if l.endedBy != nil {
			xl.EndedBy = l.endedBy.ID
		}
		if l.follows != nil {
			xl.Follows = l.follows.id
		}
		x.Lanes = append(x.Lanes, xl)
	}
	return x
}

// serverEnd reports whether e is the end the server gave its run: it ran no
// statement, so it has no stmt.
func (e *event) serverEnd() bool {
	return e.Kind == execution.End && e.lane.endedBy == e
}

// flatten gives each statement event the join left without a stmt its head
// in a flat body, a reach's ranked among the lane's equal heads, and each start
// and end its opener's stmt and visit. A server's end has none.
func (l *lane) flatten() {
	heads := map[string]int{}
	for _, e := range l.events {
		if e.Kind == execution.Reach && e.Stmt == "" {
			heads[e.head]++
		}
	}
	rank := map[string]int{}
	for _, e := range l.events {
		switch {
		case e.serverEnd():
		case e.opener != nil:
			e.Stmt, e.Visit = e.opener.Stmt, e.opener.Visit
		case e.Stmt != "":
		default:
			e.Stmt = l.key + " › " + e.head
			if heads[e.head] > 1 {
				rank[e.head]++
				e.Stmt += " @" + strconv.Itoa(rank[e.head])
			}
		}
	}
}

// node is the graph's node of that ID.
func (b *builder) node(id string) graph.Node {
	i := slices.IndexFunc(b.og.Nodes, func(n graph.Node) bool { return n.ID == id })
	return b.og.Nodes[i]
}
