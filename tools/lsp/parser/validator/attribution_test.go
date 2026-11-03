package validator

import "testing"

// deployTree spreads one deployment over files so that most errors name a
// symbol defined in a file other than the one holding the error's position.
var deployTree = []namedSource{
	{"caller.twf", `workflow Caller(x: int) -> (int):
    activity Implicit(x) -> a
    activity Explicit(x) -> b
        options:
            task_queue: "nowhere"
    nexus Ep Svc.Op(x) -> c
    return c
`},
	{"targets.twf", `activity Implicit(x: int) -> (int):
    return x

activity Explicit(x: int) -> (int):
    return x

activity Orphan(x: int) -> (int):
    return x

activity Hollow():
    # nothing here

workflow Empty():
    # nothing here
`},
	{"services.twf", `nexus service Svc:
    async Op workflow Caller
`},
	{"workers.twf", `worker callerWorker:
    workflow Caller

worker targetWorker:
    activity Implicit
    activity Explicit

worker idle:
    # no registrations
`},
	{"deploy.twf", `namespace ns:
    worker callerWorker
        options:
            task_queue: "main"
    worker targetWorker
        options:
            task_queue: "other"
    nexus endpoint Ep
        options:
            task_queue: "main"
    nexus endpoint Bare

namespace staging:
    worker targetWorker

namespace idleNs:
    # no workers
`},
}

// signalTree spreads id: parent sends and id_schemes over files.
var signalTree = []namedSource{
	{"parents.twf", `workflow Coordinator(doc: Doc):
    signal Progress(pct: int):
        pct = pct
    workflow Step(doc)

workflow Auditor(doc: Doc):
    workflow Step(doc)

workflow Bystander(doc: Doc):
    signal Progress(pct: int):
        pct = pct
    activity Work(doc)

workflow ShipItem(order: Order, item: Item):
    id_scheme: "ship-{order.id}-{item.id}"
    activity Work(order)
`},
	{"step.twf", `workflow Step(doc: Doc):
    signal Bystander.Progress(50)
        id: parent

workflow ShipOrder(order: Order):
    id_scheme: "ship-{order.id}"
    activity Work(order)

activity Work(doc: Doc):
    work(doc)
`},
	{"deploy.twf", `worker W:
    workflow ShipItem
    workflow ShipOrder
    activity Work

namespace prod:
    worker W
        options:
            task_queue: "q"
`},
}

// TestErrorFileIsReferenceSite pins issue #238: every validator error carries
// the file of the definition enclosing its position — the caller for a
// call-site error — not the file of the symbol its Name points at.
func TestErrorFileIsReferenceSite(t *testing.T) {
	deployErrs := Validate(mustMergeNamedAndResolve(t, deployTree...))
	signalErrs := Validate(mustMergeNamedAndResolve(t, signalTree...))
	tests := []struct {
		errs []*Error
		kind ErrorKind
		file string
	}{
		{deployErrs, ErrEmptyWorkflow, "targets.twf"},
		{deployErrs, ErrEmptyActivity, "targets.twf"},
		{deployErrs, ErrEmptyWorker, "workers.twf"},
		{deployErrs, ErrEmptyNamespace, "deploy.twf"},
		{deployErrs, ErrMissingTaskQueue, "deploy.twf"},
		{deployErrs, ErrMissingEndpointTaskQueue, "deploy.twf"},
		{deployErrs, ErrUncoveredWorkflow, "targets.twf"},
		{deployErrs, ErrUncoveredActivity, "targets.twf"},
		{deployErrs, ErrUncoveredService, "services.twf"},
		{deployErrs, ErrUninstantiatedWorker, "workers.twf"},
		{deployErrs, ErrExplicitRoutingMismatch, "caller.twf"},
		{deployErrs, ErrImplicitRoutingMismatch, "caller.twf"},
		{deployErrs, ErrEndpointServiceLinkage, "caller.twf"},
		{signalErrs, ErrNotAParent, "step.twf"},
		{signalErrs, ErrStarterLacksSignal, "step.twf"},
		{signalErrs, ErrIDSchemeOverlap, "step.twf"},
	}
	for _, tt := range tests {
		t.Run(tt.kind.String(), func(t *testing.T) {
			if countKind(tt.errs, tt.kind) == 0 {
				t.Fatalf("no %s error; got %v", tt.kind, tt.errs)
			}
			for _, e := range tt.errs {
				if e.Kind == tt.kind && e.File != tt.file {
					t.Errorf("%s %q: File = %q, want %q", tt.kind, e.Msg, e.File, tt.file)
				}
			}
		})
	}
}

// TestPositionlessErrorHasNoFile: a task queue coherence error has no position,
// so no definition encloses it and File stays empty.
func TestPositionlessErrorHasNoFile(t *testing.T) {
	errs := Validate(mustMergeNamedAndResolve(t,
		namedSource{"defs.twf", `workflow A(x: int) -> (int):
    return x

workflow B(x: int) -> (int):
    return x
`},
		namedSource{"deploy.twf", `worker first:
    workflow A

worker second:
    workflow B

namespace ns:
    worker first
        options:
            task_queue: "shared"
    worker second
        options:
            task_queue: "shared"
`},
	))
	if countKind(errs, ErrTaskQueueMismatch) == 0 {
		t.Fatalf("no TASK_QUEUE_MISMATCH error; got %v", errs)
	}
	for _, e := range errs {
		if e.Kind == ErrTaskQueueMismatch && e.File != "" {
			t.Errorf("TASK_QUEUE_MISMATCH File = %q, want empty", e.File)
		}
	}
}
