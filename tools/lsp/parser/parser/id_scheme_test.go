package parser

import (
	"slices"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
)

func TestIDSchemeParses(t *testing.T) {
	input := `workflow ShipItem(order: Order, item: Item) -> (Shipment):
    id_scheme: "ship-{order.id}-{item.id}"
    default_options:
        task_queue: "ship"
    signal Shipped(trackingId: string):
        shipped = true
    activity Ship(order, item)

workflow RateLimiter():
    id_scheme: "rate-limiter"  # constant: no holes
    activity Tick()
`
	file, err := ParseFile(input)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	ship := file.Definitions[0].(*ast.WorkflowDef)
	if ship.IDScheme == nil || ship.IDScheme.Template != "ship-{order.id}-{item.id}" {
		t.Fatalf("IDScheme = %+v", ship.IDScheme)
	}
	if want := []string{"order.id", "item.id"}; !slices.Equal(ship.IDScheme.Holes, want) {
		t.Errorf("Holes = %v, want %v", ship.IDScheme.Holes, want)
	}
	if ship.DefaultOptions == nil || len(ship.Signals) != 1 {
		t.Errorf("default_options / signals lost after id_scheme: %+v", ship)
	}
	limiter := file.Definitions[1].(*ast.WorkflowDef)
	if limiter.IDScheme == nil || len(limiter.IDScheme.Holes) != 0 {
		t.Errorf("constant IDScheme = %+v", limiter.IDScheme)
	}
}

func TestAddressedSendParses(t *testing.T) {
	input := `workflow Sender(event: Event):
    signal ShipItem.Shipped(event.tracking)
        id: "ship-{event.orderId}-{event.sku}"
    signal ShipItem.Shipped("recovered")
        id: wid  # learned
        run_id: rid
    signal Coordinator.Progress(doc.id)
        id: parent
    signal orders.ShipItem.Shipped(t)
        id: "ship-{o}-{i}"
    signal ship.Shipped(t)
`
	file, err := ParseFile(input)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	body := file.Definitions[0].(*ast.WorkflowDef).Body
	sends := make([]*ast.SignalSendStmt, len(body))
	for i, st := range body {
		sends[i] = st.(*ast.SignalSendStmt)
	}

	if h := sends[0].Head; h.Kind != ast.SendHeadType || h.Type.Name != "ShipItem" ||
		h.Address.ID.Kind != ast.IDLiteral || !slices.Equal(h.Address.ID.Parts, []string{"event.orderId", "event.sku"}) {
		t.Errorf("constructed send head = %+v", h)
	}
	if a := sends[1].Head.Address; a.ID.Kind != ast.IDName || a.ID.Name != "wid" || a.RunID != "rid" {
		t.Errorf("learned send address = %+v", a)
	}
	if a := sends[2].Head.Address; a.ID.Kind != ast.IDParent || a.RunID != "" {
		t.Errorf("parent send address = %+v", a)
	}
	if h := sends[3].Head; h.Kind != ast.SendHeadType || h.Type.Package != "orders" || h.Type.Name != "ShipItem" || sends[3].Signal != "Shipped" {
		t.Errorf("qualified send head = %+v", h)
	}
	if h := sends[4].Head; h.Kind != ast.SendHeadHandle || h.Handle.Name != "ship" || h.Address != nil {
		t.Errorf("handle send head = %+v", h)
	}
}

// TestIDParseDiagnostics covers every parse-level code from the ID-scheme spec.
func TestCommentAboveAddress(t *testing.T) {
	input := `workflow W(a: A):
    signal Child.Go()
        # the child
        id: "c-{a}"
    close complete
`
	file, err := ParseFile(input)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	body := file.Definitions[0].(*ast.WorkflowDef).Body
	if len(body) != 2 {
		t.Fatalf("body = %d statements, want the send and the close", len(body))
	}
	if a := body[0].(*ast.SignalSendStmt).Head.Address; a == nil || a.ID.Literal != "c-{a}" {
		t.Errorf("address under a comment = %+v", a)
	}
}

