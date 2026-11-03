package validator

import (
	"fmt"
	"slices"
	"strings"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/parser"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/resolver"
)

// coherenceDefs declares workflows A and B and services SvcA and SvcB, the
// types the coherence cases register.
const coherenceDefs = `nexus service SvcA:
    async OpA workflow A

nexus service SvcB:
    async OpB workflow A

workflow A():
    close complete()

workflow B():
    close complete()
`

// coherenceFile builds a file whose workers all poll queue "q" in namespace ns.
// Each worker is a list of registrations: "A"/"B" are workflows, "SvcA"/"SvcB"
// nexus services.
func coherenceFile(workers ...[]string) string {
	var b strings.Builder
	b.WriteString(coherenceDefs)
	for i, regs := range workers {
		fmt.Fprintf(&b, "\nworker w%d:\n", i+1)
		for _, r := range regs {
			if strings.HasPrefix(r, "Svc") {
				fmt.Fprintf(&b, "    nexus service %s\n", r)
			} else {
				fmt.Fprintf(&b, "    workflow %s\n", r)
			}
		}
	}
	b.WriteString("\nnamespace ns:\n")
	for i := range workers {
		fmt.Fprintf(&b, "    worker w%d\n        options:\n            task_queue: \"q\"\n", i+1)
	}
	return b.String()
}

// coherenceMsgs returns the coherence diagnostics in errs, in order.
func coherenceMsgs(errs []*Error) []string {
	var msgs []string
	for _, e := range errs {
		if e.Kind == ErrTaskQueueMismatch || e.Kind == ErrTaskQueueIdentical {
			msgs = append(msgs, e.Msg)
		}
	}
	return msgs
}

// TestServiceCoherenceAmongNexusPollers: workers on one queue must agree on
// their nexus services only when they register some — a worker with none polls
// no Nexus tasks (#233, 2a). Workflow and activity sets stay strictly compared.
func TestServiceCoherenceAmongNexusPollers(t *testing.T) {
	const (
		types = "workers w%d and w%d on task queue \"q\" in namespace ns have different type sets"
		svcs  = "workers w%d and w%d on task queue \"q\" in namespace ns register different nexus service sets"
		same  = "workers w%d and w%d on task queue \"q\" in namespace ns have identical type sets (redundant)"
	)
	tests := []struct {
		name    string
		workers [][]string
		want    []string
	}{
		{"only one polls nexus", [][]string{{"A", "SvcA"}, {"A"}}, nil},
		{"different services", [][]string{{"A", "SvcA"}, {"A", "SvcB"}}, []string{fmt.Sprintf(svcs, 1, 2)}},
		{"service anchor is first nexus poller", [][]string{{"A"}, {"A", "SvcA"}, {"A", "SvcB"}}, []string{fmt.Sprintf(svcs, 2, 3)}},
		{"identical to an earlier worker", [][]string{{"A"}, {"A", "SvcA"}, {"A", "SvcA"}}, []string{fmt.Sprintf(same, 2, 3)}},
		{"type sets unchanged", [][]string{{"A"}, {"B"}}, []string{fmt.Sprintf(types, 1, 2)}},
		{"type mismatches and a redundant pair", [][]string{{"A"}, {"B"}, {"B"}}, []string{fmt.Sprintf(types, 1, 2), fmt.Sprintf(types, 1, 3), fmt.Sprintf(same, 2, 3)}},
		{"type and service mismatch on one pair", [][]string{{"A", "SvcA"}, {"B", "SvcB"}}, []string{fmt.Sprintf(types, 1, 2), fmt.Sprintf(svcs, 1, 2)}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			errs := Validate(mustParseAndResolve(t, coherenceFile(tt.workers...)))
			if got := coherenceMsgs(errs); !slices.Equal(got, tt.want) {
				t.Errorf("coherence diagnostics:\n got %q\nwant %q", got, tt.want)
			}
		})
	}
}

