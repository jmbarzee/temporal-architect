//go:build integration

package integration

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"

	"go.temporal.io/api/workflowservice/v1"
	"go.temporal.io/sdk/client"
	"go.temporal.io/sdk/testsuite"
	"go.temporal.io/sdk/worker"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/history"
	"github.com/jmbarzee/temporal-architect/tools/sampler/sampling"
)

// This file is the suite framework: the Case model, the Expect vocabulary and
// its matchers, and runCase (the per-case dev server + sample + build loop).
// Workflow/activity fixtures and the cases that use them live in the
// cases_*_test.go files, grouped by the graph feature they exercise.

// defaultNamespace is the namespace every dev server provisions automatically;
// most cases run entirely within it.
const defaultNamespace = "default"

// ---------------------------------------------------------------------------
// Case model
// ---------------------------------------------------------------------------

// Case is one suite scenario. It spans one or more namespaces (one for most
// tests today; multiple for cross-namespace coverage).
type Case struct {
	Name       string
	Namespaces []NamespaceSet
	Expect     Expect
}

// NamespaceSet describes the workers and executions to run in one namespace.
type NamespaceSet struct {
	Name    string
	Workers []WorkerSpec
	Starts  []StartSpec
	// ExpectedVisible overrides how many executions to wait for in Visibility
	// before sampling. Defaults to len(Starts); set it higher when child
	// workflows started elsewhere land in this namespace and must be sampled, or
	// when this namespace receives children but launches no Starts of its own.
	ExpectedVisible int
}

// WorkerSpec registers workflows/activities on one task queue (which becomes
// one synthesized graph worker named after the queue).
type WorkerSpec struct {
	TaskQueue string
	Register  func(w worker.Worker)
}

// StartSpec is one workflow execution to launch and wait on.
type StartSpec struct {
	ID        string
	TaskQueue string
	Workflow  interface{}
	Args      []interface{}
	// ExpectError drives a deliberately failing execution: run.Get is expected
	// to return an error, and the harness fails if it succeeds. history.Build
	// still reconstructs the edges observed before the failure.
	ExpectError bool
}

// starts expands a list of argument-sets into sequential StartSpecs for one
// workflow type on one queue, IDs "<prefix>-<i>". It cuts the boilerplate of
// driving many executions of a single type with varied inputs.
func starts(prefix, tq string, wf interface{}, argSets ...[]interface{}) []StartSpec {
	out := make([]StartSpec, 0, len(argSets))
	for i, args := range argSets {
		out = append(out, StartSpec{
			ID:        fmt.Sprintf("%s-%d", prefix, i),
			TaskQueue: tq,
			Workflow:  wf,
			Args:      args,
		})
	}
	return out
}

// argN repeats an argument-set n times — handy for skewed distributions where
// most executions take one branch.
func argN(n int, args ...interface{}) [][]interface{} {
	out := make([][]interface{}, 0, n)
	for i := 0; i < n; i++ {
		out = append(out, args)
	}
	return out
}

// ---------------------------------------------------------------------------
// Expect vocabulary
// ---------------------------------------------------------------------------

// ExpectNode / ExpectEdge use the graph vocabulary, matched existentially
// against the built graph (node.Definition / edge.Kind), not raw IDs.
type ExpectNode struct {
	Kind string // graph.KindWorkflow / KindActivity / KindWorker / KindNamespace / KindNexus*
	Name string
}

type ExpectEdge struct {
	From ExpectNode
	To   ExpectNode
	Kind string // graph.EdgeActivityCall / EdgeWorkflowCall / EdgeContainment / ...
}

// EdgeCount asserts an exact number of distinct edges matching a shape —
// the dedup contract (one edge despite N schedules) needs this; existential
// presence alone can't catch over-emission.
type EdgeCount struct {
	Edge ExpectEdge
	Want int
}

// NodeCount asserts an exact number of nodes sharing one definition. A single
// definition deployed under two workers/namespaces legitimately yields two
// nodes (same Definition, distinct IDs), so this counts by definition key.
type NodeCount struct {
	Node ExpectNode
	Want int
}

// ExpectCoarsened matches a tier-projected dispatch edge in g.CoarsenedEdges.
// From/To are given by definition (worker:queue or namespace:ns); the matcher
// resolves them to the node IDs the coarsened edge actually carries.
type ExpectCoarsened struct {
	From ExpectNode // {KindWorker, queue} or {KindNamespace, ns}
	To   ExpectNode
	Tier string // graph.TierWorker / graph.TierNamespace
}

// ExpectUnresolved matches an entry in g.Unresolved — a call site whose callee
// wasn't in the sample (e.g. a signalSend to a workflow that was never started).
type ExpectUnresolved struct {
	From ExpectNode // caller node
	Name string     // unresolved target (workflow ID for signalSend)
	Kind string     // graph.EdgeSignalSend / ...
}

