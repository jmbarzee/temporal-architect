package graph

import (
	"fmt"
	"slices"
	"strings"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
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
				opts = "\n\t\toptions:\n\t\t\ttask_queue: " + tt.callQ
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

// dispatched renders g's dispatch and nexusRoute edges with line and routing,
// its unresolved entries and its coarsened edges with weight, sorted, so a
// repeated edge shows as a repeated line.
func dispatched(g *Graph) []string {
	var out []string
	for _, e := range g.Edges {
		if e.Kind == EdgeContainment {
			continue
		}
		s := fmt.Sprintf("%s %s -> %s @%d", e.Kind, e.From, e.To, e.Line)
		if e.Routing != nil {
			s += fmt.Sprintf(" %+v", *e.Routing)
		}
		out = append(out, s)
	}
	for _, u := range g.Unresolved {
		out = append(out, fmt.Sprintf("unresolved %s %s %s @%d", u.Kind, u.From, u.Name, u.Line))
	}
	for _, c := range g.CoarsenedEdges {
		out = append(out, fmt.Sprintf("coarsened %s %s -> %s x%d", c.Tier, c.From, c.To, c.Weight))
	}
	slices.Sort(out)
	return out
}

// TestDoubleInstantiationDispatch: a worker instantiated twice in one
// namespace is one node, so a call both instantiations route to one callee is
// one edge, of every dispatch kind, counted once in the coarsened weight; an
// unresolved call is one entry.
func TestDoubleInstantiationDispatch(t *testing.T) {
	src := `workflow W(x: X):
	activity A(x) -> r
		options:
			task_queue: "acts"
	workflow C(x) -> c
	nexus Ep S.Sync(x) -> n
	promise p <- workflow T(x)
	signal p.Go(x)
	activity Missing(x)
	close complete(r)

activity A(x: X) -> (X):
	return x

workflow C(x: X):
	close complete(x)

workflow T(x: X):
	signal Go(y: X):
		go = true
	close complete(x)

workflow B():
	close complete()

nexus service S:
	sync Sync(x: X) -> (X):
		workflow C(x) -> r
			options:
				task_queue: "tools"
		close complete(r)
	async Async workflow B
	async Lost workflow Nope

worker fam:
	workflow W
	workflow C
	workflow T
	workflow B
	nexus service S

worker aw:
	activity A

namespace n:
	worker fam
		options:
			task_queue: "tools"
	worker fam
		options:
			task_queue: "tools-{id}"
	worker aw
		options:
			task_queue: "acts"
	nexus endpoint Ep
		options:
			task_queue: "tools"
`
	const (
		w   = "workflow:W/worker:fam/namespace:n"
		a   = "activity:A/worker:aw/namespace:n"
		ep  = "nexusEndpoint:Ep/namespace:n"
		op  = "nexusOperation:S."
		fam = "/worker:fam/namespace:n"
	)
	checkRouted(t, dispatched(extractAllowingErrors(t, src)), []string{
		"activityCall " + w + " -> " + a + " @2 {Explicit:acts NexusEndpoint:}",
		"asyncBacking " + op + "Async" + fam + " -> workflow:B" + fam + " @32 {Explicit: NexusEndpoint:}",
		"coarsened worker worker:fam/namespace:n -> worker:aw/namespace:n x1",
		"nexusCall " + w + " -> " + op + "Sync" + fam + " @6 {Explicit: NexusEndpoint:" + ep + "}",
		"nexusRoute " + op + "Async" + fam + " -> " + ep + " @55",
		"nexusRoute " + op + "Lost" + fam + " -> " + ep + " @55",
		"nexusRoute " + op + "Sync" + fam + " -> " + ep + " @55",
		"signalSend " + w + " -> workflow:T" + fam + " @8 {Explicit: NexusEndpoint:}",
		"unresolved activityCall " + w + " Missing @9",
		"unresolved asyncBacking " + op + "Lost" + fam + " Nope @33",
		"workflowCall " + op + "Sync" + fam + " -> workflow:C" + fam + " @28 {Explicit:tools NexusEndpoint:}",
		"workflowCall " + w + " -> workflow:C" + fam + " @5 {Explicit: NexusEndpoint:}",
		"workflowCall " + w + " -> workflow:T" + fam + " @7 {Explicit: NexusEndpoint:}",
	})

	// Both instantiations on the endpoint's queue: one nexusRoute edge.
	src = `nexus service S:
	sync Sync(x: X) -> (X):
		return x

worker fam:
	nexus service S

namespace n:
	worker fam
		options:
			task_queue: "tools"
	worker fam
		options:
			task_queue: "tools"
	nexus endpoint Ep
		options:
			task_queue: "tools"
`
	checkRouted(t, dispatched(extractAllowingErrors(t, src)), []string{
		"nexusRoute " + op + "Sync" + fam + " -> " + ep + " @15",
	})
}

// TestDoubleInstantiationDistinctCallees: when a worker's two instantiations in
// one namespace route a call to different callees, each edge is kept, and so
// is each of a worker's edges in different namespaces.
func TestDoubleInstantiationDistinctCallees(t *testing.T) {
	t.Run("one namespace", func(t *testing.T) {
		src := `workflow W(x: X):
	activity A(x) -> r
	workflow C(x) -> c
	close complete(r)

activity A(x: X) -> (X):
	return x

workflow C(x: X):
	close complete(x)

workflow B():
	close complete()

nexus service S:
	sync Sync(x: X) -> (X):
		workflow C(x) -> r
		close complete(r)
	async Async workflow B

worker fam:
	workflow W
	nexus service S

worker callee:
	activity A
	workflow C
	workflow B

worker other:
	activity A
	workflow C
	workflow B

namespace n:
	worker fam
		options:
			task_queue: "a-{id}"
	worker fam
		options:
			task_queue: "b-{id}"
	worker callee
		options:
			task_queue: "a-{key}"
	worker other
		options:
			task_queue: "b-{key}"
`
		const (
			w    = "workflow:W/worker:fam/namespace:n"
			sync = "nexusOperation:S.Sync/worker:fam/namespace:n"
			back = "nexusOperation:S.Async/worker:fam/namespace:n"
		)
		var want []string
		for _, to := range []string{"callee", "other"} {
			at := "/worker:" + to + "/namespace:n"
			want = append(want,
				"activityCall "+w+" -> activity:A"+at+" @2 {Explicit: NexusEndpoint:}",
				"asyncBacking "+back+" -> workflow:B"+at+" @19 {Explicit: NexusEndpoint:}",
				"coarsened worker worker:fam/namespace:n -> worker:"+to+"/namespace:n x4",
				"workflowCall "+sync+" -> workflow:C"+at+" @17 {Explicit: NexusEndpoint:}",
				"workflowCall "+w+" -> workflow:C"+at+" @3 {Explicit: NexusEndpoint:}",
			)
		}
		slices.Sort(want)
		checkRouted(t, dispatched(extractAllowingErrors(t, src)), want)
	})

	t.Run("two namespaces", func(t *testing.T) {
		src := `workflow W(x: X):
	activity A(x) -> r
		options:
			task_queue: "acts"
	close complete(r)

activity A(x: X) -> (X):
	return x

worker fam:
	workflow W

worker aw:
	activity A

namespace n1:
	worker fam
		options:
			task_queue: "tools"
	worker fam
		options:
			task_queue: "tools-{id}"
	worker aw
		options:
			task_queue: "acts"

namespace n2:
	worker fam
		options:
			task_queue: "tools"
	worker aw
		options:
			task_queue: "acts"
`
		var want []string
		for _, ns := range []string{"n1", "n2"} {
			at := "/namespace:" + ns
			want = append(want,
				"activityCall workflow:W/worker:fam"+at+" -> activity:A/worker:aw"+at+" @2 {Explicit:acts NexusEndpoint:}",
				"coarsened worker worker:fam"+at+" -> worker:aw"+at+" x1",
			)
		}
		slices.Sort(want)
		checkRouted(t, dispatched(extractAllowingErrors(t, src)), want)
	})
}

// TestDuplicateEndpointFirstDeclaration: an endpoint name declared in several
// namespaces (DUPLICATE_ENDPOINT) is the first declaration's, as the resolver
// binds it: one endpoint node and its containment, and calls and routes
// through it, on every run.
func TestDuplicateEndpointFirstDeclaration(t *testing.T) {
	src := `nexus service S:
	sync Op(x: X) -> (X):
		return x

workflow W(x: X):
	nexus e S.Op(x) -> r
	close complete(r)

worker ww:
	workflow W

worker sw:
	nexus service S
`
	for _, ns := range []string{"nc", "na", "nb"} {
		src += `
namespace ` + ns + `:
	worker ww
		options:
			task_queue: "w"
	worker sw
		options:
			task_queue: "q"
	nexus endpoint e
		options:
			task_queue: "q"
`
	}
	const (
		ep = "nexusEndpoint:e/namespace:nc"
		op = "nexusOperation:S.Op/worker:sw/namespace:nc"
	)
	want := []string{
		"containment " + ep + " -> namespace:nc",
		"nexusCall workflow:W/worker:ww/namespace:na -> " + op,
		"nexusCall workflow:W/worker:ww/namespace:nb -> " + op,
		"nexusCall workflow:W/worker:ww/namespace:nc -> " + op,
		"nexusRoute " + op + " -> " + ep,
	}
	for range 50 {
		g := extractAllowingErrors(t, src)
		var got []string
		for _, r := range routed(g, EdgeContainment, EdgeNexusCall, EdgeNexusRoute) {
			if !strings.HasPrefix(r, EdgeContainment) || strings.HasPrefix(r, "containment nexusEndpoint:") {
				got = append(got, r)
			}
		}
		if slices.Equal(got, want) && len(nodesOfKind(g, KindNexusEndpoint)) == 1 && findNode(g, ep) != nil {
			continue
		}
		t.Fatalf("got %s\nendpoint nodes %v", strings.Join(got, "\n    "), nodesOfKind(g, KindNexusEndpoint))
	}
}

// nodesOfKind returns the IDs of g's nodes of the given kind.
func nodesOfKind(g *Graph, kind string) []string {
	var ids []string
	for _, n := range g.Nodes {
		if defKindOf(n.Definition) == kind {
			ids = append(ids, n.ID)
		}
	}
	return ids
}

// TestDuplicateFirstDeclaration: a workflow, nexus service, worker or
// namespace declared twice in one package is its first declaration, as the
// resolver keeps it: the graph draws the first workflow's calls, the first
// service's operations, the first worker's registrations, and the first
// namespace's worker queue and endpoints. Repeated so map order cannot pass by
// luck.
func TestDuplicateFirstDeclaration(t *testing.T) {
	src := `workflow W(x: X):
	activity A(x) -> r
	close complete(r)

workflow W(x: X):
	activity B(x) -> r
	close complete(r)

activity A(x: X) -> (X):
	return x

activity B(x: X) -> (X):
	return x

nexus service S:
	sync First() -> ():
		close complete()

nexus service S:
	sync Second() -> ():
		close complete()

worker w:
	workflow W
	activity A
	activity B
	nexus service S

worker w:
	workflow W

namespace n:
	worker w
		options:
			task_queue: "a"
	nexus endpoint e1
		options:
			task_queue: "a"

namespace n:
	worker w
		options:
			task_queue: "b"
	nexus endpoint e2
		options:
			task_queue: "b"
`
	const at = "/worker:w/namespace:n"
	want := []string{
		"activityCall workflow:W" + at + " -> activity:A" + at,
		"nexusRoute nexusOperation:S.First" + at + " -> nexusEndpoint:e1/namespace:n",
		"node activity:A" + at,
		"node activity:B" + at,
		"node nexusEndpoint:e1/namespace:n",
		"node nexusOperation:S.First" + at,
		"node worker:w/namespace:n a",
	}
	for range 50 {
		g := extractAllowingErrors(t, src)
		got := routed(g, EdgeActivityCall, EdgeNexusRoute)
		for _, n := range g.Nodes {
			switch defKindOf(n.Definition) {
			case KindActivity, KindNexusEndpoint, KindNexusOperation:
				got = append(got, "node "+n.ID)
			case KindWorker:
				got = append(got, "node "+n.ID+" "+n.Queue)
			}
		}
		slices.Sort(got)
		if !slices.Equal(got, want) {
			checkRouted(t, got, want)
			return
		}
	}
}

// TestDuplicateDeclarationFirst: a signal or update declared twice in one
// workflow, or an operation twice in one nexus service, is its first
// declaration, as the resolver keeps it: the graph draws the first handler's
// calls, and the first operation's, a sync one whose later namesake is async,
// with one node and one containment edge, at the first's line.
func TestDuplicateDeclarationFirst(t *testing.T) {
	src := `workflow W(x: X):
	signal Ping():
		activity A(x)
	signal Ping(y: Y):
		activity B(y)
	update Bump() -> (R):
		activity A(x) -> r
		return r
	update Bump() -> (R):
		activity B(x) -> r
		return r
	close complete()

workflow V():
	close complete()

activity A(x: X):
	return

activity B(x: X):
	return

nexus service S:
	sync Op(x: X) -> ():
		workflow V()
		close complete()
	async Op workflow V

worker w:
	workflow W
	workflow V
	activity A
	activity B
	nexus service S

namespace n:
	worker w
		options:
			task_queue: "q"
`
	const at = "/worker:w/namespace:n"
	want := []string{
		"activityCall workflow:W" + at + " -> activity:A" + at, // the signal's
		"activityCall workflow:W" + at + " -> activity:A" + at, // the update's
		"workflowCall nexusOperation:S.Op" + at + " -> workflow:V" + at,
		"containment nexusOperation:S.Op" + at + " line 24",
		"node nexusOperation:S.Op" + at,
	}
	g := extractAllowingErrors(t, src)
	got := routed(g, EdgeActivityCall, EdgeWorkflowCall, EdgeAsyncBacking)
	for _, e := range g.Edges {
		if e.Kind == EdgeContainment && strings.HasPrefix(e.From, KindNexusOperation+":") {
			got = append(got, fmt.Sprintf("containment %s line %d", e.From, e.Line))
		}
	}
	for _, n := range g.Nodes {
		if defKindOf(n.Definition) == KindNexusOperation {
			got = append(got, "node "+n.ID)
		}
	}
	checkRouted(t, got, want)
}

// TestDuplicateEndpointResolverBinding: the graph draws the endpoint the
// resolver binds, among the namespaces it keeps by (package, name): the first
// across packages, and a same-package namespace declared twice keeps its first
// definition.
func TestDuplicateEndpointResolverBinding(t *testing.T) {
	ns := func(pkg, queue string) string {
		return "package " + pkg + `

namespace n:
	nexus endpoint e
		options:
			task_queue: "` + queue + `"
`
	}
	const caller = `package p1

workflow W():
	nexus e S.Op()
	close complete()
`
	tests := []struct {
		name, pkgB, want string
	}{
		{"two packages", "p2", "qa"},
		{"one package", "p1", "qa"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			for range 50 {
				var inputs []ast.StampInput
				for _, src := range []string{caller, ns("p1", "qa"), ns(tt.pkgB, "qb")} {
					file, errs := parser.ParseFileAll(src)
					if len(errs) > 0 {
						t.Fatalf("parse: %v", errs[0])
					}
					inputs = append(inputs, ast.StampInput{File: file})
				}
				file := ast.Stamp(inputs)
				resolver.Resolve(file)
				bound := file.Definitions[0].(*ast.WorkflowDef).Body[0].(*ast.NexusCall).Endpoint.Resolved
				node := findNode(Extract(file), "nexusEndpoint:e/namespace:n")
				if bound == nil || bound.TaskQueue != tt.want || node == nil || node.Queue != tt.want {
					t.Fatalf("resolver bound %+v, graph drew %+v; want queue %s", bound, node, tt.want)
				}
			}
		})
	}
}