// accessFile is the proposal's checkout/payments design: workflow Checkout,
// hosted in the given namespaces, calls PayService through PayEndpoint in
// namespace payments, whose options carry the given extra line.
func accessFile(endpointOption string, callerNamespaces ...string) string {
	var b strings.Builder
	b.WriteString(`nexus service PayService:
    async Charge workflow ChargeCard

workflow ChargeCard():
    close complete()

workflow Checkout():
    nexus PayEndpoint PayService.Charge()
    close complete()

worker payTypes:
    workflow ChargeCard
    nexus service PayService

worker shopTypes:
    workflow Checkout
`)
	for _, ns := range callerNamespaces {
		if ns == "payments" {
			continue
		}
		fmt.Fprintf(&b, "\nnamespace %s:\n    worker shopTypes\n        options:\n            task_queue: \"shop\"\n", ns)
	}
	b.WriteString("\nnamespace payments:\n    worker payTypes\n        options:\n            task_queue: \"payments\"\n")
	if slices.Contains(callerNamespaces, "payments") {
		b.WriteString("    worker shopTypes\n        options:\n            task_queue: \"shop\"\n")
	}
	b.WriteString("    nexus endpoint PayEndpoint\n        options:\n            task_queue: \"payments\"\n")
	if endpointOption != "" {
		b.WriteString("            " + endpointOption + "\n")
	}
	return b.String()
}

// callerErrs returns the NEXUS_CALLER_NOT_ALLOWED messages in errs.
func callerErrs(errs []*Error) []string {
	var msgs []string
	for _, e := range errs {
		if e.Kind == ErrNexusCallerNotAllowed {
			msgs = append(msgs, e.Msg)
		}
	}
	return msgs
}

// TestNexusCallerNotAllowed: a nexus call through an endpoint with
// allowed_caller_namespaces must originate only in listed namespaces (#235).
func TestNexusCallerNotAllowed(t *testing.T) {
	notAllowed := func(ns, list string) string {
		return fmt.Sprintf("nexus call through endpoint PayEndpoint originates in namespace %s, which is not in its allowed_caller_namespaces %s", ns, list)
	}
	tests := []struct {
		name    string
		option  string
		callers []string
		want    []string
	}{
		{"listed", `allowed_caller_namespaces: ["orders", "shop"]`, []string{"shop"}, nil},
		{"no policy modelled", "", []string{"shop"}, nil},
		{"empty list allows no caller", `allowed_caller_namespaces: []`, []string{"shop"}, []string{notAllowed("shop", "[]")}},
		{"not listed", `allowed_caller_namespaces: ["orders"]`, []string{"shop"}, []string{notAllowed("shop", `["orders"]`)}},
		{"own namespace must be listed", `allowed_caller_namespaces: ["orders"]`, []string{"payments"}, []string{notAllowed("payments", `["orders"]`)}},
		{"one of two origins", `allowed_caller_namespaces: ["shop"]`, []string{"shop", "staging"}, []string{notAllowed("staging", `["shop"]`)}},
		{"two origins, sorted", `allowed_caller_namespaces: []`, []string{"staging", "shop"}, []string{notAllowed("shop", "[]"), notAllowed("staging", "[]")}},
		{"cloud ID hint", `allowed_caller_namespaces: ["shop.acct1"]`, []string{"shop"}, []string{notAllowed("shop", `["shop.acct1"]`) + `; did you mean "shop"? entries are .twf namespace names, not Cloud namespace IDs`}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			errs := Validate(mustParseAndResolve(t, accessFile(tt.option, tt.callers...)))
			if got := callerErrs(errs); !slices.Equal(got, tt.want) {
				t.Errorf("caller diagnostics:\n got %q\nwant %q", got, tt.want)
			}
		})
	}
}

// TestNexusCallerNotAllowedAttribution: the error lands on the call site and is
// attributed to the calling definition.
func TestNexusCallerNotAllowedAttribution(t *testing.T) {
	file := mustParseAndResolve(t, accessFile(`allowed_caller_namespaces: ["orders"]`, "shop"))
	for _, def := range file.Definitions {
		stamp(def, "", "a.twf")
	}
	for _, e := range Validate(file) {
		if e.Kind != ErrNexusCallerNotAllowed {
			continue
		}
		if e.Line != 8 || e.Column != 5 || e.Name != "Checkout" || e.File != "a.twf" || e.Severity != "" {
			t.Errorf("got %d:%d Name %q File %q Severity %q, want 8:5 Checkout a.twf error", e.Line, e.Column, e.Name, e.File, e.Severity)
		}
		return
	}
	t.Fatal("expected NEXUS_CALLER_NOT_ALLOWED")
}

