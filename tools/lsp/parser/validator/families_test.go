package validator

import (
	"fmt"
	"slices"
	"strings"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/parser"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/resolver"
)

// resolvedAllowingErrors parses and resolves src, keeping resolve errors such
// as QUEUE_TEMPLATE_MALFORMED that a test means to provoke. Every namespace is
// stamped with ns.twf so File can be asserted.
func resolvedAllowingErrors(t *testing.T, src string) *ast.File {
	t.Helper()
	file, err := parser.ParseFile(src)
	if err != nil {
		t.Fatalf("unexpected parse error: %v", err)
	}
	for _, def := range file.Definitions {
		if ns, ok := def.(*ast.NamespaceDef); ok {
			ns.SourceFile = "ns.twf"
		}
	}
	resolver.Resolve(file)
	return file
}

// render formats the errors of the given kinds, in emission order, as
// "severity CODE L:C name file: msg".
func render(errs []*Error, kinds ...ErrorKind) []string {
	var out []string
	for _, e := range errs {
		if slices.Contains(kinds, e.Kind) {
			sev := e.Severity
			if sev == "" {
				sev = "error"
			}
			out = append(out, fmt.Sprintf("%s %s %d:%d %s %s: %s", sev, e.Code(), e.Line, e.Column, e.Name, e.File, e.Msg))
		}
	}
	return out
}

func checkRendered(t *testing.T, got, want []string) {
	t.Helper()
	if !slices.Equal(got, want) {
		t.Errorf("diagnostics:\n got  %s\n want %s", strings.Join(got, "\n      "), strings.Join(want, "\n      "))
	}
}

var routingKinds = []ErrorKind{ErrExplicitRoutingMismatch, ErrImplicitRoutingMismatch, ErrEndpointServiceLinkage}

// TestExplicitRoutingMatchesShape: an explicit queue reaches a placement whose
// queue matches it — identical spelling, or the same shape — and the message
// says which comparison failed.
func TestExplicitRoutingMatchesShape(t *testing.T) {
	const at = "error EXPLICIT_ROUTING_MISMATCH 2:5 A : "
	tests := []struct {
		call, deploy string
		want         []string
	}{
		{"sandbox-{lease.id}", "sandbox-{id}", nil},
		{"{lease.queue}", "{hostId}", nil},
		// Identical spelling matches though only the call side parses.
		{"q-{a.b}", "q-{a.b}", nil},
		{"sandbox-{lease.id}", "{hostId}", []string{at + `activity A has task_queue "sandbox-{lease.id}", but no worker polling a queue of that shape in namespace ns registers it`}},
		{"{lease.queue}", "sandbox", []string{at + `activity A has a learned task_queue "{lease.queue}", but no per-instance worker family in namespace ns registers it; a .twf learned queue names a family member (model a static set as a family or as static calls)`}},
		// A malformed placement matches nothing, its own spelling included.
		{"sandbox{a}{b}", "sandbox{a}{b}", []string{at + `activity A has task_queue "sandbox{a}{b}", but no worker on that queue in namespace ns registers it`}},
	}
	for _, tt := range tests {
		src := `workflow W(lease: Lease):
	activity A(lease) -> r
		options:
			task_queue: "` + tt.call + `"
			schedule_to_start_timeout: 30s
	close complete(r)

activity A(lease: Lease) -> (Lease):
	return lease

worker ww:
	workflow W

worker aw:
	activity A

namespace ns:
	worker ww
		options:
			task_queue: "w"
	worker aw
		options:
			task_queue: "` + tt.deploy + `"
`
		t.Run(tt.call+" vs "+tt.deploy, func(t *testing.T) {
			checkRendered(t, render(Validate(resolvedAllowingErrors(t, src)), routingKinds...), tt.want)
		})
	}
}

