package resolver

import (
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
)

// idTargets declares the workflow types the addressed-send cases send to.
const idTargets = `
workflow ShipItem(order: Order, item: Item):
    id_scheme: "ship-{order.id}-{item.id}"
    signal Shipped(trackingId: string):
        shipped = true
    activity Ship(order, item)

workflow Plain(x: X):
    signal Poke():
        poked = true
    activity Do(x)

activity Ship(order: Order, item: Item):
    ship(order, item)

activity Do(x: X):
    do(x)
`

func TestAddressedSendResolves(t *testing.T) {
	input := `workflow Sender(event: Event, wid: string, rid: string):
    signal ShipItem.Shipped(event.tracking)
        id: "ship-{event.orderId}-{event.sku}"
    signal ShipItem.Shipped("recovered")
        id: wid
        run_id: rid
    signal Plain.Poke()
        id: wid
` + idTargets
	file := mustParse(t, input)
	if errs := Resolve(file); len(errs) > 0 {
		t.Fatalf("unexpected errors: %v", errs)
	}
	for _, st := range file.Definitions[0].(*ast.WorkflowDef).Body {
		send := st.(*ast.SignalSendStmt)
		if send.Head.Kind != ast.SendHeadType || send.Target() == nil {
			t.Errorf("send %s.%s did not resolve to a type: %+v", send.Head.Type.Name, send.Signal, send.Head)
		}
	}
}

// TestIDResolveDiagnostics covers every resolve-level code from the ID-scheme
// spec, plus the existing undefined-reference codes on a type head.
func TestIDResolveDiagnostics(t *testing.T) {
	tests := []struct {
		name     string
		body     string
		kind     ErrorKind
		severity string
	}{
		{"type head without id", `
    signal ShipItem.Shipped(t)`, ErrTypeNeedsID, ""},
		{"handle head with id", `
    promise ship <- workflow ShipItem(o, i)
    signal ship.Shipped(t)
        id: wid`, ErrHandleTakesNoID, ""},
		{"literal on a type with no scheme", `
    signal Plain.Poke()
        id: "plain-{a}"`, ErrNoIDScheme, ""},
		{"literal fixed text differs", `
    signal ShipItem.Shipped(t)
        id: "shp-{a}-{b}"`, ErrIDMirrorMismatch, ""},
		{"literal hole count differs", `
    signal ShipItem.Shipped(t)
        id: "ship-{a}"`, ErrIDMirrorMismatch, ""},
		{"literal copied from the scheme", `
    signal ShipItem.Shipped(t)
        id: "ship-{order.id}-{item.id}"`, ErrMirrorCopiedFromScheme, "hint"},
		{"undefined type head", `
    signal Missing.Shipped(t)
        id: wid`, ErrUndefinedWorkflow, ""},
		{"undefined signal on a type head", `
    signal ShipItem.Lost(t)
        id: wid`, ErrUndefinedSignal, ""},
		{"parent as a promise", `
    promise parent <- workflow Plain(a)`, ErrReservedName, ""},
		{"parent as a binding", `
    activity Do(a) -> parent`, ErrReservedName, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			file := mustParse(t, "workflow Sender(a: A, wid: string):"+tt.body+"\n"+idTargets)
			for _, e := range Resolve(file) {
				if e.Kind == tt.kind && e.Severity == tt.severity {
					return
				}
			}
			t.Fatalf("expected %s (severity %q)", tt.kind, tt.severity)
		})
	}
}

func TestReservedNameDeclarations(t *testing.T) {
	for name, input := range map[string]string{
		"workflow param": `workflow W(parent: P):
    activity Do(parent)
`,
		"handler param": `workflow W(x: X):
    signal S(parent: P):
        x = parent
    activity Do(x)
`,
		"condition": `workflow W(x: X):
    state:
        condition parent
    activity Do(x)
`,
	} {
		t.Run(name, func(t *testing.T) {
			for _, e := range Resolve(mustParse(t, input)) {
				if e.Kind == ErrReservedName {
					return
				}
			}
			t.Fatal("expected RESERVED_NAME")
		})
	}
}

func TestHandleShadowsSameNamedType(t *testing.T) {
	input := `workflow Sender(o: Order, i: Item):
    promise ShipItem <- workflow ShipItem(o, i)
    signal ShipItem.Shipped(t)
` + idTargets
	file := mustParse(t, input)
	if errs := Resolve(file); len(errs) > 0 {
		t.Fatalf("unexpected errors: %v", errs)
	}
	send := file.Definitions[0].(*ast.WorkflowDef).Body[1].(*ast.SignalSendStmt)
	if send.Head.Kind != ast.SendHeadHandle || send.Head.Handle.Resolved == nil {
		t.Errorf("expected the in-scope handle to win, got %+v", send.Head)
	}
}

func TestExternalTypeHeadCarriedUnchecked(t *testing.T) {
	input := `package billing

import "acme/shipping"

workflow Sender(wid: string):
    signal shipping.ShipItem.Shipped(t)
        id: wid
`
	file := mustParse(t, input)
	for _, e := range Resolve(file) {
		if e.Severity != "warning" {
			t.Fatalf("external head should produce no error, got %v", e)
		}
	}
	send := file.Definitions[0].(*ast.WorkflowDef).Body[0].(*ast.SignalSendStmt)
	if !send.Head.External || send.Head.Type.Resolved != nil {
		t.Errorf("expected an external, unresolved head, got %+v", send.Head)
	}
}
