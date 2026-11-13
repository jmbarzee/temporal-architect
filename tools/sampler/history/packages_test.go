package history

import (
	"cmp"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"

	historypb "go.temporal.io/api/history/v1"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/observe"
	"github.com/jmbarzee/temporal-architect/tools/sampler/design"
)

const shopDesign = "../design/testdata/shop"

func loadShop(t *testing.T) *design.Design {
	t.Helper()
	d, err := design.Load(shopDesign)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	return d
}

// shopHistories are the runs of the shop design's two Process workflows, which
// history names alike.
func shopHistories(t *testing.T) []History {
	t.Helper()
	orders, err := LoadFile("testdata/shop_orders_process.json", "orders-001", "run-1")
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}
	billing, err := LoadFile("testdata/shop_billing_process.json", "billing-001", "run-1")
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}
	return []History{orders, billing}
}

// A packaged design's observed graph is the design's graph: the same nodes and
// the same edges, so the two diff to nothing.
func TestBuild_PackagedDesignMatchesDesignGraph(t *testing.T) {
	d := loadShop(t)
	og := Build(shopHistories(t), Options{Namespace: "shop", Design: d})

	if !reflect.DeepEqual(og.Nodes, d.Graph.Nodes) {
		t.Errorf("observed nodes differ from the design's:\n observed: %+v\n design:   %+v", og.Nodes, d.Graph.Nodes)
	}
	type edge struct{ from, to, kind string }
	var observed, designed []edge
	for _, e := range og.Edges {
		observed = append(observed, edge{e.From, e.To, e.Kind})
	}
	for _, e := range d.Graph.Edges {
		designed = append(designed, edge{e.From, e.To, e.Kind})
	}
	less := func(a, b edge) int {
		return cmp.Or(strings.Compare(a.from, b.from), strings.Compare(a.to, b.to), strings.Compare(a.kind, b.kind))
	}
	slices.SortFunc(observed, less)
	slices.SortFunc(designed, less)
	if !slices.Equal(observed, designed) {
		t.Errorf("observed edges differ from the design's:\n observed: %v\n design:   %v", observed, designed)
	}
	if len(og.Unresolved) != 0 {
		t.Errorf("unexpected unresolved entries: %+v", og.Unresolved)
	}
}

// Two packages' same-named workflows are two nodes with their packages, not one
// node for the bare runtime name.
func TestBuild_SameNameInTwoPackages(t *testing.T) {
	og := Build(shopHistories(t), Options{Namespace: "shop", Design: loadShop(t)})

	byPackage := map[string]string{}
	for _, n := range og.Nodes {
		if n.Name == "Process" {
			byPackage[n.PackageID] = n.ID
		}
	}
	want := map[string]string{
		"acme/orders":  graph.HostedID(graph.KindWorkflow, "acme/orders.Process", "shopfloor", "shop", false),
		"acme/billing": graph.HostedID(graph.KindWorkflow, "acme/billing.Process", "ledger", "shop", false),
	}
	if !reflect.DeepEqual(byPackage, want) {
		t.Errorf("Process nodes by package = %v, want %v", byPackage, want)
	}
}

// Without a design every name stays bare, so the two Process workflows differ
// only by their queue.
func TestBuild_WithoutDesignStaysBare(t *testing.T) {
	og := Build(shopHistories(t), Options{Namespace: "shop"})

	for _, id := range []string{
		graph.HostedID(graph.KindWorkflow, "Process", "shopfloor", "shop", false),
		graph.HostedID(graph.KindWorkflow, "Process", "ledger", "shop", false),
	} {
		if !hasNode(observe.ToGraph(og), id) {
			t.Errorf("missing node %q", id)
		}
	}
	for _, n := range og.Nodes {
		if n.PackageID != "" {
			t.Errorf("node %s has package %q without a design", n.ID, n.PackageID)
		}
	}
	if len(og.Unresolved) != 0 {
		t.Errorf("unexpected unresolved entries: %+v", og.Unresolved)
	}
}

// A name the design lacks, or one it cannot tell apart, keeps its bare ID and is
// reported.
func TestBuild_NameTheDesignCannotResolve(t *testing.T) {
	at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	histories := []History{
		{WorkflowID: "audit-001", RunID: "run-1", Events: []*historypb.HistoryEvent{startedEvent("Audit", "shopfloor", at)}},
		{WorkflowID: "process-001", RunID: "run-1", Events: []*historypb.HistoryEvent{startedEvent("Process", "elsewhere", at)}},
	}
	og := Build(histories, Options{Namespace: "shop", Design: loadShop(t)})

	audit := graph.HostedID(graph.KindWorkflow, "Audit", "shopfloor", "shop", false)
	process := graph.HostedID(graph.KindWorkflow, "Process", "elsewhere", "shop", false)
	want := []graph.Unresolved{
		{From: audit, Name: "Audit", Kind: graph.KindWorkflow},
		{From: process, Name: "Process", Kind: graph.KindWorkflow},
	}
	if !reflect.DeepEqual(og.Unresolved, want) {
		t.Errorf("Unresolved = %+v, want %+v", og.Unresolved, want)
	}
	g := observe.ToGraph(og)
	for _, id := range []string{audit, process} {
		if !hasNode(g, id) {
			t.Errorf("missing bare node %q", id)
		}
	}
}