func TestIDParseDiagnostics(t *testing.T) {
	tests := []struct {
		name  string
		input string
		code  string
	}{
		{"id_scheme after default_options", `workflow W(a: A):
    default_options:
        task_queue: "q"
    id_scheme: "w-{a}"
`, CodeIDSchemeMisplaced},
		{"id_scheme repeated", `workflow W(a: A):
    id_scheme: "w-{a}"
    id_scheme: "x-{a}"
`, CodeIDSchemeMisplaced},
		{"id_scheme in body", `workflow W(a: A):
    activity Do(a)
    id_scheme: "w-{a}"
`, CodeIDSchemeMisplaced},
		{"id_scheme in activity", `activity Do(a: A):
    id_scheme: "w-{a}"
`, CodeIDSchemeMisplaced},
		{"hole root not a param", `workflow W(a: A):
    id_scheme: "w-{b.id}"
`, CodeIDSchemeMalformed},
		{"touching holes", `workflow W(a: A, b: B):
    id_scheme: "w-{a}{b}"
`, CodeIDSchemeMalformed},
		{"no fixed text", `workflow W(a: A):
    id_scheme: "{a}"
`, CodeIDSchemeMalformed},
		{"stray brace", `workflow W(a: A):
    id_scheme: "w-{a}}"
`, CodeIDSchemeMalformed},
		{"id is an expression", `workflow W(a: A):
    signal T.S()
        id: prefix + a
`, CodeIDValueMalformed},
		{"id is a call", `workflow W(a: A):
    signal T.S()
        id: makeID(a)
`, CodeIDValueMalformed},
		{"id is a number", `workflow W(a: A):
    signal T.S()
        id: 42
`, CodeIDValueMalformed},
		{"id is a path under parent", `workflow W(a: A):
    signal T.S()
        id: parent.x
`, CodeIDValueMalformed},
		{"id literal stray brace", `workflow W(a: A):
    signal T.S()
        id: "t-{a"
`, CodeIDValueMalformed},
		{"id under a workflow call", `workflow W(a: A):
    workflow T(a)
        id: "t-{a}"
`, CodeIDAtStart},
		{"run_id under a detach", `workflow W(a: A):
    detach workflow T(a)
        run_id: r
`, CodeIDAtStart},
		{"id under a promise-bound start", `workflow W(a: A):
    promise t <- workflow T(a)
        id: "t-{a}"
`, CodeIDAtStart},
		{"id under an awaited start", `workflow W(a: A):
    await workflow T(a)
        id: "t-{a}"
`, CodeIDAtStart},
		{"id after a start's options", `workflow W(a: A):
    workflow T(a)
        options:
            task_queue: "q"
        id: "t-{a}"
`, CodeIDAtStart},
		{"workflow_id option", `workflow W(a: A):
    workflow T(a)
        options:
            workflow_id: "t"
`, CodeIDAtStart},
		{"address under an activity", `workflow W(a: A):
    activity Do(a)
        id: "t-{a}"
`, CodeAddressMisplaced},
		{"options under a send", `workflow W(a: A):
    signal T.S()
        options:
            task_queue: "q"
`, CodeAddressMisplaced},
		{"options after a send's address", `workflow W(a: A):
    signal T.S()
        id: w
        options:
            task_queue: "q"
`, CodeAddressMisplaced},
		{"run_id without id", `workflow W(a: A):
    signal T.S()
        run_id: r
`, CodeAddressMisplaced},
		{"run_id before id", `workflow W(a: A):
    log(x)
    signal T.S()
        run_id: r
        id: w
`, CodeAddressMisplaced},
		{"run_id under parent", `workflow W(a: A):
    signal T.S()
        id: parent
        run_id: r
`, CodeAddressMisplaced},
		{"quoted run_id", `workflow W(a: A):
    signal T.S()
        id: w
        run_id: "r-1"
`, CodeAddressMisplaced},
		{"address on the send's line", `workflow W(a: A):
    signal T.S() id: w
`, CodeAddressMisplaced},
		{"id: parent in a sync nexus body", `nexus service Svc:
    sync Op(a: A) -> (R):
        signal T.S()
            id: parent
`, CodeAddressMisplaced},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, errs := ParseFileAll(tt.input)
			for _, e := range errs {
				if e.Code() == tt.code {
					return
				}
			}
			t.Fatalf("expected %s, got %v", tt.code, errs)
		})
	}
}