// TestExplicitRoutingFromDefaultOptionsShape: a default_options queue with
// parameters is a runtime queue and keeps its source suffix in the message.
func TestExplicitRoutingFromDefaultOptionsShape(t *testing.T) {
	src := `workflow W(x: X):
	activity A(x) -> r
	promise p <- activity A(x)
	await p
	close complete(r)

activity A(x: X) -> (X):
	default_options:
		task_queue: "a-{x.id}"
		schedule_to_close_timeout: 1m
	return x

worker ww:
	workflow W

worker aw:
	activity A

namespace ns:
	worker ww
		options:
			task_queue: "w"
	worker aw
		options:
			task_queue: "a"
`
	const msg = `activity A has task_queue "a-{x.id}" (from its default_options), but no worker polling a queue of that shape in namespace ns registers it`
	checkRendered(t, render(Validate(resolvedAllowingErrors(t, src)), routingKinds...), []string{
		"error EXPLICIT_ROUTING_MISMATCH 2:5 A : " + msg,
		"error EXPLICIT_ROUTING_MISMATCH 3:5 A : " + msg,
	})
}

// TestImplicitRoutingByDeployKey: an implicit call inherits its caller's
// placement and needs a placement with the same deploy key. A malformed
// placement has none to inherit.
func TestImplicitRoutingByDeployKey(t *testing.T) {
	const at = "error IMPLICIT_ROUTING_MISMATCH 2:5 Child : "
	tests := []struct {
		parentQ, childQ string
		want            []string
	}{
		{"static", "static", nil},
		{"sandbox-{a}", "sandbox-{b}", nil},
		{"{hostId}", "x-{y}", []string{at + `workflow Child is not on any worker polling a queue of the shape of "{hostId}" in namespace ns (inherited from workflow Parent)`}},
		{"q-{a.b}", "q-{x}", []string{at + `workflow Child is not on any worker polling task queue "q-{a.b}" in namespace ns (inherited from workflow Parent)`}},
		{"sandbox{a}{b}", "other", nil},
	}
	for _, tt := range tests {
		src := `workflow Parent():
	workflow Child()
	close complete()

workflow Child():
	close complete()

worker pw:
	workflow Parent

worker cw:
	workflow Child

namespace ns:
	worker pw
		options:
			task_queue: "` + tt.parentQ + `"
	worker cw
		options:
			task_queue: "` + tt.childQ + `"
`
		t.Run(tt.parentQ+" vs "+tt.childQ, func(t *testing.T) {
			checkRendered(t, render(Validate(resolvedAllowingErrors(t, src)), routingKinds...), tt.want)
		})
	}
}

// TestMalformedPlacementKeepsCallerNamespace: a caller hosted only on a
// malformed placement is still in that namespace, so its explicit calls are
// checked there, and D4 still runs.
func TestMalformedPlacementKeepsCallerNamespace(t *testing.T) {
	src := `workflow W(lease: Lease):
	activity A(lease) -> r
		options:
			task_queue: "sandbox-{lease.id}"
	activity B(lease) -> s
		options:
			task_queue: "nowhere"
	close complete(r)

activity A(lease: Lease) -> (Lease):
	return lease

activity B(lease: Lease) -> (Lease):
	return lease

worker ww:
	workflow W
	activity B

worker aw:
	activity A

namespace ns:
	worker ww
		options:
			task_queue: "w{a}{b}"
	worker aw
		options:
			task_queue: "sandbox-{id}"
`
	checkRendered(t, render(Validate(resolvedAllowingErrors(t, src)), ErrExplicitRoutingMismatch, ErrInstanceQueueNoStartTimeout, ErrMissingTaskQueue), []string{
		`hint INSTANCE_QUEUE_NO_START_TIMEOUT 2:5 A : activity A routes to the per-instance queue family "sandbox-{id}" in namespace ns with neither schedule_to_start_timeout nor schedule_to_close_timeout: if instances are short-lived, a task for a vanished instance waits until the calling workflow's own timeout or cancellation`,
		`error EXPLICIT_ROUTING_MISMATCH 5:5 B : activity B has task_queue "nowhere", but no worker on that queue in namespace ns registers it`,
	})
}