// TestNexusCallerFamilies: entries match namespace names by spelling,
// {param}s included; there is no pattern matching between a family and a
// concrete name.
func TestNexusCallerFamilies(t *testing.T) {
	file := func(endpointNS, endpoint, list, callerNS string) string {
		return fmt.Sprintf(`nexus service Svc:
    async Op workflow Impl

workflow Impl():
    close complete()

workflow Caller():
    nexus %s Svc.Op()
    close complete()

worker svcTypes:
    workflow Impl
    nexus service Svc

worker callerTypes:
    workflow Caller

namespace %s:
    worker callerTypes
        options:
            task_queue: "c"

namespace %s:
    worker svcTypes
        options:
            task_queue: "q"
    nexus endpoint %s
        options:
            task_queue: "q"
            allowed_caller_namespaces: [%q]
`, endpoint, callerNS, endpointNS, endpoint, list)
	}
	tests := []struct {
		name                           string
		endpointNS, endpoint, list, ns string
		allowed                        bool
	}{
		{"correlated family", "shard-{org}", "shard-{org}-ep", "tenant-{org}", "tenant-{org}", true},
		{"ranging family", "platform", "platform-ep", "tenant-{org}", "tenant-{org}", true},
		{"concrete entry, family caller", "platform", "platform-ep", "tenant-acme", "tenant-{org}", false},
		{"family entry, static caller", "platform", "platform-ep", "tenant-{org}", "tenant-acme", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			errs := Validate(mustParseAndResolve(t, file(tt.endpointNS, tt.endpoint, tt.list, tt.ns)))
			if got := len(callerErrs(errs)) == 0; got != tt.allowed {
				t.Errorf("allowed = %v, want %v: %v", got, tt.allowed, callerErrs(errs))
			}
		})
	}
}

// TestNexusCallerCheckedForExternalService: the allowlist depends only on the
// endpoint and the caller, so a call into a service from an unresolved import
// is still checked.
func TestNexusCallerCheckedForExternalService(t *testing.T) {
	input := `package shop

import "example.com/pay"

workflow Checkout():
    nexus PayEndpoint pay.PayService.Charge()
    close complete()

worker shopTypes:
    workflow Checkout

namespace shop:
    worker shopTypes
        options:
            task_queue: "shop"
    nexus endpoint PayEndpoint
        options:
            task_queue: "payments"
            allowed_caller_namespaces: ["orders"]
`
	errs := Validate(mustParseAndResolve(t, input))
	if len(callerErrs(errs)) != 1 {
		t.Errorf("expected one NEXUS_CALLER_NOT_ALLOWED, got %v", errs)
	}
}

// TestNexusCallerCheckedFromAwaitTarget: a nexus call under await / promise is
// checked like a bare call.
func TestNexusCallerCheckedFromAwaitTarget(t *testing.T) {
	input := strings.Replace(accessFile(`allowed_caller_namespaces: ["orders"]`, "shop"),
		"    nexus PayEndpoint PayService.Charge()\n",
		"    promise p <- nexus PayEndpoint PayService.Charge()\n    await p\n", 1)
	errs := Validate(mustParseAndResolve(t, input))
	if len(callerErrs(errs)) != 1 {
		t.Errorf("expected one NEXUS_CALLER_NOT_ALLOWED, got %v", errs)
	}
}

// TestWorkerRegistersOperationNoCoverageCascade: after the resolver rewrites
// `Svc.OpA` to the whole service, the validator sees Svc as registered.
func TestWorkerRegistersOperationNoCoverageCascade(t *testing.T) {
	file, err := parser.ParseFile(`nexus service Svc:
    async OpA workflow A

workflow A():
    close complete()

worker wa:
    nexus service Svc.OpA
    workflow A

namespace ns:
    worker wa
        options:
            task_queue: "q"
`)
	if err != nil {
		t.Fatal(err)
	}
	resolver.Resolve(file)
	if errs := Validate(file); hasKind(errs, ErrUncoveredService, "warning") {
		t.Errorf("UNCOVERED_SERVICE cascaded: %v", errs)
	}
}