// TestCalleeLabelLongestService: an unreachable operation is named by its own
// service, the longest qualified name its own extends, though a service `p`
// in the default package prefixes `p.S` and `p.Svc`, and `p.S` prefixes
// `p.Svc` but for the separator. The second package named p puts the identity
// in the label, so a wrong service shows. Repeated so map order cannot pass by
// luck.
func TestCalleeLabelLongestService(t *testing.T) {
	pkgP := `package p

nexus service S:
	sync Op() -> ():
		close complete()

nexus service Svc:
	sync Op() -> ():
		close complete()

workflow W():
	nexus e S.Op()
	nexus e Svc.Op()
	close complete()

worker w:
	workflow W

namespace n:
	worker w
		options:
			task_queue: "w"
	nexus endpoint e
		options:
			task_queue: "nobody"
`
	defaultP := `nexus service p:
	sync Run() -> ():
		close complete()
`
	otherP := `package p

workflow X():
	close complete()
`
	unreachable := func(op string) string {
		return fmt.Sprintf(`DISPATCH_NO_REACHABLE_DEPLOYMENT nexusOperation call to %q routes to task_queue "nobody" in namespace n but no deployment polls it there`, op)
	}
	want := []string{unreachable("p.S.Op (p)"), unreachable("p.Svc.Op (p)")}
	for range 50 {
		var inputs []ast.StampInput
		for _, in := range []struct{ src, module string }{{pkgP, ""}, {defaultP, ""}, {otherP, "acme"}} {
			file, errs := parser.ParseFileAll(in.src)
			if len(errs) > 0 {
				t.Fatalf("parse: %v", errs[0])
			}
			inputs = append(inputs, ast.StampInput{File: file, Module: in.module, Dir: "p"})
		}
		file := ast.Stamp(inputs)
		resolver.Resolve(file)
		if got := routed(Extract(file)); !slices.Equal(got, want) {
			checkRouted(t, got, want)
			return
		}
	}
}