// TestEndpointLinkageBySpelling: an endpoint queue compares with placements by
// spelling, so an opaque "q-{a.b}" never fronts the family "q-{x}"; a templated
// endpoint is already a resolve error and is not linked at all.
func TestEndpointLinkageBySpelling(t *testing.T) {
	tests := []struct {
		endpointQ, workerQ string
		want               []string
	}{
		{"q", "q", nil},
		{"q-{a.b}", "q-{x}", []string{`error ENDPOINT_SERVICE_LINKAGE 8:5 Ep : nexus endpoint Ep routes to task queue "q-{a.b}" in namespace ns, but no worker on that queue has service Svc`}},
		{"q-{x}", "q", nil},
	}
	for _, tt := range tests {
		src := `nexus service Svc:
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

namespace ns:
	worker callerWorker
		options:
			task_queue: "wq"
	worker svcWorker
		options:
			task_queue: "` + tt.workerQ + `"
	nexus endpoint Ep
		options:
			task_queue: "` + tt.endpointQ + `"
`
		t.Run(tt.endpointQ+" vs "+tt.workerQ, func(t *testing.T) {
			checkRendered(t, render(Validate(resolvedAllowingErrors(t, src)), routingKinds...), tt.want)
		})
	}
}

// TestInstanceQueueNoStartTimeout: an activity call that names its queue and
// reaches a family hints when nothing bounds its wait for a poller.
func TestInstanceQueueNoStartTimeout(t *testing.T) {
	const hint = `hint INSTANCE_QUEUE_NO_START_TIMEOUT 2:5 A : activity A routes to the per-instance queue family "sandbox-{id}" in namespace ns with neither schedule_to_start_timeout nor schedule_to_close_timeout: if instances are short-lived, a task for a vanished instance waits until the calling workflow's own timeout or cancellation`
	tests := []struct {
		name               string
		callOpts, defaults string
		deploy             string
		want               []string
	}{
		{"unbounded", "", "", "sandbox-{id}", []string{hint}},
		{"schedule_to_start at the call", "schedule_to_start_timeout: 30s", "", "sandbox-{id}", nil},
		{"schedule_to_close at the call", "schedule_to_close_timeout: 30s", "", "sandbox-{id}", nil},
		{"schedule_to_start in default_options", "", "schedule_to_start_timeout: 30s", "sandbox-{id}", nil},
		{"schedule_to_close in default_options", "", "schedule_to_close_timeout: 30s", "sandbox-{id}", nil},
		{"start_to_close does not bound the wait", "start_to_close_timeout: 30s", "heartbeat_timeout: 5s", "sandbox-{id}", []string{hint}},
		{"a static placement is no family", "", "", "sandbox-{lease.id}", nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			src := `workflow W(lease: Lease):
	activity A(lease) -> r
		options:
			task_queue: "sandbox-{lease.id}"
            ` + tt.callOpts + `
	close complete(r)

activity A(lease: Lease) -> (Lease):
	default_options:
		start_to_close_timeout: 5m
        ` + tt.defaults + `
	return lease

worker ww:
	workflow W

worker aw:
	activity A

namespace ns:
	worker ww
		options:
			task_queue: "w"
	worker aw
		options:
			task_queue: "` + tt.deploy + `"
`
			errs := Validate(resolvedAllowingErrors(t, src))
			checkRendered(t, render(errs, ErrInstanceQueueNoStartTimeout, ErrExplicitRoutingMismatch), tt.want)
		})
	}
}