type Expect struct {
	// Existential presence — drives sample expansion until satisfied.
	Nodes      []ExpectNode
	Edges      []ExpectEdge
	Coarsened  []ExpectCoarsened
	Unresolved []ExpectUnresolved
	MinNodes   int
	MinEdges   int

	// Bounded / negative / exact constraints. These are only meaningful once
	// the sample can no longer grow (an absent edge or an exact count could
	// still change on a wider sample), so satisfied() defers them to the final
	// 100% step.
	AbsentNodes []ExpectNode // must NOT be present
	AbsentEdges []ExpectEdge // must NOT be present
	MaxNodes    int          // 0 = unbounded
	MaxEdges    int          // 0 = unbounded
	EdgeCounts  []EdgeCount  // exact count for an edge shape
	NodeCounts  []NodeCount  // exact count for a node definition
}

// ---------------------------------------------------------------------------
// Matchers
// ---------------------------------------------------------------------------

func nodePresent(g *graph.Graph, en ExpectNode) bool {
	def := graph.DefKey(en.Kind, en.Name)
	for _, n := range g.Nodes {
		if n.Definition == def {
			return true
		}
	}
	return false
}

func edgePresent(g *graph.Graph, ee ExpectEdge) bool {
	return edgeCount(g, ee) > 0
}

// nodeCount counts nodes sharing one definition key (kind:name). Distinct
// deployment IDs collapse to one definition — except the two-queues rule, where
// one definition legitimately spans two worker parents (two IDs, one
// definition), which is exactly what this counts.
func nodeCount(g *graph.Graph, en ExpectNode) int {
	def := graph.DefKey(en.Kind, en.Name)
	count := 0
	for _, n := range g.Nodes {
		if n.Definition == def {
			count++
		}
	}
	return count
}

// edgeCount counts distinct edges matching an edge shape (kind + from/to
// definition). Multiple node IDs can share a definition; any edge whose
// endpoints map to the from/to definitions and whose kind matches is counted.
func edgeCount(g *graph.Graph, ee ExpectEdge) int {
	fromIDs := idsByDef(g, ee.From)
	toIDs := idsByDef(g, ee.To)
	count := 0
	for _, e := range g.Edges {
		if e.Kind == ee.Kind && fromIDs[e.From] && toIDs[e.To] {
			count++
		}
	}
	return count
}

// idsByDef maps a node definition key to the set of node IDs carrying it.
func idsByDef(g *graph.Graph, en ExpectNode) map[string]bool {
	def := graph.DefKey(en.Kind, en.Name)
	ids := map[string]bool{}
	for _, n := range g.Nodes {
		if n.Definition == def {
			ids[n.ID] = true
		}
	}
	return ids
}

// coarsenedPresent reports whether a coarsened (tier-projected) edge matching
// the expectation exists.
func coarsenedPresent(g *graph.Graph, ec ExpectCoarsened) bool {
	fromIDs := idsByDef(g, ec.From)
	toIDs := idsByDef(g, ec.To)
	for _, ce := range g.CoarsenedEdges {
		if ce.Tier == ec.Tier && fromIDs[ce.From] && toIDs[ce.To] {
			return true
		}
	}
	return false
}

// unresolvedPresent reports whether an unresolved call-site entry matching the
// expectation exists.
func unresolvedPresent(g *graph.Graph, eu ExpectUnresolved) bool {
	fromIDs := idsByDef(g, eu.From)
	for _, u := range g.Unresolved {
		if u.Kind == eu.Kind && u.Name == eu.Name && fromIDs[u.From] {
			return true
		}
	}
	return false
}

// hasBoundedConstraints reports whether the expectation carries any
// negative / exact / max constraint that must be evaluated at full sample.
func (e Expect) hasBoundedConstraints() bool {
	return len(e.AbsentNodes) > 0 || len(e.AbsentEdges) > 0 ||
		e.MaxNodes > 0 || e.MaxEdges > 0 ||
		len(e.EdgeCounts) > 0 || len(e.NodeCounts) > 0
}