// TestNexusCallerFromSyncOperation: a call in a sync operation body
// originates in the namespaces hosting the enclosing service.
func TestNexusCallerFromSyncOperation(t *testing.T) {
	input := `nexus service Front:
    sync Ask() -> (string):
        nexus PayEndpoint PayService.Charge()
        close complete("ok")

nexus service PayService:
    async Charge workflow ChargeCard

workflow ChargeCard():
    close complete()

worker frontTypes:
    nexus service Front

worker payTypes:
    workflow ChargeCard
    nexus service PayService

namespace front:
    worker frontTypes
        options:
            task_queue: "front"

namespace payments:
    worker payTypes
        options:
            task_queue: "payments"
    nexus endpoint PayEndpoint
        options:
            task_queue: "payments"
            allowed_caller_namespaces: ["orders"]
`
	var found bool
	for _, e := range Validate(mustParseAndResolve(t, input)) {
		if e.Kind == ErrNexusCallerNotAllowed {
			found = true
			if e.Name != "Front" || !strings.Contains(e.Msg, "originates in namespace front") {
				t.Errorf("got Name %q msg %q", e.Name, e.Msg)
			}
		}
	}
	if !found {
		t.Fatal("expected NEXUS_CALLER_NOT_ALLOWED from the sync operation body")
	}
}

// TestNexusCallerUnhostedNotChecked: a caller on no instantiated worker has
// no origin namespace, so its call is not checked (it already warns as
// uncovered).
func TestNexusCallerUnhostedNotChecked(t *testing.T) {
	input := strings.Replace(accessFile(`allowed_caller_namespaces: []`), "worker shopTypes:\n    workflow Checkout\n", "", 1)
	if got := callerErrs(Validate(mustParseAndResolve(t, input))); len(got) != 0 {
		t.Errorf("unhosted caller checked: %q", got)
	}
}

// TestNexusAccessDiagnosticsOrdered: diagnostics follow definition order —
// call sites by their workflow's position, coherence groups by their queue's
// first instantiation — on every run.
func TestNexusAccessDiagnosticsOrdered(t *testing.T) {
	var b strings.Builder
	b.WriteString(`nexus service PayService:
    async Charge workflow ChargeCard

workflow ChargeCard():
    close complete()
`)
	callers := []string{"Zeta", "Alpha", "Mid", "Beta"}
	for _, c := range callers {
		fmt.Fprintf(&b, "\nworkflow %s():\n    nexus PayEndpoint PayService.Charge()\n    close complete()\n", c)
	}
	b.WriteString("\nworker payTypes:\n    workflow ChargeCard\n    nexus service PayService\n\nworker shopTypes:\n")
	for _, c := range callers {
		fmt.Fprintf(&b, "    workflow %s\n", c)
	}
	b.WriteString("\nworker a1:\n    workflow ChargeCard\n\nworker a2:\n    workflow Zeta\n")
	b.WriteString(`
namespace shop:
    worker shopTypes
        options:
            task_queue: "shop"
    worker a1
        options:
            task_queue: "z-queue"
    worker a2
        options:
            task_queue: "z-queue"
    worker a1
        options:
            task_queue: "a-queue"
    worker a2
        options:
            task_queue: "a-queue"

namespace payments:
    worker payTypes
        options:
            task_queue: "payments"
    nexus endpoint PayEndpoint
        options:
            task_queue: "payments"
            allowed_caller_namespaces: []
`)
	input := b.String()
	// Coherence runs before the body walk; within each, source order holds,
	// so every diagnostic's line is greater than the previous one's within its
	// kind: the z-queue group (instantiated first) before the a-queue group,
	// then the callers as declared (Zeta, Alpha, Mid, Beta).
	for run := 0; run < 20; run++ {
		var kinds []ErrorKind
		var lines []int
		for _, e := range Validate(mustParseAndResolve(t, input)) {
			if e.Kind == ErrNexusCallerNotAllowed || e.Kind == ErrTaskQueueMismatch {
				kinds = append(kinds, e.Kind)
				lines = append(lines, e.Line)
			}
		}
		wantKinds := []ErrorKind{ErrTaskQueueMismatch, ErrTaskQueueMismatch, ErrNexusCallerNotAllowed, ErrNexusCallerNotAllowed, ErrNexusCallerNotAllowed, ErrNexusCallerNotAllowed}
		if !slices.Equal(kinds, wantKinds) || !slices.IsSorted(lines[:2]) || !slices.IsSorted(lines[2:]) {
			t.Fatalf("run %d: kinds %v lines %v", run, kinds, lines)
		}
	}
}