// TestInstanceQueueNoStartTimeoutNamesFirstFamily: the hint names the first
// family placement reached — first caller namespace in sorted order, then
// entry order — skipping a static placement the call also matches; it follows
// the call's routing errors; and it applies to async activity targets.
func TestInstanceQueueNoStartTimeoutNamesFirstFamily(t *testing.T) {
	src := `workflow W(lease: Lease):
	activity A(lease) -> r
		options:
			task_queue: "q-{lease.id}"
	promise p <- activity A(lease)
	await p
	close complete(r)

activity A(lease: Lease) -> (Lease):
	default_options:
		task_queue: "q-{lease.id}"
	return lease

worker ww:
	workflow W

worker aw:
	activity A

namespace c:
	worker ww
		options:
			task_queue: "w"

namespace b:
	worker ww
		options:
			task_queue: "w"
	worker aw
		options:
			task_queue: "q-{y}"

namespace a:
	worker ww
		options:
			task_queue: "w"
	worker aw
		options:
			task_queue: "q-{lease.id}"
	worker aw
		options:
			task_queue: "q-{x}"
`
	const routing = `activity A has task_queue "q-{lease.id}"%s, but no worker polling a queue of that shape in namespace c registers it`
	const hint = `activity A routes to the per-instance queue family "q-{x}" in namespace a with neither schedule_to_start_timeout nor schedule_to_close_timeout: if instances are short-lived, a task for a vanished instance waits until the calling workflow's own timeout or cancellation`
	checkRendered(t, render(Validate(resolvedAllowingErrors(t, src)), ErrExplicitRoutingMismatch, ErrInstanceQueueNoStartTimeout), []string{
		"error EXPLICIT_ROUTING_MISMATCH 2:5 A : " + fmt.Sprintf(routing, ""),
		"hint INSTANCE_QUEUE_NO_START_TIMEOUT 2:5 A : " + hint,
		"error EXPLICIT_ROUTING_MISMATCH 5:5 A : " + fmt.Sprintf(routing, " (from its default_options)"),
		"hint INSTANCE_QUEUE_NO_START_TIMEOUT 5:5 A : " + hint,
	})
}

// TestInstanceQueueNoStartTimeoutActivitiesOnly: a workflow start on a family
// draws no D4 hint (D5 flags the hosting worker instead).
func TestInstanceQueueNoStartTimeoutActivitiesOnly(t *testing.T) {
	src := `workflow W(x: X):
	workflow Child(x)
		options:
			task_queue: "c-{x.id}"
	close complete()

workflow Child(x: X):
	close complete()

worker ww:
	workflow W

worker cw:
	workflow Child

namespace ns:
	worker ww
		options:
			task_queue: "w"
	worker cw
		options:
			task_queue: "c-{id}"
`
	checkRendered(t, render(Validate(resolvedAllowingErrors(t, src)), ErrInstanceQueueNoStartTimeout, ErrExplicitRoutingMismatch), nil)
}

// coherenceTypes declares workers aw (A), aw2 (A) and bw (B) for coherence tests.
const coherenceTypes = `workflow A():
	close complete()

workflow B():
	close complete()

worker aw:
	workflow A

worker aw2:
	workflow A

worker bw:
	workflow B
`