// checkBounded evaluates the negative / exact / max constraints, returning a
// list of violations. Only meaningful against the full (100%) sample.
func (e Expect) checkBounded(g *graph.Graph) []string {
	var missing []string
	for _, n := range e.AbsentNodes {
		if nodePresent(g, n) {
			missing = append(missing, fmt.Sprintf("unexpected node %s:%s", n.Kind, n.Name))
		}
	}
	for _, ed := range e.AbsentEdges {
		if edgePresent(g, ed) {
			missing = append(missing, fmt.Sprintf("unexpected edge %s:%s -%s-> %s:%s",
				ed.From.Kind, ed.From.Name, ed.Kind, ed.To.Kind, ed.To.Name))
		}
	}
	if e.MaxNodes > 0 && len(g.Nodes) > e.MaxNodes {
		missing = append(missing, fmt.Sprintf("nodes<=%d (got %d)", e.MaxNodes, len(g.Nodes)))
	}
	if e.MaxEdges > 0 && len(g.Edges) > e.MaxEdges {
		missing = append(missing, fmt.Sprintf("edges<=%d (got %d)", e.MaxEdges, len(g.Edges)))
	}
	for _, ec := range e.EdgeCounts {
		if got := edgeCount(g, ec.Edge); got != ec.Want {
			missing = append(missing, fmt.Sprintf("edge %s:%s -%s-> %s:%s count=%d (got %d)",
				ec.Edge.From.Kind, ec.Edge.From.Name, ec.Edge.Kind,
				ec.Edge.To.Kind, ec.Edge.To.Name, ec.Want, got))
		}
	}
	for _, nc := range e.NodeCounts {
		if got := nodeCount(g, nc.Node); got != nc.Want {
			missing = append(missing, fmt.Sprintf("node %s:%s count=%d (got %d)",
				nc.Node.Kind, nc.Node.Name, nc.Want, got))
		}
	}
	return missing
}

// satisfied reports whether every expectation holds, returning a human-readable
// list of what's missing otherwise. final marks the last (100%) sample step:
// negative / exact / max constraints are evaluated only then, since a narrower
// sample could satisfy them by accident.
func satisfied(g *graph.Graph, e Expect, final bool) (bool, string) {
	var missing []string
	for _, n := range e.Nodes {
		if !nodePresent(g, n) {
			missing = append(missing, fmt.Sprintf("node %s:%s", n.Kind, n.Name))
		}
	}
	for _, ed := range e.Edges {
		if !edgePresent(g, ed) {
			missing = append(missing, fmt.Sprintf("edge %s:%s -%s-> %s:%s",
				ed.From.Kind, ed.From.Name, ed.Kind, ed.To.Kind, ed.To.Name))
		}
	}
	for _, ce := range e.Coarsened {
		if !coarsenedPresent(g, ce) {
			missing = append(missing, fmt.Sprintf("coarsened[%s] %s:%s -> %s:%s",
				ce.Tier, ce.From.Kind, ce.From.Name, ce.To.Kind, ce.To.Name))
		}
	}
	for _, u := range e.Unresolved {
		if !unresolvedPresent(g, u) {
			missing = append(missing, fmt.Sprintf("unresolved %s:%s -%s-> %s",
				u.From.Kind, u.From.Name, u.Kind, u.Name))
		}
	}
	if len(g.Nodes) < e.MinNodes {
		missing = append(missing, fmt.Sprintf("nodes>=%d (got %d)", e.MinNodes, len(g.Nodes)))
	}
	if len(g.Edges) < e.MinEdges {
		missing = append(missing, fmt.Sprintf("edges>=%d (got %d)", e.MinEdges, len(g.Edges)))
	}
	if e.hasBoundedConstraints() {
		if final {
			missing = append(missing, e.checkBounded(g)...)
		} else {
			missing = append(missing, "bounded/negative constraints deferred to full sample")
		}
	}
	return len(missing) == 0, strings.Join(missing, "; ")
}

// ---------------------------------------------------------------------------
// runCase
// ---------------------------------------------------------------------------

// expansionSchedule grows the sample on a miss. Selection is deterministic, so
// "expand" means include more executions; the final step pulls everything.
var expansionSchedule = []struct{ percent, min int }{
	{10, 1},
	{50, 3},
	{100, 1 << 30},
}

