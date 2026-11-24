package execution

import (
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/stmtid"
)

var dispatches = []string{graph.EdgeActivityCall, graph.EdgeWorkflowCall, graph.EdgeNexusCall, graph.EdgeAsyncBacking, graph.EdgeSignalSend}

// Check reports each way x breaks the rules of the package doc and its
// fields. It reads x alone: whether a stmt or node exists is the design's to say.
func Check(x *Execution) []error {
	c := checker{x: x, lanes: map[string]Lane{}, at: map[string]int{}}
	for i, e := range x.Events {
		c.at[e.ID] = i
	}
	for _, l := range x.Lanes {
		if _, dup := c.lanes[l.ID]; dup {
			c.fail(l.ID, "is listed twice")
		}
		c.lanes[l.ID] = l
	}
	c.checkLanes()
	c.checkEvents()
	return c.errs
}

type checker struct {
	x     *Execution
	lanes map[string]Lane
	at    map[string]int // each event's place in x.Events
	errs  []error
}

func (c *checker) fail(subject, format string, args ...any) {
	c.errs = append(c.errs, fmt.Errorf("%s: %s", subject, fmt.Sprintf(format, args...)))
}

func (c *checker) checkLanes() {
	var keys []string
	byKey := map[string][]Lane{}
	for _, l := range c.x.Lanes {
		key := keyOf(l.ID)
		kind, name, _ := strings.Cut(key, ":")
		switch {
		case !slices.Contains([]string{graph.KindWorkflow, graph.KindWorker, "outside"}, kind) || name == "" || strings.Contains(key, " @"):
			c.fail(l.ID, "is not a workflow:, worker: or outside: key with an optional rank")
		case kind == "outside" && l.Node != "":
			c.fail(l.ID, "is outside the design, so has no node")
		case kind != "outside" && !strings.HasPrefix(l.Node, key+"/"):
			c.fail(l.ID, "node %q is not a deployment of %s", l.Node, key)
		}
		for _, ref := range []string{l.StartedBy, l.EndedBy} {
			if _, ok := c.at[ref]; ref != "" && !ok {
				c.fail(l.ID, "%q is not an event", ref)
			}
		}
		if i, ok := c.at[l.StartedBy]; ok {
			by := c.x.Events[i]
			if by.Lane == l.ID {
				c.fail(l.ID, "is started by its own event %s", l.StartedBy)
			}
			if kind == graph.KindWorkflow && (by.Edge == nil || by.Edge.To != l.Node) {
				c.fail(l.ID, "is started by %s, which dispatches no edge to its node", l.StartedBy)
			}
		}
		if _, ok := c.lanes[l.Follows]; l.Follows != "" && (!ok || keyOf(l.Follows) != key) {
			c.fail(l.ID, "follows %q, which is no run of %s", l.Follows, key)
		}
		if byKey[key] == nil {
			keys = append(keys, key)
		}
		byKey[key] = append(byKey[key], l)
	}
	for _, key := range keys {
		lanes := byKey[key]
		slices.SortStableFunc(lanes, func(a, b Lane) int { return c.start(a) - c.start(b) })
		for i, l := range lanes {
			want := i + 1
			if len(lanes) == 1 {
				want = 0
			}
			if _, rank := definition(l.ID); rank != want {
				c.fail(l.ID, "is run %d of %d of %s in start order", i+1, len(lanes), key)
			}
		}
	}
}

// start is where lane l starts in the event order: at the event that starts
// it, or where the run it follows ends; -1 from the top.
func (c *checker) start(l Lane) int {
	if i, ok := c.at[l.StartedBy]; ok {
		return i
	}
	if l.Follows != "" {
		if i, ok := c.at[c.lanes[l.Follows].EndedBy]; ok {
			return i
		}
	}
	return -1
}

func (c *checker) checkEvents() {
	count := map[string]int{}
	last := map[string]string{} // each lane's last event
	for _, e := range c.x.Events {
		last[e.Lane] = e.ID
	}
	keys := map[Key]string{}
	dispatched := map[Key]bool{}
	for i, e := range c.x.Events {
		l, ok := c.lanes[e.Lane]
		if !ok {
			c.fail(e.ID, "lane %q is not listed", e.Lane)
			continue
		}
		count[e.Lane]++
		if want := fmt.Sprintf("%s/%d", e.Lane, count[e.Lane]); e.ID != want {
			c.fail(e.ID, "is event %d of its lane, so its id is %q", count[e.Lane], want)
		}
		c.checkFields(e, l)
		if serverEnd(e) {
			c.checkServerEnd(e, l, last[e.Lane])
		}
		c.checkOrder(i, e, l)
		if e.Kind == Occur && !slices.Equal(e.Visit, []int{count[e.Lane]}) {
			c.fail(e.ID, "an occur's visit is its place in its lane, [%d]", count[e.Lane])
		}
		if e.Kind == Start && !dispatched[at(e)] {
			c.fail(e.ID, "starts an attempt no earlier reach dispatched")
		}
		if e.Kind == Reach && e.Edge != nil {
			dispatched[at(e)] = true
		}
		if e.Kind == End && e.Attempt > 0 {
			started := e.Key()
			started.Kind = Start
			if _, ok := keys[started]; !ok {
				c.fail(e.ID, "ends attempt %d, which never started", e.Attempt)
			}
		}
		if prev, dup := keys[e.Key()]; dup {
			c.fail(e.ID, "has the key of %s", prev)
		} else {
			keys[e.Key()] = e.ID
		}
	}
}

