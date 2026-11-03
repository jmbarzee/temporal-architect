package validator

import (
	"strings"
	"testing"
)

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

// TestCallerFileFromHandlerAndSyncOp: a call in a workflow's handler body is
// attributed to the workflow's file, and a call in a sync nexus operation body
// to the service's file.
func TestCallerFileFromHandlerAndSyncOp(t *testing.T) {
	errs := Validate(mustMergeNamedAndResolve(t,
		namedSource{"handlers.twf", `workflow Parent():
    signal Kick():
        activity Act(1)
    close complete()
`},
		namedSource{"svc.twf", `nexus service Svc:
    sync Op(x: int) -> (int):
        activity Act(x) -> y
            options:
                task_queue: "act-q"
        close complete(y)
`},
		namedSource{"targets.twf", `activity Act(x: int) -> (int):
    return x
`},
		namedSource{"deploy.twf", `worker parentWorker:
    workflow Parent

worker svcWorker:
    nexus service Svc

worker actWorker:
    activity Act

namespace alpha:
    worker parentWorker
        options:
            task_queue: "shared"
    worker svcWorker
        options:
            task_queue: "svc-q"

namespace beta:
    worker actWorker
        options:
            task_queue: "shared"
`},
	))
	for kind, file := range map[ErrorKind]string{
		ErrImplicitRoutingMismatch: "handlers.twf",
		ErrExplicitRoutingMismatch: "svc.twf",
	} {
		if countKind(errs, kind) == 0 {
			t.Fatalf("no %s error; got %v", kind, errs)
		}
		for _, e := range errs {
			if e.Kind == kind && e.File != file {
				t.Errorf("%s %q: File = %q, want %q", kind, e.Msg, e.File, file)
			}
		}
	}
}

// TestTaskQueueCoherenceAtLaterInstantiation pins issue #248: a coherence
// error lands on the later of the two worker instantiations sharing a queue,
// in the namespace's file — never on a definition that merely shares the
// queue's name (workflow shared, in defs.twf).
func TestTaskQueueCoherenceAtLaterInstantiation(t *testing.T) {
	errs := Validate(mustMergeNamedAndResolve(t,
		namedSource{"defs.twf", `workflow shared(x: int) -> (int):
    return x

workflow A(x: int) -> (int):
    return x

workflow B(x: int) -> (int):
    return x
`},
		namedSource{"deploy.twf", `worker first:
    workflow A
    workflow shared

worker second:
    workflow B

worker third:
    workflow A
    workflow shared

namespace ns:
    worker first
        options:
            task_queue: "shared"
    worker second
        options:
            task_queue: "shared"
    worker third
        options:
            task_queue: "shared"
`},
	))
	tests := []struct {
		kind ErrorKind
		line int
	}{
		{ErrTaskQueueMismatch, 16},  // first vs second
		{ErrTaskQueueIdentical, 19}, // first vs third
	}
	for _, tt := range tests {
		if countKind(errs, tt.kind) != 1 {
			t.Fatalf("want one %s error; got %v", tt.kind, errs)
		}
		for _, e := range errs {
			if e.Kind != tt.kind {
				continue
			}
			if e.File != "deploy.twf" || e.Line != tt.line || e.Column != 5 {
				t.Errorf("%s at %s:%d:%d, want deploy.twf:%d:5", tt.kind, e.File, e.Line, e.Column, tt.line)
			}
		}
	}
}

// TestTaskQueueCoherenceAcrossPackages: two packages each declare namespace
// prod with a worker on queue q. The files are given in an order their base
// names do not sort into (zeta before alpha), and the report lands on the
// later instantiation in that source order: alpha.twf.
func TestTaskQueueCoherenceAcrossPackages(t *testing.T) {
	errs := Validate(mustMergeNamedAndResolve(t,
		namedSource{"zeta.twf", `package a

workflow A(x: int) -> (int):
    return x

worker wa:
    workflow A

namespace prod:
    worker wa
        options:
            task_queue: "q"
`},
		namedSource{"alpha.twf", `package b

workflow B(x: int) -> (int):
    return x

worker wb:
    workflow B

namespace prod:
    worker wb
        options:
            task_queue: "q"
`},
	))
	if countKind(errs, ErrTaskQueueMismatch) != 1 {
		t.Fatalf("want one TASK_QUEUE_MISMATCH error; got %v", errs)
	}
	for _, e := range errs {
		if e.Kind != ErrTaskQueueMismatch {
			continue
		}
		if e.File != "alpha.twf" || e.Line != 10 || e.Column != 5 {
			t.Errorf("TASK_QUEUE_MISMATCH at %s:%d:%d, want alpha.twf:10:5", e.File, e.Line, e.Column)
		}
		if want := `workers wa and wb on task queue "q"`; !strings.Contains(e.Msg, want) {
			t.Errorf("TASK_QUEUE_MISMATCH %q, want it to name %s", e.Msg, want)
		}
	}
}
