package history

import (
	"reflect"
	"slices"
	"strings"
	"testing"

	historypb "go.temporal.io/api/history/v1"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/observe"
	"github.com/jmbarzee/temporal-architect/tools/sampler/design"
)

const familiesDesign = "../design/testdata/families"

func familiesOpts(t *testing.T) Options {
	t.Helper()
	d, err := design.Load(familiesDesign)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	return Options{Namespace: "default", Design: d}
}

// provision is a run of the design's Provision workflow in a namespace.
func provision(id, namespace string) History {
	return History{WorkflowID: id, RunID: "run-1", Namespace: namespace, Events: []*historypb.HistoryEvent{
		startedEvent("Provision", "bootstrap", at),
	}}
}

// agent is a run of the design's Agent workflow that runs a tool on each queue.
func agent(id, namespace string, queues ...string) History {
	events := []*historypb.HistoryEvent{startedEvent("Agent", "agent", at)}
	for _, q := range queues {
		events = append(events, activityScheduled("RunTool", q, at))
	}
	return History{WorkflowID: id, RunID: "run-1", Namespace: namespace, Events: events}
}

func nodeOf(og *observe.ObservedGraph, id string) (graph.Node, bool) {
	i := slices.IndexFunc(og.Nodes, func(n graph.Node) bool { return n.ID == id })
	if i < 0 {
		return graph.Node{}, false
	}
	return og.Nodes[i], true
}

func familyDiagnostics(og *observe.ObservedGraph, code string) []string {
	var out []string
	for _, d := range og.Diagnostics {
		if d.Code == code {
			out = append(out, d.From+": "+d.Message)
		}
	}
	return out
}

// Concrete names that each fit one family land on the family's node: the
// observed nodes are the design's, the instances fold into one, and the
// diagnostics count them.
func TestBuild_OneFamilyAttributes(t *testing.T) {
	opts := familiesOpts(t)
	og := Build([]History{
		provision("p-1", "tenant-acme"),
		provision("p-2", "tenant-globex"),
		agent("a-1", "aivearium", "sandbox-8f3a"),
		agent("a-2", "aivearium", "sandbox-c71d"),
	}, opts)

	designed := map[string]graph.Node{}
	for _, n := range opts.Design.Graph.Nodes {
		designed[n.ID] = n
	}
	for _, n := range og.Nodes {
		want, ok := designed[n.ID]
		if !ok {
			t.Errorf("observed node %s is not in the design", n.ID)
			continue
		}
		want.SDKs = nil
		if !reflect.DeepEqual(n, want) {
			t.Errorf("observed node = %+v, design node = %+v", n, want)
		}
	}
	for _, id := range []string{"namespace:tenant-{org}", "worker:sidecar/namespace:aivearium", "activity:RunTool/worker:sidecar/namespace:aivearium"} {
		if n, ok := nodeOf(og, id); !ok {
			t.Errorf("missing family node %s", id)
		} else if strings.HasPrefix(id, "namespace:") && !slices.Equal(n.TemplateParams, []string{"org"}) {
			t.Errorf("%s templateParams = %v, want [org]", id, n.TemplateParams)
		}
	}
	agentID := "workflow:Agent/worker:agent/namespace:aivearium"
	e := findEdge(t, og, agentID, "activity:RunTool/worker:sidecar/namespace:aivearium", graph.EdgeActivityCall)
	if !equalInts(e.Buckets, []int{2}) {
		t.Errorf("activityCall buckets = %v, want [2]", e.Buckets)
	}

	if got := familyDiagnostics(og, diagFamilyAmbiguous); len(got) != 0 {
		t.Errorf("unexpected ambiguity: %v", got)
	}
	want := []string{
		"namespace:tenant-{org}: namespace tenant-{org} has 2 observed members: tenant-acme, tenant-globex",
		"worker:sidecar/namespace:aivearium: worker sidecar on queue sandbox-{sandboxId} has 2 observed members: sandbox-8f3a, sandbox-c71d",
	}
	if got := familyDiagnostics(og, diagFamilyMembers); !slices.Equal(got, want) {
		t.Errorf("members = %q, want %q", got, want)
	}
}

// A name that fits two families lands on neither: it stays a concrete node and
// is reported once, with the candidates, however many runs reach it.
func TestBuild_OverlappingFamiliesResolveToNone(t *testing.T) {
	opts := familiesOpts(t)
	og := Build([]History{
		provision("p-1", "tenant-acme-east"),
		provision("p-2", "tenant-acme-east"),
		agent("a-1", "aivearium", "sandbox-pool-3", "sandbox-pool-3"),
	}, opts)

	for _, id := range []string{"namespace:tenant-acme-east", "worker:sandbox-pool-3/namespace:aivearium"} {
		if n, ok := nodeOf(og, id); !ok || len(n.TemplateParams) != 0 {
			t.Errorf("missing concrete node %s", id)
		}
	}
	want := []string{
		`namespace:tenant-acme-east: namespace "tenant-acme-east" fits the families namespace tenant-{org}, namespace tenant-{org}-east`,
		`worker:sandbox-pool-3/namespace:aivearium: task queue "sandbox-pool-3" in namespace "aivearium" fits the families worker poolSidecar on queue sandbox-pool-{poolId}, worker sidecar on queue sandbox-{sandboxId}`,
	}
	if got := familyDiagnostics(og, diagFamilyAmbiguous); !slices.Equal(got, want) {
		t.Errorf("ambiguity = %q, want %q", got, want)
	}
	if got := familyDiagnostics(og, diagFamilyMembers); len(got) != 0 {
		t.Errorf("members = %q, want none", got)
	}
}

// A name that fits no family, or that the design declares literally, stays a
// concrete node and draws no diagnostic.
func TestBuild_NoFamilyStaysConcrete(t *testing.T) {
	opts := familiesOpts(t)
	og := Build([]History{
		provision("p-1", "platform"),
		provision("p-2", "default"),
		agent("a-1", "aivearium", "adhoc-1"),
	}, opts)

	for _, id := range []string{"namespace:platform", "namespace:default", "worker:adhoc-1/namespace:aivearium", "worker:agent/namespace:aivearium"} {
		if n, ok := nodeOf(og, id); !ok || len(n.TemplateParams) != 0 {
			t.Errorf("missing concrete node %s", id)
		}
	}
	if len(og.Diagnostics) != 0 {
		t.Errorf("Diagnostics = %+v, want none", og.Diagnostics)
	}
}

// Without a design the same histories keep their concrete names.
func TestBuild_FamiliesWithoutDesign(t *testing.T) {
	og := Build([]History{provision("p-1", "tenant-acme"), agent("a-1", "aivearium", "sandbox-8f3a")}, Options{Namespace: "default"})
	for _, id := range []string{"namespace:tenant-acme", "worker:sandbox-8f3a/namespace:aivearium"} {
		if _, ok := nodeOf(og, id); !ok {
			t.Errorf("missing concrete node %s", id)
		}
	}
	if len(og.Diagnostics) != 0 {
		t.Errorf("Diagnostics = %+v, want none", og.Diagnostics)
	}
}