func (c *checker) checkFields(e Event, l Lane) {
	key := keyOf(l.ID)
	run := strings.HasPrefix(key, graph.KindWorkflow+":")
	switch e.Kind {
	case Reach, Start, End, Arrive:
		if !run {
			c.fail(e.ID, "a %s is in a run's lane", e.Kind)
		}
		if serverEnd(e) {
			break
		}
		if id, err := stmtid.Parse(e.Stmt); err != nil {
			c.fail(e.ID, "stmt: %v", err)
		} else if id.Def != key {
			c.fail(e.ID, "stmt %q is not under %s", e.Stmt, key)
		}
	case Occur:
		if run {
			c.fail(e.ID, "an occur is in a host or outside lane")
		}
		if e.Stmt != "" {
			c.fail(e.ID, "an occur has no stmt")
		}
	default:
		c.fail(e.ID, "kind %q is not reach, start, end, arrive or occur", e.Kind)
	}
	if slices.ContainsFunc(e.Visit, func(n int) bool { return n < 1 }) {
		c.fail(e.ID, "visit counts passes from 1")
	}
	switch {
	case e.Kind == Start && e.Attempt < 1:
		c.fail(e.ID, "a start counts its attempt from 1")
	case e.Kind != Start && e.Kind != End && e.Attempt != 0:
		c.fail(e.ID, "only a start or end has an attempt")
	}
	switch e.Outcome {
	case "", Failed, TimedOut, Cancelled, Terminated:
	default:
		c.fail(e.ID, "outcome %q is not failed, timedOut, cancelled or terminated", e.Outcome)
	}
	if e.Outcome != "" && e.Kind != End && e.Kind != Occur {
		c.fail(e.ID, "only an end or occur has an outcome")
	}
	if e.Edge != nil {
		switch {
		case e.Kind != Reach:
			c.fail(e.ID, "only a reach dispatches along an edge")
		case e.Edge.From != l.Node:
			c.fail(e.ID, "edge leaves %q, not its lane's node", e.Edge.From)
		case !slices.Contains(dispatches, e.Edge.Kind):
			c.fail(e.ID, "edge kind %q is not a dispatch", e.Edge.Kind)
		}
	}
	if e.On != "" {
		if e.Kind != Start {
			c.fail(e.ID, "only a start runs on a host")
		}
		if _, ok := c.lanes[e.On]; !ok || !strings.HasPrefix(e.On, graph.KindWorker+":") {
			c.fail(e.ID, "on %q is not a host lane", e.On)
		}
	}
	if e.Label != "" && e.Kind != Occur {
		c.fail(e.ID, "only an occur has a label")
	}
	if _, err := time.Parse(time.RFC3339, e.Time); e.Time != "" && err != nil {
		c.fail(e.ID, "time: %v", err)
	}
}

// serverEnd reports whether e is an end with no stmt: the server ended its run.
func serverEnd(e Event) bool {
	return e.Kind == End && e.Stmt == ""
}

// checkServerEnd holds a server's end to its rules: only a run's lane takes
// one, for an outcome only the server brings, and it closes the lane, as its
// endedBy and its last event. Edge, on and label are held by checkFields.
func (c *checker) checkServerEnd(e Event, l Lane, last string) {
	switch e.Outcome {
	case TimedOut, Cancelled, Terminated:
	default:
		c.fail(e.ID, "an end with no stmt has outcome timedOut, cancelled or terminated")
	}
	if e.Attempt != 0 || len(e.Visit) > 0 {
		c.fail(e.ID, "an end with no stmt has no attempt or visit")
	}
	if l.EndedBy != e.ID {
		c.fail(e.ID, "an end with no stmt is its lane's endedBy")
	}
	if last != e.ID {
		c.fail(e.ID, "an end with no stmt is its lane's last event")
	}
}

// checkOrder holds the event at i to the order: what it names comes before
// it, and it falls within its lane's life and its host's.
func (c *checker) checkOrder(i int, e Event, l Lane) {
	before := func(field, ref string) bool {
		j, ok := c.at[ref]
		switch {
		case !ok:
			c.fail(e.ID, "%s %q is not an event", field, ref)
		case j >= i:
			c.fail(e.ID, "%s %s does not come before it", field, ref)
		}
		return ok
	}
	if e.From != "" && before("from", e.From) && c.x.Events[c.at[e.From]].Lane == e.Lane {
		c.fail(e.ID, "from %s is in its own lane", e.From)
	}
	for _, ref := range e.After {
		before("after", ref)
	}
	within := func(what string, l Lane) {
		if c.start(l) > i {
			c.fail(e.ID, "%s %s starts after it", what, l.ID)
		}
		if j, ok := c.at[l.EndedBy]; ok && j < i {
			c.fail(e.ID, "%s %s has ended before it", what, l.ID)
		}
	}
	within("lane", l)
	if host, ok := c.lanes[e.On]; ok {
		within("host", host)
	}
}

// at is where e sits: its lane, stmt and visit.
func at(e Event) Key {
	return Key{Lane: e.Lane, Stmt: e.Stmt, Visit: e.Key().Visit}
}
