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
	"go.temporal.io/sdk/workflow"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/history"
	"github.com/jmbarzee/temporal-architect/tools/sampler/sampling"
)

// Shared fixtures used by both the direct-call suite and the CLI command test.
const (
	defaultNamespace      = "default"
	graphTestQueue        = "graph-it-tq"
	graphTestWorkflowType = "GraphTestWorkflow"
	graphTestActivityType = "GraphTestActivity"
)

// GraphTestWorkflow runs one activity. The pair yields a workflow node, an
// activity node, and an activityCall edge in the reconstructed graph — the
// minimal shape that proves the event→graph mapping works end to end.
func GraphTestWorkflow(ctx workflow.Context) error {
	ctx = workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: time.Minute,
	})
	return workflow.ExecuteActivity(ctx, GraphTestActivity).Get(ctx, nil)
}

func GraphTestActivity(ctx context.Context) error { return nil }

// ---------------------------------------------------------------------------
// Case model
// ---------------------------------------------------------------------------

// Case is one suite scenario. It spans one or more namespaces (one for most
// tests today; multiple for future Nexus / cross-namespace coverage).
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
}

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

type Expect struct {
	Nodes    []ExpectNode
	Edges    []ExpectEdge
	MinNodes int
	MinEdges int
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
	fromDef := graph.DefKey(ee.From.Kind, ee.From.Name)
	toDef := graph.DefKey(ee.To.Kind, ee.To.Name)
	fromIDs := map[string]bool{}
	toIDs := map[string]bool{}
	for _, n := range g.Nodes {
		if n.Definition == fromDef {
			fromIDs[n.ID] = true
		}
		if n.Definition == toDef {
			toIDs[n.ID] = true
		}
	}
	for _, e := range g.Edges {
		if e.Kind == ee.Kind && fromIDs[e.From] && toIDs[e.To] {
			return true
		}
	}
	return false
}

// satisfied reports whether every expectation holds, returning a human-readable
// list of what's missing otherwise.
func satisfied(g *graph.Graph, e Expect) (bool, string) {
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
	if len(g.Nodes) < e.MinNodes {
		missing = append(missing, fmt.Sprintf("nodes>=%d (got %d)", e.MinNodes, len(g.Nodes)))
	}
	if len(g.Edges) < e.MinEdges {
		missing = append(missing, fmt.Sprintf("edges>=%d (got %d)", e.MinEdges, len(g.Edges)))
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

	// Per-namespace client, workers, and executions.
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

		for _, s := range ns.Starts {
			run, err := cl.ExecuteWorkflow(ctx, client.StartWorkflowOptions{
				ID:        s.ID,
				TaskQueue: s.TaskQueue,
			}, s.Workflow, s.Args...)
			if err != nil {
				t.Fatalf("execute %q/%q: %v", ns.Name, s.ID, err)
			}
			if err := run.Get(ctx, nil); err != nil {
				t.Fatalf("workflow %q/%q: %v", ns.Name, s.ID, err)
			}
		}

		waitForVisibleCount(ctx, t, cl, ns.Name, len(ns.Starts))
	}

	// Sample + build, expanding the sample until expectations hold.
	var lastMiss string
	for _, sched := range expansionSchedule {
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
		if ok, miss := satisfied(g, c.Expect); ok {
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
