package validator

import (
	"slices"
	"testing"
)

// routingMsgs returns the messages of the routing and linkage errors in errs.
func routingMsgs(errs []*Error) []string {
	var msgs []string
	for _, e := range errs {
		switch e.Kind {
		case ErrExplicitRoutingMismatch, ErrImplicitRoutingMismatch, ErrEndpointServiceLinkage:
			msgs = append(msgs, e.Msg)
		}
	}
	return msgs
}

// TestRoutingIsNamespaceScoped: a task queue is scoped to its namespace, so a
// call or endpoint is satisfied only by a worker on the routed queue in the
// namespace the call is made from (issue #231). Each case has one call site;
// want is its complete, ordered list of routing diagnostics.
func TestRoutingIsNamespaceScoped(t *testing.T) {
	tests := []struct {
		name string
		src  string
		want []string
	}{
		{
			name: "implicit: target only on the same-named queue in another namespace",
			src: `package demo

workflow Parent():
    workflow Child()
    close complete()

workflow Child():
    close complete()

worker parentWorker:
    workflow Parent

worker childWorker:
    workflow Child

namespace alpha:
    worker parentWorker
        options:
            task_queue: "shared"

namespace beta:
    worker childWorker
        options:
            task_queue: "shared"
`,
			want: []string{
				`workflow Child is not on any worker polling task queue "shared" in namespace alpha (inherited from workflow Parent)`,
			},
		},
		{
			name: "implicit: caller in two namespaces, target in one",
			src: `workflow Parent():
    workflow Child()
    close complete()

workflow Child():
    close complete()

worker parentWorker:
    workflow Parent

worker fullWorker:
    workflow Parent
    workflow Child

namespace alpha:
    worker parentWorker
        options:
            task_queue: "shared"

namespace beta:
    worker fullWorker
        options:
            task_queue: "shared"
`,
			want: []string{
				`workflow Child is not on any worker polling task queue "shared" in namespace alpha (inherited from workflow Parent)`,
			},
		},
		{
			name: "implicit: two caller workers on one placement report once",
			src: `workflow Parent():
    workflow Child()
    close complete()

workflow Child():
    close complete()

worker parentWorker:
    workflow Parent

worker parentReplica:
    workflow Parent

namespace alpha:
    worker parentWorker
        options:
            task_queue: "shared"
    worker parentReplica
        options:
            task_queue: "shared"
`,
			want: []string{
				`workflow Child is not on any worker polling task queue "shared" in namespace alpha (inherited from workflow Parent)`,
			},
		},
		{
			name: "implicit: caller in two namespaces, target in both",
			src: `workflow Parent():
    workflow Child()
    close complete()

workflow Child():
    close complete()

worker fullWorker:
    workflow Parent
    workflow Child

namespace alpha:
    worker fullWorker
        options:
            task_queue: "shared"

namespace beta:
    worker fullWorker
        options:
            task_queue: "shared"
`,
		},
		{
			name: "explicit: target's queue polled only outside the caller's namespace",
			src: `workflow Parent():
    workflow Child()
        options:
            task_queue: "child-q"
    close complete()

workflow Child():
    close complete()

worker parentWorker:
    workflow Parent

worker childWorker:
    workflow Child

namespace alpha:
    worker parentWorker
        options:
            task_queue: "parent-q"

namespace beta:
    worker childWorker
        options:
            task_queue: "child-q"
`,
			want: []string{
				`workflow Child has task_queue "child-q", but no worker on that queue in namespace alpha registers it`,
			},
		},
		{
			name: "explicit: one error per caller namespace missing the target",
			src: `workflow Parent():
    workflow Child()
        options:
            task_queue: "child-q"
    close complete()

workflow Child():
    close complete()

worker parentWorker:
    workflow Parent

worker parentBatchWorker:
    workflow Parent

worker childWorker:
    workflow Child

namespace gamma:
    worker parentWorker
        options:
            task_queue: "parent-q"

namespace beta:
    worker parentWorker
        options:
            task_queue: "parent-q"
    worker childWorker
        options:
            task_queue: "child-q"

namespace alpha:
    worker parentWorker
        options:
            task_queue: "parent-q"
    worker parentBatchWorker
        options:
            task_queue: "parent-batch-q"
`,
			want: []string{
				`workflow Child has task_queue "child-q", but no worker on that queue in namespace alpha registers it`,
				`workflow Child has task_queue "child-q", but no worker on that queue in namespace gamma registers it`,
			},
		},
		{
			name: "explicit: target's queue polled in the caller's namespace",
			src: `workflow Parent():
    workflow Child()
        options:
            task_queue: "child-q"
    close complete()

workflow Child():
    close complete()

worker parentWorker:
    workflow Parent

worker childWorker:
    workflow Child

namespace alpha:
    worker parentWorker
        options:
            task_queue: "parent-q"
    worker childWorker
        options:
            task_queue: "child-q"
`,
		},
		{
			name: "explicit from a sync nexus operation: target outside the service's namespace",
			src: `nexus service Svc:
    sync Op(x: int) -> (int):
        activity Act(x) -> y
            options:
                task_queue: "act-q"
        close complete(y)

activity Act(x: int) -> (int):
    return x

worker svcWorker:
    nexus service Svc

worker actWorker:
    activity Act

namespace alpha:
    worker svcWorker
        options:
            task_queue: "svc-q"

namespace beta:
    worker actWorker
        options:
            task_queue: "act-q"
`,
			want: []string{
				`activity Act has task_queue "act-q", but no worker on that queue in namespace alpha registers it`,
			},
		},
		{
			name: "explicit from a sync nexus operation: target in the service's namespace",
			src: `nexus service Svc:
    sync Op(x: int) -> (int):
        activity Act(x) -> y
            options:
                task_queue: "act-q"
        close complete(y)

activity Act(x: int) -> (int):
    return x

worker svcWorker:
    nexus service Svc

worker actWorker:
    activity Act

namespace alpha:
    worker svcWorker
        options:
            task_queue: "svc-q"
    worker actWorker
        options:
            task_queue: "act-q"
`,
		},
		{
			name: "async: promise and await calls inherit the caller's namespace",
			src: `workflow Parent():
    promise p <- workflow Child()
    await activity Act()
    await p
    close complete()

workflow Child():
    close complete()

activity Act():
    return 0

worker parentWorker:
    workflow Parent

worker childWorker:
    workflow Child
    activity Act

namespace alpha:
    worker parentWorker
        options:
            task_queue: "shared"

namespace beta:
    worker childWorker
        options:
            task_queue: "shared"
`,
			want: []string{
				`workflow Child is not on any worker polling task queue "shared" in namespace alpha (inherited from workflow Parent)`,
				`activity Act is not on any worker polling task queue "shared" in namespace alpha (inherited from workflow Parent)`,
			},
		},
		{
			name: "caller's instantiation lacks task_queue: explicit checked in its namespace, implicit skipped",
			src: `workflow Parent():
    workflow Child()
        options:
            task_queue: "nowhere"
    workflow Child()
    close complete()

workflow Child():
    close complete()

worker parentWorker:
    workflow Parent

worker childWorker:
    workflow Child

namespace alpha:
    worker parentWorker
    worker childWorker
        options:
            task_queue: "child-q"
`,
			want: []string{
				`workflow Child has task_queue "nowhere", but no worker on that queue in namespace alpha registers it`,
			},
		},
		{
			name: "implicit: templated namespace is matched by its full spelling; its q-{org} is a family",
			src: `workflow Parent():
    workflow Child()
    close complete()

workflow Child():
    close complete()

worker parentWorker:
    workflow Parent

worker childWorker:
    workflow Child

namespace shard-{org}:
    worker parentWorker
        options:
            task_queue: "q-{org}"

namespace tenant-{org}:
    worker childWorker
        options:
            task_queue: "q-{org}"
`,
			want: []string{
				`workflow Child is not on any worker polling a queue of the shape of "q-{org}" in namespace shard-{org} (inherited from workflow Parent)`,
			},
		},
		{
			name: "default_options: sync and async calls route to the target's default queue",
			src: `workflow Order(x: int):
    activity Charge(x) -> y
    promise p <- activity Charge(x)
    await p
    close complete(y)

activity Charge(x: int) -> (int):
    default_options:
        task_queue: "payment-workers"
    return x

worker orderWorker:
    workflow Order

worker paymentWorker:
    activity Charge

namespace prod:
    worker orderWorker
        options:
            task_queue: "orders"
    worker paymentWorker
        options:
            task_queue: "payment-workers"
`,
		},
		{
			name: "default_options: target's default queue polled only in another namespace",
			src: `workflow Order(x: int):
    activity Charge(x) -> y
    promise p <- activity Charge(x)
    await p
    close complete(y)

activity Charge(x: int) -> (int):
    default_options:
        task_queue: "payment-workers"
    return x

worker orderWorker:
    workflow Order

worker paymentWorker:
    activity Charge

namespace prod:
    worker orderWorker
        options:
            task_queue: "orders"

namespace payments:
    worker paymentWorker
        options:
            task_queue: "payment-workers"
`,
			want: []string{
				`activity Charge has task_queue "payment-workers" (from its default_options), but no worker on that queue in namespace prod registers it`,
				`activity Charge has task_queue "payment-workers" (from its default_options), but no worker on that queue in namespace prod registers it`,
			},
		},
		{
			name: "default_options: a call-site task_queue overrides a workflow's default",
			src: `workflow Parent():
    workflow Child()
        options:
            task_queue: "child-q"
    workflow Child()
    close complete()

workflow Child():
    default_options:
        task_queue: "nowhere"
    close complete()

worker parentWorker:
    workflow Parent

worker childWorker:
    workflow Child

namespace alpha:
    worker parentWorker
        options:
            task_queue: "parent-q"
    worker childWorker
        options:
            task_queue: "child-q"
`,
			want: []string{
				`workflow Child has task_queue "nowhere" (from its default_options), but no worker on that queue in namespace alpha registers it`,
			},
		},
		{
			name: "external targets are not routing-checked, even beside a same-named local",
			src: `package demo

import "acme/other"

workflow Parent():
    activity other.Act()
    activity other.Act()
        options:
            task_queue: "elsewhere"
    await activity other.Act()
    promise p <- workflow other.Child()
    await p
    close complete()

workflow Child():
    close complete()

activity Act():
    return 0

worker parentWorker:
    workflow Parent

worker localWorker:
    workflow Child
    activity Act

namespace alpha:
    worker parentWorker
        options:
            task_queue: "shared"
    worker localWorker
        options:
            task_queue: "local-q"
`,
		},
		{
			name: "implicit: call in a signal handler body inherits the workflow's placement",
			src: `workflow Parent():
    signal Kick():
        activity Act()
    close complete()

activity Act():
    return 0

worker parentWorker:
    workflow Parent

worker actWorker:
    activity Act

namespace alpha:
    worker parentWorker
        options:
            task_queue: "shared"

namespace beta:
    worker actWorker
        options:
            task_queue: "shared"
`,
			want: []string{
				`activity Act is not on any worker polling task queue "shared" in namespace alpha (inherited from workflow Parent)`,
			},
		},
		{
			name: "endpoint: service only on the endpoint's queue in another namespace",
			src: `nexus service Svc:
    async Op workflow Backing

workflow Backing():
    close complete()

workflow W():
    nexus Ep Svc.Op() -> result
    close complete(result)

worker callerWorker:
    workflow W

worker svcWorker:
    nexus service Svc
    workflow Backing

namespace a:
    worker callerWorker
        options:
            task_queue: "wq"
    nexus endpoint Ep
        options:
            task_queue: "q"

namespace b:
    worker svcWorker
        options:
            task_queue: "q"
`,
			want: []string{
				`nexus endpoint Ep routes to task queue "q" in namespace a, but no worker on that queue has service Svc`,
			},
		},
		{
			name: "endpoint: service on the endpoint's queue in its namespace",
			src: `nexus service Svc:
    async Op workflow Backing

workflow Backing():
    close complete()

workflow W():
    nexus Ep Svc.Op() -> result
    close complete(result)

worker callerWorker:
    workflow W

worker svcWorker:
    nexus service Svc
    workflow Backing

namespace a:
    worker callerWorker
        options:
            task_queue: "wq"
    worker svcWorker
        options:
            task_queue: "q"
    nexus endpoint Ep
        options:
            task_queue: "q"
`,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := routingMsgs(Validate(mustParseAndResolve(t, tt.src)))
			if !slices.Equal(got, tt.want) {
				t.Errorf("routing diagnostics:\n got  %q\n want %q", got, tt.want)
			}
		})
	}
}

