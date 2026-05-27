package graph

import (
	"os"
	"strings"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/parser"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/resolver"
)

// loadFixture parses + resolves a fixture file and fails the test on
// any parse/resolve error. Resolution is required because Extract
// reads through Resolved fields on call-site refs.
func loadFixture(t *testing.T, path string) *Graph {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	file, parseErrs := parser.ParseFileAll(string(data))
	for _, e := range parseErrs {
		t.Fatalf("parse %s: %v", path, e)
	}
	if errs := resolver.Resolve(file); len(errs) > 0 {
		for _, e := range errs {
			t.Fatalf("resolve %s: %v", path, e)
		}
	}
	return Extract(file)
}

func TestTaskQueuesFixture(t *testing.T) {
	g := loadFixture(t, "testdata/task_queues.twf")

	// Sanity: every fixture node must have a definition and a valid
	// orphan-vs-deployed shape. Orphans must not carry deployment
	// context; deployed hosted nodes must carry worker, namespace,
	// and queue (the latter may legitimately be empty if the queue
	// is missing on the instantiation — but the fixture sets them).
	for _, n := range g.Nodes {
		if n.Definition == "" {
			t.Errorf("node %q has empty definition", n.ID)
		}
		if n.Orphan && (n.Worker != "" || n.Namespace != "" || n.Queue != "") {
			t.Errorf("orphan node %q carries deployment context: %+v", n.ID, n)
		}
	}

	// Specific structural checks against the canonical fixture.
	cases := []struct {
		id      string
		assert  func(t *testing.T, n Node)
	}{
		{"namespace:ecommerce", func(t *testing.T, n Node) {
			if n.Definition != "namespace:ecommerce" {
				t.Errorf("ecommerce namespace: definition = %q", n.Definition)
			}
		}},
		{"worker:orderWorker/namespace:ecommerce", func(t *testing.T, n Node) {
			if n.Queue != "orders" {
				t.Errorf("orderWorker queue = %q, want \"orders\"", n.Queue)
			}
		}},
		{"workflow:OrderWorkflow/worker:orderWorker/namespace:ecommerce", func(t *testing.T, n Node) {
			if n.Worker != "worker:orderWorker" || n.Namespace != "namespace:ecommerce" || n.Queue != "orders" {
				t.Errorf("OrderWorkflow deployment: %+v", n)
			}
		}},
		{"nexusEndpoint:PaymentEndpoint/namespace:ecommerce", func(t *testing.T, n Node) {
			if n.Queue != "payments" {
				t.Errorf("PaymentEndpoint queue = %q", n.Queue)
			}
		}},
	}
	for _, c := range cases {
		t.Run("node:"+c.id, func(t *testing.T) {
			n := findNode(g, c.id)
			if n == nil {
				t.Fatalf("missing node %q", c.id)
			}
			c.assert(t, *n)
		})
	}

	// Multi-worker registration: ChargePayment is registered on both
	// paymentWorker and paymentWorkerSecondary, both in ecommerce.
	chargeNodes := nodesByDefinition(g, "activity:ChargePayment")
	if len(chargeNodes) != 2 {
		t.Errorf("ChargePayment deployment nodes = %d, want 2 (one per hosting worker)", len(chargeNodes))
	}

	// Containment: every non-orphan hosted node has a containment edge
	// to its worker deployment. Spot-check ChargePayment's edges.
	for _, n := range chargeNodes {
		if n.Orphan {
			continue
		}
		want := workerID(workerNameFromDef(n.Worker), namespaceNameFromID(n.Namespace))
		if !hasEdge(g, n.ID, want, EdgeContainment) {
			t.Errorf("missing containment edge %s → %s", n.ID, want)
		}
	}

	// Explicit routing: OrderWorkflow's ChargePayment call (line 11)
	// has task_queue: "payments" and should reach paymentWorker but
	// NOT paymentWorkerSecondary (which is on payments-secondary).
	orderFrom := "workflow:OrderWorkflow/worker:orderWorker/namespace:ecommerce"
	chargeOnPayments := "activity:ChargePayment/worker:paymentWorker/namespace:ecommerce"
	chargeOnSecondary := "activity:ChargePayment/worker:paymentWorkerSecondary/namespace:ecommerce"
	if !hasEdgeRouting(g, orderFrom, chargeOnPayments, EdgeActivityCall, "payments") {
		t.Errorf("missing explicit-routed activityCall %s → %s with routing.explicit=\"payments\"", orderFrom, chargeOnPayments)
	}
	if hasEdge(g, orderFrom, chargeOnSecondary, EdgeActivityCall) {
		t.Errorf("unexpected activityCall %s → %s (explicit routing should not reach secondary)", orderFrom, chargeOnSecondary)
	}

	// Implicit routing: OrderWorkflow's ValidateOrder call inherits
	// "orders", matching ValidateOrder on orderWorker.
	validateOnOrders := "activity:ValidateOrder/worker:orderWorker/namespace:ecommerce"
	if !hasEdge(g, orderFrom, validateOnOrders, EdgeActivityCall) {
		t.Errorf("missing implicit-routed activityCall %s → %s", orderFrom, validateOnOrders)
	}

	// Nexus dispatch: PartnerCheckout (in partner ns) calls
	// PaymentService.CheckPaymentStatus via PaymentEndpoint which
	// routes to payments queue in ecommerce ns. Only the
	// paymentWorker copy of the operation matches (paymentWorkerSecondary
	// polls payments-secondary).
	partnerFrom := "workflow:PartnerCheckout/worker:partnerWorker/namespace:partner"
	opOnPayments := "nexusOperation:PaymentService.CheckPaymentStatus/worker:paymentWorker/namespace:ecommerce"
	if !hasEdgeRouting(g, partnerFrom, opOnPayments, EdgeNexusCall, "") {
		t.Errorf("missing nexusCall %s → %s", partnerFrom, opOnPayments)
	}

	// AsyncBacking: AnalyticsService.TrackEvent → TrackEventWorkflow
	// on the same queue. analyticsWorker (queue=analytics) hosts both
	// the operation and the backing workflow → one edge.
	asyncFrom := "nexusOperation:AnalyticsService.TrackEvent/worker:analyticsWorker/namespace:ecommerce"
	asyncTo := "workflow:TrackEventWorkflow/worker:analyticsWorker/namespace:ecommerce"
	if !hasEdge(g, asyncFrom, asyncTo, EdgeAsyncBacking) {
		t.Errorf("missing asyncBacking %s → %s", asyncFrom, asyncTo)
	}

	// Coarsening: partner → ecommerce namespace edge should exist
	// (PartnerCheckout makes two nexus calls into ecommerce).
	foundNS := false
	for _, ce := range g.CoarsenedEdges {
		if ce.Tier == TierNamespace && ce.From == "namespace:partner" && ce.To == "namespace:ecommerce" {
			foundNS = true
			if ce.Weight < 1 {
				t.Errorf("partner→ecommerce coarsened weight = %d, want ≥1", ce.Weight)
			}
		}
	}
	if !foundNS {
		t.Errorf("missing coarsened namespace edge partner → ecommerce")
	}

	// No self-loops in coarsened output (orderWorker→orderWorker
	// would happen if validate-order coarsening was wrong).
	for _, ce := range g.CoarsenedEdges {
		if ce.From == ce.To {
			t.Errorf("self-loop in coarsened edge: %+v", ce)
		}
	}

	// Summary matches actual counts.
	if g.Summary.Nodes != len(g.Nodes) {
		t.Errorf("summary.nodes = %d, want %d", g.Summary.Nodes, len(g.Nodes))
	}
	if g.Summary.Edges != len(g.Edges) {
		t.Errorf("summary.edges = %d, want %d", g.Summary.Edges, len(g.Edges))
	}
}