// TestTaskQueueCoherenceByDeployKey: placements sharing a deploy key are one
// family and must register the same types; the message names both spellings
// when they differ. A malformed queue has no key.
func TestTaskQueueCoherenceByDeployKey(t *testing.T) {
	tests := []struct {
		name       string
		namespaces string
		want       []string
	}{
		{
			name: "two spellings of one family",
			namespaces: `
namespace ns:
	worker aw
		options:
			task_queue: "sandbox-{a}"
	worker bw
		options:
			task_queue: "sandbox-{b}"
	worker aw2
		options:
			task_queue: "sandbox-{c}"
`,
			want: []string{
				`error TASK_QUEUE_MISMATCH 20:5 sandbox-{a} ns.twf: workers aw and bw on task queues "sandbox-{a}" and "sandbox-{b}" in namespace ns have different type sets`,
				`warning TASK_QUEUE_IDENTICAL 23:5 sandbox-{a} ns.twf: workers aw and aw2 on task queues "sandbox-{a}" and "sandbox-{c}" in namespace ns have identical type sets (redundant)`,
			},
		},
		{
			name: "one spelling keeps today's message",
			namespaces: `
namespace ns:
	worker aw
		options:
			task_queue: "sandbox-{a}"
	worker aw2
		options:
			task_queue: "sandbox-{a}"
`,
			want: []string{
				`warning TASK_QUEUE_IDENTICAL 20:5 sandbox-{a} ns.twf: workers aw and aw2 on task queue "sandbox-{a}" in namespace ns have identical type sets (redundant)`,
			},
		},
		{
			name: "two bare families share a key",
			namespaces: `
namespace ns:
	worker aw
		options:
			task_queue: "{hostId}"
	worker bw
		options:
			task_queue: "{podId}"
`,
			want: []string{
				`error TASK_QUEUE_MISMATCH 20:5 {hostId} ns.twf: workers aw and bw on task queues "{hostId}" and "{podId}" in namespace ns have different type sets`,
			},
		},
		{
			name: "an opaque queue never shares a family's key",
			namespaces: `
namespace ns:
	worker aw
		options:
			task_queue: "sandbox-{}"
	worker bw
		options:
			task_queue: "sandbox-{a}"
`,
		},
		{
			name: "malformed queues are not compared",
			namespaces: `
namespace ns:
	worker aw
		options:
			task_queue: "s{a}{b}"
	worker bw
		options:
			task_queue: "s{a}{b}"
`,
		},
		{
			name: "groups report in source order",
			namespaces: `
namespace ns:
	worker aw
		options:
			task_queue: "z"
	worker aw
		options:
			task_queue: "y"
	worker bw
		options:
			task_queue: "z"
	worker bw
		options:
			task_queue: "y"
`,
			want: []string{
				`error TASK_QUEUE_MISMATCH 23:5 z ns.twf: workers aw and bw on task queue "z" in namespace ns have different type sets`,
				`error TASK_QUEUE_MISMATCH 26:5 y ns.twf: workers aw and bw on task queue "y" in namespace ns have different type sets`,
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			errs := Validate(resolvedAllowingErrors(t, coherenceTypes+tt.namespaces))
			checkRendered(t, render(errs, ErrTaskQueueMismatch, ErrTaskQueueIdentical), tt.want)
		})
	}
}

// TestTaskQueueOverlap: placements in one namespace with different keys, at
// least one a family, that could name one queue draw a hint at the later
// placement's task_queue, each pair once, in source order.
func TestTaskQueueOverlap(t *testing.T) {
	tests := []struct {
		name   string
		queues []string
		want   []string
	}{
		{"static beside a family", []string{"sandbox-{id}", "sandbox-pool"}, []string{
			`hint TASK_QUEUE_OVERLAP 16:13 ns ns.twf: task_queue "sandbox-pool" of worker w2 and "sandbox-{id}" of worker w1 could name the same queue in namespace ns`,
		}},
		{"a bare family is exempt, first", []string{"{hostId}", "pool-{x}"}, nil},
		{"a bare family is exempt, second", []string{"pool-{x}", "{hostId}"}, nil},
		{"two static queues", []string{"sandbox-pool", "sandbox-x"}, nil},
		{"one key is coherence's", []string{"sandbox-{a}", "sandbox-{b}"}, nil},
		{"disjoint", []string{"sandbox-{a}", "pool"}, nil},
		{"malformed overlaps nothing", []string{"s{a}{b}", "s{x}"}, nil},
		{"pairs in source order", []string{"a-{x}", "b-{y}", "b-z", "a-w"}, []string{
			`hint TASK_QUEUE_OVERLAP 25:13 ns ns.twf: task_queue "b-z" of worker w3 and "b-{y}" of worker w2 could name the same queue in namespace ns`,
			`hint TASK_QUEUE_OVERLAP 28:13 ns ns.twf: task_queue "a-w" of worker w4 and "a-{x}" of worker w1 could name the same queue in namespace ns`,
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var b strings.Builder
			for i := range tt.queues {
				fmt.Fprintf(&b, "worker w%d:\n\tactivity Act\n\n", i+1)
			}
			b.WriteString("namespace ns:\n")
			for i, q := range tt.queues {
				fmt.Fprintf(&b, "\tworker w%d\n\t\toptions:\n\t\t\ttask_queue: %q\n", i+1, q)
			}
			src := "activity Act():\n\treturn x\n\n" + b.String()
			checkRendered(t, render(Validate(resolvedAllowingErrors(t, src)), ErrTaskQueueOverlap), tt.want)
		})
	}
}

