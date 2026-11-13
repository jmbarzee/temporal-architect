package design

import (
	"slices"
	"strings"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
)

// The shop design declares Process in two packages, acme/orders on queue
// shopfloor and acme/billing on queue ledger, and an activity apiece.
const shop = "testdata/shop"

func TestPackage(t *testing.T) {
	d, err := Load(shop)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	tests := []struct {
		name      string
		kind      string
		def       string
		namespace string
		queue     string
		want      string
		wantOK    bool
	}{
		{"same name, first queue", graph.KindWorkflow, "Process", "shop", "shopfloor", "acme/orders", true},
		{"same name, second queue", graph.KindWorkflow, "Process", "shop", "ledger", "acme/billing", true},
		{"same name, queue no worker hosts it on", graph.KindWorkflow, "Process", "shop", "elsewhere", "", false},
		{"same name, namespace no worker is in", graph.KindWorkflow, "Process", "other", "shopfloor", "", false},
		{"one package declares it, whatever the queue", graph.KindActivity, "Charge", "shop", "elsewhere", "acme/billing", true},
		{"no package declares it", graph.KindWorkflow, "Audit", "shop", "shopfloor", "", false},
		{"declared as another kind", graph.KindActivity, "Process", "shop", "shopfloor", "", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := d.Package(tt.kind, tt.def, tt.namespace, tt.queue)
			if got != tt.want || ok != tt.wantOK {
				t.Errorf("Package(%s, %s, %s, %s) = %q, %v; want %q, %v",
					tt.kind, tt.def, tt.namespace, tt.queue, got, ok, tt.want, tt.wantOK)
			}
		})
	}
}

func TestPackage_Unpackaged(t *testing.T) {
	d, err := Load("../../lsp/parser/graph/testdata/task_queues.twf")
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	checked := 0
	for _, n := range d.Graph.Nodes {
		if kind, _, _ := strings.Cut(n.Definition, ":"); kind == graph.KindWorkflow {
			checked++
			if pkg, ok := d.Package(kind, n.Name, "", ""); pkg != "" || !ok {
				t.Errorf("Package(workflow, %s) = %q, %v; want the default package", n.Name, pkg, ok)
			}
		}
	}
	if checked == 0 {
		t.Fatal("design has no workflow")
	}
}

func TestLoad_Errors(t *testing.T) {
	for _, path := range []string{"testdata/missing", "testdata/broken"} {
		if _, err := Load(path); err == nil {
			t.Errorf("Load(%s) succeeded", path)
		}
	}
}

// The schemes design hosts ShipItem ("ship-{order.id}-{item.id}") and ShipOrder
// ("ship-{order.id}"), which overlap, and Refund ("refund-{order.id}"), in
// namespace prod.
func TestMatchWorkflowID(t *testing.T) {
	d, err := Load("testdata/schemes")
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	tests := []struct {
		name      string
		id        string
		namespace string
		want      []Target
	}{
		{"one scheme fits", "refund-7", "prod", []Target{{"", "Refund", "refunds"}}},
		{"two schemes fit", "ship-42-sku", "prod", []Target{{"", "ShipItem", "shipping"}, {"", "ShipOrder", "shipping"}}},
		{"only the shorter scheme fits", "ship-42", "prod", []Target{{"", "ShipOrder", "shipping"}}},
		{"no scheme fits", "audit-1", "prod", nil},
		{"a workflow with no scheme is not a match", "checkout-1", "prod", nil},
		{"namespace no worker hosts it in", "refund-7", "staging", nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := d.MatchWorkflowID(tt.id, tt.namespace); !slices.Equal(got, tt.want) {
				t.Errorf("MatchWorkflowID(%q, %q) = %v, want %v", tt.id, tt.namespace, got, tt.want)
			}
		})
	}
}
