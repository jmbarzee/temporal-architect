package validator

import (
	"fmt"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/parser"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/resolver"
)

func hasKind(errs []*Error, kind ErrorKind, severity string) bool {
	for _, e := range errs {
		if e.Kind == kind && e.Severity == severity {
			return true
		}
	}
	return false
}

const parentModel = `
workflow Coordinator(doc: Doc):
	signal Progress(pct: int):
		pct = pct
	workflow Step(doc)

workflow Auditor(doc: Doc):
	workflow Step(doc)

workflow Bystander(doc: Doc):
	signal Progress(pct: int):
		pct = pct
	activity Work(doc)

workflow Step(doc: Doc):
	signal %s.Progress(50)
		id: parent

activity Work(doc: Doc):
	work(doc)
`

func TestParentSendDiagnostics(t *testing.T) {
	t.Run("claimed parent starts the sender", func(t *testing.T) {
		errs := Validate(mustParseAndResolve(t, fmt.Sprintf(parentModel, "Coordinator")))
		if hasKind(errs, ErrNotAParent, "warning") {
			t.Errorf("unexpected NOT_A_PARENT: %v", errs)
		}
		if !hasKind(errs, ErrStarterLacksSignal, "warning") {
			t.Errorf("expected STARTER_LACKS_SIGNAL for Auditor, got %v", errs)
		}
	})
	t.Run("claimed parent never starts the sender", func(t *testing.T) {
		errs := Validate(mustParseAndResolve(t, fmt.Sprintf(parentModel, "Bystander")))
		if !hasKind(errs, ErrNotAParent, "warning") {
			t.Errorf("expected NOT_A_PARENT, got %v", errs)
		}
	})
}

// TestParentSendKeptDeclarations: parent sends relate definitions, so a
// workflow declared twice (DUPLICATE_WORKFLOW) is its first declaration there:
// the dropped Coordinator, which lacks Progress, is not a starter of Step, and
// the dropped Step is not a sender.
func TestParentSendKeptDeclarations(t *testing.T) {
	file, err := parser.ParseFile(`
workflow Coordinator(doc: Doc):
	signal Progress(pct: int):
		pct = pct
	workflow Step(doc)

workflow Coordinator(doc: Doc):
	workflow Step(doc)

workflow Step(doc: Doc):
	signal Coordinator.Progress(50)
		id: parent

workflow Step(doc: Doc):
	signal Coordinator.Progress(50)
		id: parent
`)
	if err != nil {
		t.Fatal(err)
	}
	resolver.Resolve(file)
	errs := Validate(file)
	if hasKind(errs, ErrStarterLacksSignal, "warning") || hasKind(errs, ErrNotAParent, "warning") {
		t.Errorf("a dropped declaration took part in a parent send: %v", errs)
	}
}

// TestParentSendKeptHandlers: a handler declared twice (DUPLICATE_SIGNAL) is
// its first declaration in parent sends, so the child start in the dropped
// Kick does not make Coordinator a starter of Step.
func TestParentSendKeptHandlers(t *testing.T) {
	file, err := parser.ParseFile(`
workflow Coordinator(doc: Doc):
	signal Progress(pct: int):
		pct = pct
	signal Kick():
		pct = 0
	signal Kick():
		workflow Step(doc)
	close complete()

workflow Step(doc: Doc):
	signal Coordinator.Progress(50)
		id: parent
`)
	if err != nil {
		t.Fatal(err)
	}
	resolver.Resolve(file)
	if errs := Validate(file); !hasKind(errs, ErrNotAParent, "warning") {
		t.Errorf("want NOT_A_PARENT: only the dropped Kick starts Step; got %v", errs)
	}
}

// TestParentSendKeptHandlerSender: the sender side of the same rule. An `id:
// parent` send only in Step's dropped Report is not checked, so Coordinator,
// which never starts Step, draws no NOT_A_PARENT.
func TestParentSendKeptHandlerSender(t *testing.T) {
	file, err := parser.ParseFile(`
workflow Coordinator(doc: Doc):
	signal Progress(pct: int):
		pct = pct
	close complete()

workflow Step(doc: Doc):
	signal Report():
		doc = doc
	signal Report():
		signal Coordinator.Progress(50)
			id: parent
	close complete()
`)
	if err != nil {
		t.Fatal(err)
	}
	resolver.Resolve(file)
	if errs := Validate(file); hasKind(errs, ErrNotAParent, "warning") {
		t.Errorf("a send in the dropped Report was checked: %v", errs)
	}
}

func TestIDSchemeOverlap(t *testing.T) {
	model := `
workflow ShipItem(order: Order, item: Item):
	id_scheme: "ship-{order.id}-{item.id}"
	activity Work(order)

workflow ShipOrder(order: Order):
	id_scheme: "ship-{order.id}"
	activity Work(order)

workflow Refund(order: Order):
	id_scheme: "refund-{order.id}"
	activity Work(order)

activity Work(order: Order):
	work(order)

worker W:
	workflow ShipItem
	workflow ShipOrder
	workflow Refund
	activity Work

namespace prod:
	worker W
		options:
			task_queue: "q"
`
	errs := Validate(mustParseAndResolve(t, model))
	var overlaps []string
	for _, e := range errs {
		if e.Kind == ErrIDSchemeOverlap {
			if e.Severity != "hint" {
				t.Errorf("ID_SCHEME_OVERLAP severity = %q, want hint", e.Severity)
			}
			overlaps = append(overlaps, e.Name)
		}
	}
	if len(overlaps) != 1 || overlaps[0] != "ShipOrder" {
		t.Errorf("expected one overlap (ShipItem/ShipOrder), got %v", overlaps)
	}
}

func TestTemplatesOverlap(t *testing.T) {
	tests := []struct {
		a, b string
		want bool
	}{
		{"ship-{a}-{b}", "ship-{a}", true},
		{"ship-{a}", "refund-{a}", false},
		{"rate-limiter", "rate-{x}", true},
		{"rate-limiter", "rate-limiter", true},
		{"a-{x}", "a-", false},
		{"{x}-done", "start-{y}", true},
		{"order-{x}", "order", false},
	}
	for _, tt := range tests {
		if got := templatesOverlap(tt.a, tt.b); got != tt.want {
			t.Errorf("templatesOverlap(%q, %q) = %v, want %v", tt.a, tt.b, got, tt.want)
		}
	}
}
