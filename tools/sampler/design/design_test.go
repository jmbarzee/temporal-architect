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

// The families design has the namespace families tenant-{org} and
// tenant-{org}-east, which overlap, and the static namespace platform; in
// aivearium it has the worker families sandbox-{sandboxId} and
// sandbox-pool-{poolId}, which overlap, and the static queue agent.
func TestMatchNamespace(t *testing.T) {
	d, err := Load("testdata/families")
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	tests := []struct {
		name, namespace string
		want            []string
	}{
		{"one family fits", "tenant-acme", []string{"tenant-{org}"}},
		{"two families fit", "tenant-acme-east", []string{"tenant-{org}", "tenant-{org}-east"}},
		{"no family fits", "default", nil},
		{"a static namespace is its own", "platform", nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var got []string
			for _, n := range d.MatchNamespace(tt.namespace) {
				got = append(got, n.Name)
			}
			if !slices.Equal(got, tt.want) {
				t.Errorf("MatchNamespace(%q) = %v, want %v", tt.namespace, got, tt.want)
			}
		})
	}
}

func TestMatchWorker(t *testing.T) {
	d, err := Load("testdata/families")
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	tests := []struct {
		name, namespace, queue string
		want                   []string
	}{
		{"one family fits", "aivearium", "sandbox-8f3a", []string{"sidecar"}},
		{"two families fit", "aivearium", "sandbox-pool-3", []string{"poolSidecar", "sidecar"}},
		{"no family fits", "aivearium", "adhoc", nil},
		{"a static queue is its own", "aivearium", "agent", nil},
		{"namespace the family is not in", "platform", "sandbox-8f3a", nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var got []string
			for _, n := range d.MatchWorker(tt.namespace, tt.queue) {
				got = append(got, n.Name)
			}
			slices.Sort(got)
			if !slices.Equal(got, tt.want) {
				t.Errorf("MatchWorker(%q, %q) = %v, want %v", tt.namespace, tt.queue, got, tt.want)
			}
		})
	}
}

// The nexus design points its endpoint billing at queue billing in namespace
// shop, and the families design has only a templated endpoint.
func TestEndpoint(t *testing.T) {
	tests := []struct {
		name, design, endpoint string
		namespace, queue       string
		ok                     bool
	}{
		{"static endpoint", "testdata/nexus", "billing", "shop", "billing", true},
		{"endpoint the design lacks", "testdata/nexus", "refunds", "", "", false},
		{"templated endpoint", "testdata/families", "tenant-{org}-api", "", "", false},
		{"instance of a templated endpoint", "testdata/families", "tenant-acme-api", "", "", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			d, err := Load(tt.design)
			if err != nil {
				t.Fatalf("Load: %v", err)
			}
			namespace, queue, ok := d.Endpoint(tt.endpoint)
			if namespace != tt.namespace || queue != tt.queue || ok != tt.ok {
				t.Errorf("Endpoint(%q) = %q, %q, %v; want %q, %q, %v",
					tt.endpoint, namespace, queue, ok, tt.namespace, tt.queue, tt.ok)
			}
		})
	}
}

// A nexus service is joined to its package like a workflow or activity.
func TestPackage_NexusService(t *testing.T) {
	d, err := Load("testdata/nexus")
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	for _, tt := range []struct {
		service string
		want    bool
	}{{"Invoices", true}, {"Refunds", false}} {
		if pkg, ok := d.Package(graph.KindNexusService, tt.service, "shop", "billing"); pkg != "" || ok != tt.want {
			t.Errorf("Package(nexusService, %s) = %q, %v; want the default package: %v", tt.service, pkg, ok, tt.want)
		}
	}
}
