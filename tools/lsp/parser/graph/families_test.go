package graph

import (
	"fmt"
	"slices"
	"strings"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/parser"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/resolver"
)

// extractAllowingErrors parses, resolves and extracts src, keeping resolve
// errors such as QUEUE_TEMPLATE_MALFORMED that a test means to provoke.
func extractAllowingErrors(t *testing.T, src string) *Graph {
	t.Helper()
	file, parseErrs := parser.ParseFileAll(src)
	if len(parseErrs) > 0 {
		t.Fatalf("parse: %v", parseErrs[0])
	}
	resolver.Resolve(file)
	return Extract(file)
}

// routed renders g's edges of the given kinds and its diagnostics, sorted.
func routed(g *Graph, kinds ...string) []string {
	var out []string
	for _, e := range g.Edges {
		if slices.Contains(kinds, e.Kind) {
			out = append(out, fmt.Sprintf("%s %s -> %s", e.Kind, e.From, e.To))
		}
	}
	for _, d := range g.Diagnostics {
		out = append(out, d.Code+" "+d.Message)
	}
	slices.Sort(out)
	return out
}

func checkRouted(t *testing.T, got, want []string) {
	t.Helper()
	if !slices.Equal(got, want) {
		t.Errorf("edges and diagnostics:\n got  %s\n want %s", strings.Join(got, "\n      "), strings.Join(want, "\n      "))
	}
}

// TestQueuedCallComparators: an explicit call reaches a callee deployment
// whose queue matches it, an implicit call one with its caller's deploy key.
// A malformed caller queue has nothing to inherit and is not re-reported.
func TestQueuedCallComparators(t *testing.T) {
	const (
		caller = "workflow:W/worker:ww/namespace:ns"
		callee = "activity:A/worker:aw/namespace:ns"
	)
	tests := []struct {
		name          string
		callQ, wq, aq string
		want          []string
	}{
		{"explicit shape", `"sandbox-{lease.id}"`, "w", "sandbox-{id}", []string{"activityCall " + caller + " -> " + callee}},
		{"explicit learned", `"{lease.queue}"`, "w", "sandbox-{id}", []string{"activityCall " + caller + " -> " + callee}},
		{"explicit spelling of an opaque queue", `"q-{a.b}"`, "w", "q-{a.b}", []string{"activityCall " + caller + " -> " + callee}},
		{"explicit to a malformed queue", `"s{a}{b}"`, "w", "s{a}{b}", []string{
			`DISPATCH_NO_REACHABLE_DEPLOYMENT activity call to "A" routes to task_queue "s{a}{b}" in namespace ns but no deployment polls it there`,
		}},
		{"explicit from a malformed caller", `"sandbox-{lease.id}"`, "w{a}{b}", "sandbox-{id}", []string{"activityCall " + caller + " -> " + callee}},
		{"implicit by deploy key", "", "s-{a}", "s-{b}", []string{"activityCall " + caller + " -> " + callee}},
		{"implicit bare caller is not a learned call", "", "{hostId}", "x-{y}", []string{
			`DISPATCH_NO_REACHABLE_DEPLOYMENT activity call to "A" routes to task_queue "{hostId}" in namespace ns but no deployment polls it there`,
		}},
		{"implicit from a malformed caller", "", "s{a}{b}", "s{a}{b}", nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			opts := ""
			if tt.callQ != "" {
				opts = "\n        options:\n            task_queue: " + tt.callQ
			}
			src := `workflow W(lease: Lease):
    activity A(lease) -> r` + opts + `
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
            task_queue: "` + tt.wq + `"
    worker aw
        options:
            task_queue: "` + tt.aq + `"
`
			checkRouted(t, routed(extractAllowingErrors(t, src), EdgeActivityCall), tt.want)
		})
	}
}

// TestDefaultOptionsTaskQueue: a call without its own task_queue routes by its
// target's default_options task_queue (spec 06 § Definition Default Options),
// and routing.explicit carries that literal. An async target has no call-site
// options, so default_options is its only way to name a queue.
func TestDefaultOptionsTaskQueue(t *testing.T) {
	src := `workflow W(x: X):
    activity A(x) -> r
    promise p <- activity A(x)
    await p -> s
    close complete(r)

activity A(x: X) -> (X):
    default_options:
        task_queue: "payments"
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
            task_queue: "payments"
`
	g := extractAllowingErrors(t, src)
	edge := "activityCall workflow:W/worker:ww/namespace:ns -> activity:A/worker:aw/namespace:ns"
	checkRouted(t, routed(g, EdgeActivityCall), []string{edge, edge})
	for _, e := range g.Edges {
		if e.Kind == EdgeActivityCall && e.Routing.Explicit != "payments" {
			t.Errorf("line %d: routing.explicit %q, want %q", e.Line, e.Routing.Explicit, "payments")
		}
	}
}