// TestOrphanDefinitions covers the cases where definitions exist but
// aren't registered on any worker / instantiated in any namespace.
func TestOrphanDefinitions(t *testing.T) {
	src := `
workflow OrphanWf(input: string) -> (string):
    activity StillCalled(input) -> result
    close complete(result)

activity StillCalled(input: string) -> (string):
    return input

worker someWorker:
    activity StillCalled

# Worker exists but is uninstantiated → orphan worker, plus the
# StillCalled registration becomes orphan-via-uninstantiated.
`
	file, parseErrs := parser.ParseFileAll(src)
	if len(parseErrs) > 0 {
		t.Fatalf("parse: %v", parseErrs[0])
	}
	if errs := resolver.Resolve(file); len(errs) > 0 {
		t.Fatalf("resolve: %v", errs[0])
	}
	g := Extract(file)

	if n := findNode(g, "workflow:OrphanWf/orphan"); n == nil || !n.Orphan {
		t.Errorf("expected orphan workflow node, got %v", n)
	}
	if n := findNode(g, "worker:someWorker/orphan"); n == nil || !n.Orphan {
		t.Errorf("expected orphan worker node, got %v", n)
	}
	// activity StillCalled is registered on someWorker (orphan) →
	// no instantiated deployment → the activity itself is orphan.
	if n := findNode(g, "activity:StillCalled/orphan"); n == nil || !n.Orphan {
		t.Errorf("expected orphan activity node, got %v", n)
	}

	// Calls from an orphan workflow body shouldn't crash; they
	// produce a DISPATCH_NO_REACHABLE_DEPLOYMENT diagnostic only if
	// the caller has a queue (orphans don't), so the call is silently
	// dropped. Verify no edges exist out of the orphan caller.
	for _, e := range g.Edges {
		if e.From == "workflow:OrphanWf/orphan" && e.Kind != EdgeContainment {
			t.Errorf("unexpected dispatch edge from orphan workflow: %+v", e)
		}
	}
}