func runCase(t *testing.T, c Case) {
	t.Parallel()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	nsNames := make([]string, 0, len(c.Namespaces))
	for _, ns := range c.Namespaces {
		nsNames = append(nsNames, ns.Name)
	}

	srv := startDevServer(ctx, t, nsNames)
	defer func() { _ = srv.Stop() }()

	// Dial every namespace and start ALL workers before launching any
	// execution. Cross-namespace children are started by a parent in one
	// namespace but execute on a worker in another; if that worker isn't running
	// yet, the parent blocks on the child forever. Starting all workers up front
	// avoids the deadlock.
	clients := make(map[string]client.Client, len(c.Namespaces))
	for _, ns := range c.Namespaces {
		cl, err := client.Dial(client.Options{HostPort: srv.FrontendHostPort(), Namespace: ns.Name})
		if err != nil {
			t.Fatalf("dial namespace %q: %v", ns.Name, err)
		}
		defer cl.Close()
		clients[ns.Name] = cl

		for _, ws := range ns.Workers {
			w := worker.New(cl, ws.TaskQueue, worker.Options{})
			ws.Register(w)
			if err := w.Start(); err != nil {
				t.Fatalf("start worker %q/%q: %v", ns.Name, ws.TaskQueue, err)
			}
			defer w.Stop()
		}
	}

	// Launch every execution in a namespace before awaiting any of them. A
	// signal receiver blocks until its sender — also in this namespace — runs;
	// awaiting executions one-by-one in start order would deadlock the receiver.
	// Starting them all first lets the sender deliver the signal while the
	// receiver is parked on run.Get.
	for _, ns := range c.Namespaces {
		cl := clients[ns.Name]
		runs := make([]client.WorkflowRun, 0, len(ns.Starts))
		for _, s := range ns.Starts {
			run, err := cl.ExecuteWorkflow(ctx, client.StartWorkflowOptions{
				ID:        s.ID,
				TaskQueue: s.TaskQueue,
			}, s.Workflow, s.Args...)
			if err != nil {
				t.Fatalf("execute %q/%q: %v", ns.Name, s.ID, err)
			}
			runs = append(runs, run)
		}
		for i, run := range runs {
			err := run.Get(ctx, nil)
			if ns.Starts[i].ExpectError {
				if err == nil {
					t.Fatalf("workflow %q/%q: expected failure, got success", ns.Name, ns.Starts[i].ID)
				}
				continue
			}
			if err != nil {
				t.Fatalf("workflow %q/%q: %v", ns.Name, ns.Starts[i].ID, err)
			}
		}

		want := ns.ExpectedVisible
		if want == 0 {
			want = len(ns.Starts)
		}
		waitForVisibleCount(ctx, t, cl, ns.Name, want)
	}

	// Sample + build, expanding the sample until expectations hold. The final
	// step (100%) is where negative / exact / max constraints are evaluated.
	var lastMiss string
	for i, sched := range expansionSchedule {
		var all []history.History
		for _, ns := range c.Namespaces {
			hs, err := sampling.Sample(ctx, clients[ns.Name], sampling.Options{
				Namespace:     ns.Name,
				SamplePercent: sched.percent,
				MinPerType:    sched.min,
			})
			if err != nil {
				t.Fatalf("sample namespace %q: %v", ns.Name, err)
			}
			all = append(all, hs...)
		}
		g := history.Build(all, history.Context{})
		final := i == len(expansionSchedule)-1
		if ok, miss := satisfied(g, c.Expect, final); ok {
			return
		} else {
			lastMiss = miss
		}
	}
	t.Fatalf("expectations not met even at full sample: %s", lastMiss)
}

// ---------------------------------------------------------------------------
// Server / visibility helpers
// ---------------------------------------------------------------------------

// startDevServer boots an in-process dev server provisioned with all the given
// namespaces ("default" always exists; others are created via --namespace).
func startDevServer(ctx context.Context, t *testing.T, namespaces []string) *testsuite.DevServer {
	t.Helper()
	opts := testsuite.DevServerOptions{
		ClientOptions: &client.Options{Namespace: defaultNamespace},
		// Cross-namespace child workflows are rejected by default since server
		// 1.30.0 ("cross namespace commands are not allowed"); the namespace-tier
		// coarsened edge needs them, so re-enable the capability.
		ExtraArgs: []string{
			"--dynamic-config-value", "system.enableCrossNamespaceCommands=true",
		},
	}
	for _, ns := range namespaces {
		if ns != "" && ns != defaultNamespace {
			opts.ExtraArgs = append(opts.ExtraArgs, "--namespace", ns)
		}
	}
	srv, err := testsuite.StartDevServer(ctx, opts)
	if err != nil {
		t.Fatalf("start dev server: %v", err)
	}
	return srv
}

// waitForVisibleCount polls ListWorkflow until at least want executions are
// visible in the namespace (Visibility is eventually consistent on the dev
// server), or a timeout elapses.
func waitForVisibleCount(ctx context.Context, t *testing.T, c client.Client, namespace string, want int) {
	t.Helper()
	if want <= 0 {
		return
	}
	deadline := time.Now().Add(30 * time.Second)
	for {
		resp, err := c.ListWorkflow(ctx, &workflowservice.ListWorkflowExecutionsRequest{
			Namespace: namespace,
		})
		if err == nil && len(resp.GetExecutions()) >= want {
			return
		}
		if time.Now().After(deadline) {
			got := 0
			if resp != nil {
				got = len(resp.GetExecutions())
			}
			t.Fatalf("namespace %q: only %d/%d executions visible within timeout (err=%v)", namespace, got, want, err)
		}
		time.Sleep(500 * time.Millisecond)
	}
}