// TestAsyncBackingByDeployKey: an async operation's backing workflow starts on
// the operation's own queue, so it must share the deploy key. A malformed
// operation queue hosts nothing and is not re-reported.
func TestAsyncBackingByDeployKey(t *testing.T) {
	tests := []struct {
		name, svcQ, wfQ string
		want            []string
	}{
		{"same key", "s-{a}", "s-{b}", []string{
			"asyncBacking nexusOperation:Svc.Op/worker:sw/namespace:ns -> workflow:Backing/worker:bw/namespace:ns",
		}},
		{"different key", "{hostId}", "s-{b}", []string{
			`DISPATCH_NO_REACHABLE_DEPLOYMENT workflow call to "Backing" routes to task_queue "{hostId}" in namespace ns but no deployment polls it there`,
		}},
		{"malformed", "s{a}{b}", "s{a}{b}", nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			src := `nexus service Svc:
    async Op workflow Backing

workflow Backing():
    close complete()

worker sw:
    nexus service Svc

worker bw:
    workflow Backing

namespace ns:
    worker sw
        options:
            task_queue: "` + tt.svcQ + `"
    worker bw
        options:
            task_queue: "` + tt.wfQ + `"
`
			checkRouted(t, routed(extractAllowingErrors(t, src), EdgeAsyncBacking), tt.want)
		})
	}
}

// TestTemplatedEndpointRoutesNowhere: an endpoint whose task_queue has a
// parameter is already a resolve error. A call through it draws no edge and no
// diagnostic, and it fronts no operation, even one on that spelling; a static
// endpoint compares by spelling.
func TestTemplatedEndpointRoutesNowhere(t *testing.T) {
	const (
		call  = "nexusCall workflow:W/worker:ww/namespace:ns -> nexusOperation:Svc.Op/worker:sw/namespace:ns"
		route = "nexusRoute nexusOperation:Svc.Op/worker:sw/namespace:ns -> nexusEndpoint:Ep/namespace:ns"
	)
	tests := []struct {
		name, epQ, svcQ string
		want            []string
	}{
		{"static", "q", "q", []string{call, route}},
		{"templated on the family's spelling", "q-{x}", "q-{x}", nil},
		{"opaque endpoint against a family", "q-{a.b}", "q-{x}", []string{
			`DISPATCH_NO_REACHABLE_DEPLOYMENT nexusOperation call to "Svc.Op" routes to task_queue "q-{a.b}" in namespace ns but no deployment polls it there`,
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			src := `nexus service Svc:
    sync Op(x: X) -> (X):
        return x

workflow W(x: X):
    nexus Ep Svc.Op(x) -> r
    close complete(r)

worker ww:
    workflow W

worker sw:
    nexus service Svc

namespace ns:
    worker ww
        options:
            task_queue: "w"
    worker sw
        options:
            task_queue: "` + tt.svcQ + `"
    nexus endpoint Ep
        options:
            task_queue: "` + tt.epQ + `"
`
			checkRouted(t, routed(extractAllowingErrors(t, src), EdgeNexusCall, EdgeNexusRoute), tt.want)
		})
	}
}

// TestWorkerNodeTemplateParams: a worker node carries its instantiation's
// instance parameters; one worker instantiated twice in a namespace is one
// node that keeps the first queue and unions the parameters.
func TestWorkerNodeTemplateParams(t *testing.T) {
	src := `activity A():
    return x

worker sidecar:
    activity A

worker control:
    activity A

namespace tenant-{org}:
    worker sidecar
        options:
            task_queue: "a-{x}"
    worker sidecar
        options:
            task_queue: "b-{y}-{x}"
    worker control
        options:
            task_queue: "control"
`
	g := extractAllowingErrors(t, src)
	tests := []struct {
		id     string
		queue  string
		params []string
	}{
		{"worker:sidecar/namespace:tenant-{org}", "a-{x}", []string{"x", "y"}},
		{"worker:control/namespace:tenant-{org}", "control", nil},
		{"namespace:tenant-{org}", "", []string{"org"}},
		{"activity:A/worker:sidecar/namespace:tenant-{org}", "", nil},
	}
	for _, tt := range tests {
		n := g.node(tt.id)
		if n == nil {
			t.Errorf("no node %s", tt.id)
			continue
		}
		if n.Queue != tt.queue || !slices.Equal(n.TemplateParams, tt.params) {
			t.Errorf("%s: queue %q, templateParams %v; want %q, %v", tt.id, n.Queue, n.TemplateParams, tt.queue, tt.params)
		}
	}
}

// TestDoubleInstantiationContainment: a worker instantiated twice in one
// namespace is one node, so its containment edges and those of what it hosts
// are emitted once.
func TestDoubleInstantiationContainment(t *testing.T) {
	src := `activity A():
    return x

nexus service S:
    sync Op(x: X) -> (X):
        return x

worker fam:
    activity A
    nexus service S

namespace n:
    worker fam
        options:
            task_queue: "tools"
    worker fam
        options:
            task_queue: "tools-{id}"
`
	checkRouted(t, routed(extractAllowingErrors(t, src), EdgeContainment), []string{
		"containment activity:A/worker:fam/namespace:n -> worker:fam/namespace:n",
		"containment nexusOperation:S.Op/worker:fam/namespace:n -> nexusService:S/worker:fam/namespace:n",
		"containment nexusService:S/worker:fam/namespace:n -> worker:fam/namespace:n",
		"containment worker:fam/namespace:n -> namespace:n",
	})
}