// TestNoReachableDeploymentDiagnostic covers the case where a call's
// task queue matches no deployment that hosts the callee.
func TestNoReachableDeploymentDiagnostic(t *testing.T) {
	src := `
workflow Bad(input: string) -> (string):
    activity Phantom(input) -> r
        options:
            task_queue: "nonexistent"
    close complete(r)

activity Phantom(input: string) -> (string):
    return input

worker badWorker:
    workflow Bad
    activity Phantom

namespace bad:
    worker badWorker
        options:
            task_queue: "real-queue"
`
	file, parseErrs := parser.ParseFileAll(src)
	if len(parseErrs) > 0 {
		t.Fatalf("parse: %v", parseErrs[0])
	}
	if errs := resolver.Resolve(file); len(errs) > 0 {
		t.Fatalf("resolve: %v", errs[0])
	}
	g := Extract(file)

	found := false
	for _, d := range g.Diagnostics {
		if d.Code == DiagDispatchNoReachableDeployment && strings.Contains(d.Message, "nonexistent") {
			found = true
		}
	}
	if !found {
		t.Errorf("expected DISPATCH_NO_REACHABLE_DEPLOYMENT diagnostic; got %+v", g.Diagnostics)
	}
}

// TestNilFile ensures Extract is defensive against a nil AST input
// — useful so the CLI can call Extract before checking for parse
// errors without short-circuiting.
func TestNilFile(t *testing.T) {
	g := Extract(nil)
	if g == nil {
		t.Fatal("Extract(nil) returned nil")
	}
	if g.Summary.Nodes != 0 || len(g.Nodes) != 0 {
		t.Errorf("Extract(nil) produced non-empty graph: %+v", g.Summary)
	}
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

func findNode(g *Graph, id string) *Node {
	for i := range g.Nodes {
		if g.Nodes[i].ID == id {
			return &g.Nodes[i]
		}
	}
	return nil
}

func nodesByDefinition(g *Graph, def string) []Node {
	var out []Node
	for _, n := range g.Nodes {
		if n.Definition == def {
			out = append(out, n)
		}
	}
	return out
}

func hasEdge(g *Graph, from, to, kind string) bool {
	for _, e := range g.Edges {
		if e.From == from && e.To == to && e.Kind == kind {
			return true
		}
	}
	return false
}

func hasEdgeRouting(g *Graph, from, to, kind, explicit string) bool {
	for _, e := range g.Edges {
		if e.From == from && e.To == to && e.Kind == kind {
			if e.Routing != nil && e.Routing.Explicit == explicit {
				return true
			}
		}
	}
	return false
}

// namespaceNameFromID strips the `namespace:` prefix from a namespace ID.
func namespaceNameFromID(id string) string {
	const prefix = "namespace:"
	if strings.HasPrefix(id, prefix) {
		return id[len(prefix):]
	}
	return id
}
