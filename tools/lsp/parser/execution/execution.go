// Package execution defines one execution of a design: the runs and hosts it
// spans, as lanes, and what happened in each, as events, listed in one order
// that keeps every happens-before. It points into the AST and the graph and
// restates neither. Like observe, it is Temporal-free: whatever records or
// plans an execution produces this shape, and Check holds it to its rules.
//
// Identity:
//   - A lane's id is the definition key of what it runs: workflow:<name> for
//     a run, worker:<name> for a host, outside:<name> for a participant outside
//     the design, named by whatever declares the path. Lanes sharing a key
//     carry " @n", their rank in start order from 1, as stmtid ranks heads; a
//     lane alone on its key carries none.
//   - A lane's node is the graph node it is deployed as; an outside lane has none.
//   - An event's id is a handle, "<lane>/<n>", n its place in its lane from 1.
//   - An event's stmt is a stmtid identity under its lane's definition. Its
//     visit holds the pass of each enclosing for, outermost first, the for's
//     own pass included on the for's own reach; under a handler it begins with
//     which arrival this is. An occur has no stmt, and its visit is its place
//     in its lane.
//   - Event.Key is an event's identity across executions, what a recorded and
//     a designed execution, and the knobs authored over either, match on. Keys
//     are unique.
//
// Dispatch: the reach that makes a call, a send or a run's start carries the
// graph edge it dispatches along. A start follows the reach that dispatched
// it, and a run is started by a reach whose edge reaches the run's node.
//
// Derived, not stored:
//   - labels and verbs, from the head that ends stmt
//   - an event's queue, from the graph node its lane or its edge reaches
//   - the branch taken, from the next event's stmt
//   - concurrency between await all branches, from stmt
//   - which yield a handler ran at, from the order
//   - queued boxes, from a call reached before its attempt starts
//   - rows, lane order, folds, spans and titles
package execution

// Execution is one execution of a design. Events are listed in one order that
// keeps happens-before: lane order, from, after and each lane's start.
type Execution struct {
	Lanes  []Lane  `json:"lanes"`
	Events []Event `json:"events"`
}

// Lane is one run, host or outside participant.
type Lane struct {
	ID   string `json:"id"`
	Node string `json:"node,omitempty"`
	// StartedBy is the event that starts the lane; absent, it is there from the top.
	StartedBy string `json:"startedBy,omitempty"`
	// EndedBy is the event that ends it: a run's close, a host's release or
	// loss; absent, it lasts to the end.
	EndedBy string `json:"endedBy,omitempty"`
	// Follows is the run this one continued as new from; it starts where that
	// run ends.
	Follows string `json:"follows,omitempty"`
	// WorkflowID and RunID are recorded only.
	WorkflowID string `json:"workflowId,omitempty"`
	RunID      string `json:"runId,omitempty"`
}

// Kind is what an event is.
type Kind string

const (
	Reach  Kind = "reach"  // the run executes a statement
	Start  Kind = "start"  // a call attempt starts running
	End    Kind = "end"    // a call attempt, timer or await resolves
	Arrive Kind = "arrive" // a handler runs
	Occur  Kind = "occur"  // something happens in a host or outside lane
)

// Outcome is how an event departed from the design; absent, it ran as designed.
type Outcome string

const (
	Failed     Outcome = "failed"
	TimedOut   Outcome = "timedOut"
	Cancelled  Outcome = "cancelled"
	Terminated Outcome = "terminated"
)

// Edge is a graph edge by the key observe matches on.
type Edge struct {
	From string `json:"from"`
	To   string `json:"to"`
	Kind string `json:"kind"`
}

// Event is one thing that happened in a lane.
type Event struct {
	ID      string  `json:"id"`
	Lane    string  `json:"lane"`
	Kind    Kind    `json:"kind"`
	Stmt    string  `json:"stmt,omitempty"`
	Visit   []int   `json:"visit,omitempty"`
	Attempt int     `json:"attempt,omitempty"`
	Outcome Outcome `json:"outcome,omitempty"`
	// Edge is what a reach dispatches along: a call, a start or a send.
	Edge *Edge `json:"edge,omitempty"`
	// From is the event in another lane that caused this one.
	From string `json:"from,omitempty"`
	// After lists events this one follows beyond its lane's order and From.
	After []string `json:"after,omitempty"`
	// On is the host lane a start runs on.
	On string `json:"on,omitempty"`
	// Label names what an occur event was.
	Label string `json:"label,omitempty"`
	// Time is when it happened, RFC 3339; recorded only.
	Time string `json:"time,omitempty"`
}