// TestTaskQueueOverlapAcrossPackages: two packages declaring namespace prod
// share its queues, so their placements pair; the hint lands in the later
// placement's file.
func TestTaskQueueOverlapAcrossPackages(t *testing.T) {
	errs := Validate(mustMergeNamedAndResolve(t,
		namedSource{"zeta.twf", `package a

activity A():
	return x

worker wa:
	activity A

namespace prod:
	worker wa
		options:
			task_queue: "s-{id}"
`},
		namedSource{"alpha.twf", `package b

activity B():
	return x

worker wb:
	activity B

namespace prod:
	worker wb
		options:
			task_queue: "s-pool"
`},
	))
	checkRendered(t, render(errs, ErrTaskQueueOverlap), []string{
		`hint TASK_QUEUE_OVERLAP 12:13 prod alpha.twf: task_queue "s-pool" of worker wb and "s-{id}" of worker wa could name the same queue in namespace prod`,
	})
}

// TestInstanceFamilyHazards: each family placement reports its hosted
// workflows, its nexus services, and its versioning. Static and malformed
// placements report none.
func TestInstanceFamilyHazards(t *testing.T) {
	src := `nexus service Svc:
	sync Op(x: X) -> (X):
		return x

workflow A():
	close complete()

workflow B():
	close complete()

worker fam:
	workflow B
	workflow A
	nexus service Svc

namespace static:
	worker fam
		options:
			task_queue: "fam"
			versioning: deployment

namespace broken:
	worker fam
		options:
			task_queue: "fam{a}{b}"
			versioning: deployment

namespace ns:
	worker fam
		options:
			task_queue: "fam-{id}"
			versioning: build_id
	worker fam
		options:
			task_queue: "other-{id}"
			versioning: none
	worker fam
		options:
			task_queue: "third-{id}"
			versioning: deployment
`
	const wf = `worker fam hosts workflow A, B on the per-instance queue family %q in namespace ns: if an instance goes away for good, its executions stall until their own timeout; short-lived families should host workflows on a shared queue`
	const svc = `worker fam registers nexus service Svc on the per-instance queue family %q in namespace ns, but a .twf endpoint targets one static queue, so no endpoint in this design reaches it; put the service on a static queue and route on from an async operation's workflow`
	checkRendered(t, render(Validate(resolvedAllowingErrors(t, src)), ErrInstanceFamilyHostsWorkflow, ErrInstanceFamilyHostsNexusService, ErrInstanceFamilyVersioned), []string{
		"warning INSTANCE_FAMILY_HOSTS_NEXUS_SERVICE 29:5 ns ns.twf: " + fmt.Sprintf(svc, "fam-{id}"),
		"hint INSTANCE_FAMILY_HOSTS_WORKFLOW 29:5 ns ns.twf: " + fmt.Sprintf(wf, "fam-{id}"),
		`hint INSTANCE_FAMILY_VERSIONED 32:13 ns ns.twf: worker fam in namespace ns is a per-instance family on "fam-{id}" with versioning: build_id; every new instance queue needs its own versioning API call (off by default, not on Cloud)`,
		"warning INSTANCE_FAMILY_HOSTS_NEXUS_SERVICE 33:5 ns ns.twf: " + fmt.Sprintf(svc, "other-{id}"),
		"hint INSTANCE_FAMILY_HOSTS_WORKFLOW 33:5 ns ns.twf: " + fmt.Sprintf(wf, "other-{id}"),
		"warning INSTANCE_FAMILY_HOSTS_NEXUS_SERVICE 37:5 ns ns.twf: " + fmt.Sprintf(svc, "third-{id}"),
		"hint INSTANCE_FAMILY_HOSTS_WORKFLOW 37:5 ns ns.twf: " + fmt.Sprintf(wf, "third-{id}"),
		`hint INSTANCE_FAMILY_VERSIONED 40:13 ns ns.twf: worker fam in namespace ns is a per-instance family on "third-{id}" with versioning: deployment; a deployment version accepts at most 100 distinct task queues over its life, so new instance queues are refused once that many have registered`,
	})
}