// TestUnhostedCallerNotRoutingChecked: a caller on no instantiated worker has
// no namespace to route from, so even an explicit task_queue naming a queue no
// worker polls draws no routing error — only the UNCOVERED_WORKFLOW warning.
func TestUnhostedCallerNotRoutingChecked(t *testing.T) {
	src := `workflow Parent():
    workflow Child()
        options:
            task_queue: "nowhere-q"
    close complete()

workflow Child():
    close complete()

worker childWorker:
    workflow Child

namespace alpha:
    worker childWorker
        options:
            task_queue: "child-q"
`
	errs := Validate(mustParseAndResolve(t, src))
	if got := routingMsgs(errs); len(got) != 0 {
		t.Errorf("expected no routing diagnostics for an unhosted caller, got %q", got)
	}
	if got := countKind(errs, ErrUncoveredWorkflow); got != 1 {
		t.Errorf("expected exactly one UNCOVERED_WORKFLOW, got %d: %v", got, errs)
	}
}

// TestCoherenceIsNamespaceScoped: workers on a same-named queue are compared
// only within one namespace. Different type sets on "shared" in two
// namespaces are two queues and coherent; in one namespace they mismatch.
func TestCoherenceIsNamespaceScoped(t *testing.T) {
	const types = `workflow A():
    close complete()

workflow B():
    close complete()

worker aw:
    workflow A

worker bw:
    workflow B
`
	tests := []struct {
		name       string
		namespaces string
		want       int
	}{
		{
			name: "two namespaces",
			namespaces: `
namespace alpha:
    worker aw
        options:
            task_queue: "shared"

namespace beta:
    worker bw
        options:
            task_queue: "shared"
`,
			want: 0,
		},
		{
			name: "one namespace",
			namespaces: `
namespace alpha:
    worker aw
        options:
            task_queue: "shared"
    worker bw
        options:
            task_queue: "shared"
`,
			want: 1,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			errs := Validate(mustParseAndResolve(t, types+tt.namespaces))
			if got := countKind(errs, ErrTaskQueueMismatch); got != tt.want {
				t.Errorf("TASK_QUEUE_MISMATCH count = %d, want %d: %v", got, tt.want, errs)
			}
		})
	}
}
