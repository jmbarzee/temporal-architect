package resolver

import (
	"fmt"
	"slices"
	"strings"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/parser"
)

func mustParse(t *testing.T, input string) *ast.File {
	t.Helper()
	file, err := parser.ParseFile(input)
	if err != nil {
		t.Fatalf("unexpected parse error: %v", err)
	}
	return file
}

func TestSuccessfulResolution(t *testing.T) {
	input := `workflow OrderWorkflow(orderId: string) -> (OrderResult):
    signal PaymentReceived(txId: string):
        status = "paid"
    update ChangeAddress(addr: Address) -> (Result):
        address = addr
        return Result{ok: true}

    activity GetOrder(orderId) -> order
    workflow ShipOrder(order) -> shipResult

activity GetOrder(orderId: string) -> (Order):
    return db.get(orderId)

workflow ShipOrder(order: Order) -> (ShipResult):
    return ship(order)
`
	file := mustParse(t, input)
	errs := Resolve(file)
	if len(errs) > 0 {
		for _, e := range errs {
			t.Errorf("unexpected error: %v", e)
		}
		t.FailNow()
	}

	// Verify resolution links.
	wf := file.Definitions[0].(*ast.WorkflowDef)
	actCall := wf.Body[0].(*ast.ActivityCall)
	if actCall.Activity.Resolved == nil {
		t.Error("activity call not resolved")
	} else if actCall.Activity.Resolved.Name != "GetOrder" {
		t.Errorf("activity resolved to %q, expected 'GetOrder'", actCall.Activity.Resolved.Name)
	}

	wfCall := wf.Body[1].(*ast.WorkflowCall)
	if wfCall.Workflow.Resolved == nil {
		t.Error("workflow call not resolved")
	} else if wfCall.Workflow.Resolved.Name != "ShipOrder" {
		t.Errorf("workflow resolved to %q, expected 'ShipOrder'", wfCall.Workflow.Resolved.Name)
	}
}

func TestUndefinedActivity(t *testing.T) {
	input := `workflow Foo(x: int) -> (Result):
    activity NonExistent(x) -> y
`
	file := mustParse(t, input)
	errs := Resolve(file)
	if len(errs) != 1 {
		t.Fatalf("expected 1 error, got %d", len(errs))
	}
	if !strings.Contains(errs[0].Msg, "undefined activity: NonExistent") {
		t.Errorf("unexpected error: %q", errs[0].Msg)
	}
}

func TestUndefinedWorkflow(t *testing.T) {
	input := `workflow Foo(x: int) -> (Result):
    workflow Missing(x) -> y
`
	file := mustParse(t, input)
	errs := Resolve(file)
	if len(errs) != 1 {
		t.Fatalf("expected 1 error, got %d", len(errs))
	}
	if !strings.Contains(errs[0].Msg, "undefined workflow: Missing") {
		t.Errorf("unexpected error: %q", errs[0].Msg)
	}
}

// REMOVED: TestUndefinedSignal - hint statements are no longer supported.
// REMOVED: TestUndefinedUpdate - hint statements are no longer supported.

func TestDuplicateWorkflow(t *testing.T) {
	input := `workflow Foo(x: int) -> (Result):
    return x

workflow Foo(y: int) -> (Result):
    return y
`
	file := mustParse(t, input)
	errs := Resolve(file)
	if len(errs) != 1 {
		t.Fatalf("expected 1 error, got %d", len(errs))
	}
	if !strings.Contains(errs[0].Msg, "duplicate workflow definition: Foo") {
		t.Errorf("unexpected error: %q", errs[0].Msg)
	}
}

func TestDuplicateActivity(t *testing.T) {
	input := `activity Foo(x: int) -> (Result):
    return x

activity Foo(y: int) -> (Result):
    return y
`
	file := mustParse(t, input)
	errs := Resolve(file)
	if len(errs) != 1 {
		t.Fatalf("expected 1 error, got %d", len(errs))
	}
	if !strings.Contains(errs[0].Msg, "duplicate activity definition: Foo") {
		t.Errorf("unexpected error: %q", errs[0].Msg)
	}
}

func TestNestedResolution(t *testing.T) {
	input := `workflow Foo(x: int) -> (Result):
    if (x > 0):
        await all:
            activity Bar(x)
            workflow Baz(x) -> y

activity Bar(x: int) -> (int):
    return x

workflow Baz(x: int) -> (int):
    return x
`
	file := mustParse(t, input)
	errs := Resolve(file)
	if len(errs) > 0 {
		for _, e := range errs {
			t.Errorf("unexpected error: %v", e)
		}
	}
}

// REMOVED: TestSelectCaseResolution - workflow/activity cases in await one are no longer supported.
// await one now only supports timer and nested await all cases.

// REMOVED: TestSelectCaseUndefinedWorkflow - workflow cases in await one are no longer supported.
// await one now only supports timer and nested await all cases.

func TestResolutionInsideForLoop(t *testing.T) {
	input := `workflow Foo(items: []string) -> (Result):
    for (item in items):
        activity Process(item) -> result

activity Process(item: string) -> (Result):
    return item
`
	file := mustParse(t, input)
	errs := Resolve(file)
	if len(errs) > 0 {
		for _, e := range errs {
			t.Errorf("unexpected error: %v", e)
		}
	}
}

func TestResolutionInsideSwitchCase(t *testing.T) {
	input := `workflow Foo(x: string) -> (Result):
    switch (x):
        case "a":
            activity DoA(x)
        else:
            activity DoB(x)

activity DoA(x: string) -> (string):
    return x

activity DoB(x: string) -> (string):
    return x
`
	file := mustParse(t, input)
	errs := Resolve(file)
	if len(errs) > 0 {
		for _, e := range errs {
			t.Errorf("unexpected error: %v", e)
		}
	}
}

func TestMultipleUndefinedErrors(t *testing.T) {
	input := `workflow Foo(x: int) -> (Result):
    activity Missing1(x)
    activity Missing2(x)
    workflow Missing3(x)
`
	file := mustParse(t, input)
	errs := Resolve(file)
	if len(errs) != 3 {
		t.Fatalf("expected 3 errors, got %d", len(errs))
	}
}

// REMOVED: TestHintResolution - hint statements are no longer supported.
// REMOVED: TestHintUndefinedSignal - hint statements are no longer supported.

func TestStructuredOptionsResolution(t *testing.T) {
	input := `workflow Foo(x: int) -> (Result):
    activity Bar(x) -> y
        options:
            start_to_close_timeout: 30s
            retry_policy:
                maximum_attempts: 3
                initial_interval: 1s

    workflow Child(y) -> z
        options:
            workflow_run_timeout: 1h

    return z

activity Bar(x: int) -> (int):
    return x

workflow Child(y: int) -> (int):
    return y
`
	file := mustParse(t, input)
	errs := Resolve(file)
	if len(errs) > 0 {
		for _, e := range errs {
			t.Errorf("unexpected error: %v", e)
		}
	}

	// Verify resolution links still work with structured options.
	wf := file.Definitions[0].(*ast.WorkflowDef)
	actCall := wf.Body[0].(*ast.ActivityCall)
	if actCall.Activity.Resolved == nil {
		t.Error("activity call not resolved")
	}
	if actCall.Options == nil || len(actCall.Options.Entries) != 2 {
		t.Error("expected 2 option entries on activity call")
	}
	wfCall := wf.Body[1].(*ast.WorkflowCall)
	if wfCall.Workflow.Resolved == nil {
		t.Error("workflow call not resolved")
	}
}

func TestWorkerResolution(t *testing.T) {
	input := `workflow ProcessOrder(orderId: string) -> (Result):
    activity ChargePayment(orderId) -> payment
    return Result{payment: payment}

activity ChargePayment(orderId: string) -> (Payment):
    return charge(orderId)

worker orderWorker:
    workflow ProcessOrder
    activity ChargePayment

namespace orders:
    worker orderWorker
        options:
            task_queue: "orderProcessing"
`
	file := mustParse(t, input)
	errs := Resolve(file)
	if len(errs) != 0 {
		for _, e := range errs {
			t.Errorf("unexpected error: %v", e)
		}
	}
}

func TestWorkerUndefinedWorkflow(t *testing.T) {
	input := `activity ChargePayment(orderId: string) -> (Payment):
    return charge(orderId)

worker badWorker:
    workflow NonExistent
    activity ChargePayment
`
	file := mustParse(t, input)
	errs := Resolve(file)
	var found bool
	for _, e := range errs {
		if strings.Contains(e.Msg, "undefined workflow: NonExistent") {
			found = true
		}
	}
	if !found {
		t.Error("expected error about undefined workflow NonExistent")
	}
}

func TestWorkerUndefinedActivity(t *testing.T) {
	input := `workflow ProcessOrder(orderId: string) -> (Result):
    return Result{}

worker badWorker:
    workflow ProcessOrder
    activity NonExistent
`
	file := mustParse(t, input)
	errs := Resolve(file)
	var found bool
	for _, e := range errs {
		if strings.Contains(e.Msg, "undefined activity: NonExistent") {
			found = true
		}
	}
	if !found {
		t.Error("expected error about undefined activity NonExistent")
	}
}

func TestDuplicateWorker(t *testing.T) {
	input := `workflow Foo(x: int) -> (Result):
    return x

worker myWorker:
    workflow Foo

worker myWorker:
    workflow Foo
`
	file := mustParse(t, input)
	errs := Resolve(file)
	var found bool
	for _, e := range errs {
		if strings.Contains(e.Msg, "duplicate worker definition: myWorker") {
			found = true
		}
	}
	if !found {
		t.Error("expected error about duplicate worker definition")
	}
}

func TestDuplicateNamespace(t *testing.T) {
	input := `worker w:
    workflow Foo

workflow Foo(x: int) -> (int):
    return x

namespace myNs:
    worker w
        options:
            task_queue: "q"

namespace myNs:
    worker w
        options:
            task_queue: "q"
`
	file := mustParse(t, input)
	errs := Resolve(file)
	var found bool
	for _, e := range errs {
		if strings.Contains(e.Msg, "duplicate namespace definition: myNs") {
			found = true
		}
	}
	if !found {
		t.Error("expected error about duplicate namespace definition")
	}
}

func TestNamespaceUndefinedWorker(t *testing.T) {
	input := `namespace orders:
    worker nonExistent
        options:
            task_queue: "q"
`
	file := mustParse(t, input)
	errs := Resolve(file)
	var found bool
	for _, e := range errs {
		if strings.Contains(e.Msg, "undefined worker: nonExistent") {
			found = true
		}
	}
	if !found {
		t.Error("expected error about undefined worker nonExistent")
	}
}

func TestNamespaceResolution(t *testing.T) {
	input := `workflow ProcessOrder(orderId: string) -> (Result):
    activity ChargePayment(orderId) -> payment
    return Result{payment: payment}

activity ChargePayment(orderId: string) -> (Payment):
    return charge(orderId)

worker orderWorker:
    workflow ProcessOrder
    activity ChargePayment

namespace orders:
    worker orderWorker
        options:
            task_queue: "orderProcessing"
`
	file := mustParse(t, input)
	errs := Resolve(file)
	if len(errs) != 0 {
		for _, e := range errs {
			t.Errorf("unexpected error: %v", e)
		}
	}
}

func TestHandlerBodyResolution(t *testing.T) {
	input := `workflow Foo(x: int) -> (Result):
    signal Cancel(reason: string):
        activity LogCancel(reason)
    update ChangeAddr(addr: Addr) -> (Result):
        activity ValidateAddr(addr) -> valid
        return Result{ok: valid}

    return Result{}

activity LogCancel(reason: string) -> (int):
    return 0

activity ValidateAddr(addr: string) -> (bool):
    return true
`
	file := mustParse(t, input)
	errs := Resolve(file)
	if len(errs) > 0 {
		for _, e := range errs {
			t.Errorf("unexpected error: %v", e)
		}
		t.FailNow()
	}

	wf := file.Definitions[0].(*ast.WorkflowDef)

	// Check signal body resolution
	sigBody := wf.Signals[0].Body[0].(*ast.ActivityCall)
	if sigBody.Activity.Resolved == nil {
		t.Error("signal body activity call not resolved")
	} else if sigBody.Activity.Resolved.Name != "LogCancel" {
		t.Errorf("resolved to %q, expected 'LogCancel'", sigBody.Activity.Resolved.Name)
	}

	// Check update body resolution
	updBody := wf.Updates[0].Body[0].(*ast.ActivityCall)
	if updBody.Activity.Resolved == nil {
		t.Error("update body activity call not resolved")
	} else if updBody.Activity.Resolved.Name != "ValidateAddr" {
		t.Errorf("resolved to %q, expected 'ValidateAddr'", updBody.Activity.Resolved.Name)
	}
}

// ===== NEXUS RESOLVER TESTS =====

func TestNexusResolutionSuccess(t *testing.T) {
	input := `nexus service OrderService:
    async PlaceOrder workflow ProcessOrder

workflow ProcessOrder(order: Order) -> (Result):
    close complete(Result{})

workflow Caller():
    nexus OrderEndpoint OrderService.PlaceOrder(order) -> result
    close complete(result)

activity Dummy():
    pass()

worker w:
    workflow ProcessOrder
    workflow Caller
    activity Dummy
    nexus service OrderService

namespace ns:
    worker w
        options:
            task_queue: "q"
    nexus endpoint OrderEndpoint
        options:
            task_queue: "q"
`
	file := mustParse(t, input)
	errs := Resolve(file)
	for _, e := range errs {
		t.Errorf("unexpected error: %v (severity: %s)", e, e.Severity)
	}

	// Verify resolution links on NexusCall.
	caller := file.Definitions[2].(*ast.WorkflowDef)
	call := caller.Body[0].(*ast.NexusCall)
	if call.Service.Resolved == nil {
		t.Error("nexus call service not resolved")
	} else if call.Service.Resolved.Name != "OrderService" {
		t.Errorf("resolved service %q, expected 'OrderService'", call.Service.Resolved.Name)
	}
	if call.Operation.Resolved == nil {
		t.Error("nexus call operation not resolved")
	} else if call.Operation.Resolved.Name != "PlaceOrder" {
		t.Errorf("resolved operation %q, expected 'PlaceOrder'", call.Operation.Resolved.Name)
	}
	if call.Endpoint.Resolved == nil {
		t.Error("nexus call endpoint not resolved")
	} else if call.Endpoint.Resolved.EndpointName != "OrderEndpoint" {
		t.Errorf("resolved endpoint %q, expected 'OrderEndpoint'", call.Endpoint.Resolved.EndpointName)
	}
	if call.Endpoint.Resolved.Namespace != "ns" {
		t.Errorf("resolved endpoint namespace %q, expected 'ns'", call.Endpoint.Resolved.Namespace)
	}
}

// findNamespace returns the first NamespaceDef in the file, or nil.
func findNamespace(file *ast.File) *ast.NamespaceDef {
	for _, def := range file.Definitions {
		if ns, ok := def.(*ast.NamespaceDef); ok {
			return ns
		}
	}
	return nil
}

func TestEndpointTaskQueuePopulated(t *testing.T) {
	input := `nexus service OrderService:
    async PlaceOrder workflow ProcessOrder

workflow ProcessOrder(order: Order) -> (Result):
    close complete(Result{})

worker w:
    workflow ProcessOrder
    nexus service OrderService

namespace ns:
    worker w
        options:
            task_queue: "q"
    nexus endpoint OrderEndpoint
        options:
            task_queue: "endpointQueue"
`
	file := mustParse(t, input)
	errs := Resolve(file)
	for _, e := range errs {
		t.Errorf("unexpected error: %v (severity: %s)", e, e.Severity)
	}

	ns := findNamespace(file)
	if ns == nil {
		t.Fatal("no namespace definition found")
	}
	if len(ns.Endpoints) != 1 {
		t.Fatalf("expected 1 endpoint, got %d", len(ns.Endpoints))
	}
	if got := ns.Endpoints[0].TaskQueue; got != "endpointQueue" {
		t.Errorf("endpoint TaskQueue = %q, expected 'endpointQueue'", got)
	}
}

func TestEndpointTaskQueueAbsent(t *testing.T) {
	input := `nexus service OrderService:
    async PlaceOrder workflow ProcessOrder

workflow ProcessOrder(order: Order) -> (Result):
    close complete(Result{})

worker w:
    workflow ProcessOrder
    nexus service OrderService

namespace ns:
    worker w
        options:
            task_queue: "q"
    nexus endpoint OrderEndpoint
`
	file := mustParse(t, input)
	errs := Resolve(file)
	for _, e := range errs {
		t.Errorf("unexpected error: %v (severity: %s)", e, e.Severity)
	}

	ns := findNamespace(file)
	if ns == nil {
		t.Fatal("no namespace definition found")
	}
	if len(ns.Endpoints) != 1 {
		t.Fatalf("expected 1 endpoint, got %d", len(ns.Endpoints))
	}
	if got := ns.Endpoints[0].TaskQueue; got != "" {
		t.Errorf("endpoint TaskQueue = %q, expected empty string", got)
	}
}

func TestNexusDuplicateService(t *testing.T) {
	input := `nexus service Svc:
    async Op workflow W

nexus service Svc:
    async Op workflow W

workflow W():
    close complete(Result{})
`
	file := mustParse(t, input)
	errs := Resolve(file)
	if !hasError(errs, "duplicate nexus service definition: Svc") {
		t.Error("expected error about duplicate nexus service definition")
	}
}

func TestNexusDuplicateEndpoint(t *testing.T) {
	input := `worker w:
    workflow W

workflow W():
    close complete(Result{})

namespace ns1:
    worker w
        options:
            task_queue: "q1"
    nexus endpoint Ep
        options:
            task_queue: "q1"

namespace ns2:
    worker w
        options:
            task_queue: "q2"
    nexus endpoint Ep
        options:
            task_queue: "q2"
`
	file := mustParse(t, input)
	errs := Resolve(file)
	if !hasError(errs, "duplicate nexus endpoint name") {
		t.Error("expected error about duplicate nexus endpoint name")
	}
}

func TestNexusUndefinedEndpoint(t *testing.T) {
	input := `nexus service Svc:
    async Op workflow W

workflow W():
    nexus MissingEndpoint Svc.Op(x) -> result
    close complete(result)

worker w:
    workflow W
    nexus service Svc

namespace ns:
    worker w
        options:
            task_queue: "q"
    nexus endpoint RealEndpoint
        options:
            task_queue: "q"
`
	file := mustParse(t, input)
	errs := Resolve(file)
	if !hasError(errs, "undefined nexus endpoint: MissingEndpoint") {
		t.Error("expected error about undefined nexus endpoint")
	}
}

func TestNexusUndefinedService(t *testing.T) {
	input := `nexus service RealService:
    async Op workflow W

workflow W():
    nexus Ep MissingService.Op(x) -> result
    close complete(result)

worker w:
    workflow W
    nexus service RealService

namespace ns:
    worker w
        options:
            task_queue: "q"
    nexus endpoint Ep
        options:
            task_queue: "q"
`
	file := mustParse(t, input)
	errs := Resolve(file)
	if !hasError(errs, "undefined nexus service: MissingService") {
		t.Error("expected error about undefined nexus service")
	}
}

func TestNexusUndefinedOperation(t *testing.T) {
	input := `nexus service Svc:
    async RealOp workflow W

workflow W():
    nexus Ep Svc.MissingOp(x) -> result
    close complete(result)

worker w:
    workflow W
    nexus service Svc

namespace ns:
    worker w
        options:
            task_queue: "q"
    nexus endpoint Ep
        options:
            task_queue: "q"
`
	file := mustParse(t, input)
	errs := Resolve(file)
	if !hasError(errs, "nexus service Svc has no operation MissingOp") {
		t.Error("expected error about missing operation")
	}
}

func TestNexusDetachWithResult(t *testing.T) {
	// The parser itself rejects detach nexus with a result binding.
	input := `workflow W():
    detach nexus Ep Svc.Op(x) -> result
`
	_, err := parser.ParseFile(input)
	if err == nil {
		t.Fatal("expected parse error for detach nexus with result")
	}
	if !strings.Contains(err.Error(), "detach nexus call cannot have a result") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestNexusAsyncUndefinedWorkflow(t *testing.T) {
	input := `nexus service Svc:
    async Op workflow MissingWorkflow

workflow W():
    close complete(Result{})
`
	file := mustParse(t, input)
	errs := Resolve(file)
	if !hasError(errs, "async operation Op references undefined workflow: MissingWorkflow") {
		t.Error("expected error about async op referencing undefined workflow")
	}
}

func TestNexusWorkerUndefinedService(t *testing.T) {
	input := `workflow W():
    close complete(Result{})

worker w:
    workflow W
    nexus service MissingService
`
	file := mustParse(t, input)
	errs := Resolve(file)
	if !hasError(errs, "undefined nexus service: MissingService") {
		t.Error("expected error about worker referencing undefined nexus service")
	}
}

// TestNexusCallNoEndpointsDefined: with the #31 nexus cliff removed (issue #109),
// an endpoint that is defined nowhere is a hard undefined-endpoint error — no
// more "may be external" warning. External is now expressed by an unresolved
// import, not inferred from an empty endpoint set.
func TestNexusCallNoEndpointsDefined(t *testing.T) {
	input := `workflow W():
    nexus Ep Svc.Op(x) -> result
    close complete(result)
`
	file := mustParse(t, input)
	errs := Resolve(file)
	if !hasError(errs, "undefined nexus endpoint: Ep") {
		t.Error("expected hard error about undefined endpoint (cliff removed)")
	}
}

// TestNexusCallNoServicesDefined: likewise, an unqualified service defined
// nowhere (and with no import declaring it external) is a hard
// undefined-service error, not a warning.
func TestNexusCallNoServicesDefined(t *testing.T) {
	input := `workflow W():
    nexus Ep Svc.Op(x) -> result
    close complete(result)
`
	file := mustParse(t, input)
	errs := Resolve(file)
	if !hasError(errs, "undefined nexus service: Svc") {
		t.Error("expected hard error about undefined service (cliff removed)")
	}
}

// ===== PRIORITY SCHEMA TESTS =====

func TestPriorityNestedSchema(t *testing.T) {
	input := `workflow Foo(x: int) -> (int):
    activity Bar(x) -> y
        options:
            priority:
                priority_key: 1
                fairness_key: "high"
                fairness_weight: 9.0
    return y

activity Bar(x: int) -> (int):
    return x
`
	file := mustParse(t, input)
	errs := Resolve(file)
	if len(errs) > 0 {
		for _, e := range errs {
			t.Errorf("unexpected error: %v", e)
		}
	}
}

func TestNexusEndpointResolutionOnAwaitAndPromise(t *testing.T) {
	input := `nexus service Svc:
    async Op workflow W

workflow W():
    close complete(Result{})

workflow Caller():
    await nexus Ep Svc.Op(x) -> result
    promise p <- nexus Ep Svc.Op(x)
    close complete(result)

activity Dummy():
    pass()

worker w:
    workflow W
    workflow Caller
    activity Dummy
    nexus service Svc

namespace ns:
    worker w
        options:
            task_queue: "q"
    nexus endpoint Ep
        options:
            task_queue: "q"
`
	file := mustParse(t, input)
	errs := Resolve(file)
	for _, e := range errs {
		t.Errorf("unexpected error: %v (severity: %s)", e, e.Severity)
	}

	caller := file.Definitions[2].(*ast.WorkflowDef)

	// Check await nexus resolution.
	awaitStmt := caller.Body[0].(*ast.AwaitStmt)
	awaitNexus, ok := awaitStmt.Target.(*ast.NexusTarget)
	if !ok {
		t.Fatalf("expected NexusTarget, got %T", awaitStmt.Target)
	}
	if awaitNexus.Endpoint.Resolved == nil {
		t.Error("await nexus endpoint not resolved")
	} else if awaitNexus.Endpoint.Resolved.EndpointName != "Ep" {
		t.Errorf("await resolved endpoint %q, expected 'Ep'", awaitNexus.Endpoint.Resolved.EndpointName)
	}
	if awaitNexus.Service.Resolved == nil {
		t.Error("await nexus service not resolved")
	}
	if awaitNexus.Operation.Resolved == nil {
		t.Error("await nexus operation not resolved")
	}
	if awaitNexus.Endpoint.Resolved.Namespace != "ns" {
		t.Errorf("await resolved endpoint namespace %q, expected 'ns'", awaitNexus.Endpoint.Resolved.Namespace)
	}

	// Check promise nexus resolution.
	promiseStmt := caller.Body[1].(*ast.PromiseStmt)
	promiseNexus, ok := promiseStmt.Target.(*ast.NexusTarget)
	if !ok {
		t.Fatalf("expected NexusTarget, got %T", promiseStmt.Target)
	}
	if promiseNexus.Endpoint.Resolved == nil {
		t.Error("promise nexus endpoint not resolved")
	} else if promiseNexus.Endpoint.Resolved.EndpointName != "Ep" {
		t.Errorf("promise resolved endpoint %q, expected 'Ep'", promiseNexus.Endpoint.Resolved.EndpointName)
	}
	if promiseNexus.Service.Resolved == nil {
		t.Error("promise nexus service not resolved")
	}
	if promiseNexus.Operation.Resolved == nil {
		t.Error("promise nexus operation not resolved")
	}
}

func TestWorkerRefResolution(t *testing.T) {
	input := `workflow ProcessOrder(orderId: string) -> (Result):
    activity ChargePayment(orderId) -> payment
    return Result{payment: payment}

activity ChargePayment(orderId: string) -> (Payment):
    return charge(orderId)

nexus service OrderService:
    async PlaceOrder workflow ProcessOrder

worker orderWorker:
    workflow ProcessOrder
    activity ChargePayment
    nexus service OrderService

namespace orders:
    worker orderWorker
        options:
            task_queue: "orderProcessing"
    nexus endpoint OrderEndpoint
        options:
            task_queue: "orderProcessing"
`
	file := mustParse(t, input)
	errs := Resolve(file)
	if len(errs) != 0 {
		for _, e := range errs {
			t.Errorf("unexpected error: %v", e)
		}
	}

	// Verify WorkerRef resolution links.
	worker := file.Definitions[3].(*ast.WorkerDef)
	if worker.Name != "orderWorker" {
		t.Fatalf("expected worker 'orderWorker', got %q", worker.Name)
	}

	// Workflow ref should resolve to ProcessOrder.
	if len(worker.Workflows) != 1 {
		t.Fatalf("expected 1 workflow ref, got %d", len(worker.Workflows))
	}
	wfRef := worker.Workflows[0]
	if wfRef.Resolved == nil {
		t.Error("workflow ref not resolved")
	} else if wfRef.Resolved.Name != "ProcessOrder" {
		t.Errorf("workflow ref resolved to %q, expected 'ProcessOrder'", wfRef.Resolved.Name)
	}

	// Activity ref should resolve to ChargePayment.
	if len(worker.Activities) != 1 {
		t.Fatalf("expected 1 activity ref, got %d", len(worker.Activities))
	}
	actRef := worker.Activities[0]
	if actRef.Resolved == nil {
		t.Error("activity ref not resolved")
	} else if actRef.Resolved.Name != "ChargePayment" {
		t.Errorf("activity ref resolved to %q, expected 'ChargePayment'", actRef.Resolved.Name)
	}

	// Service ref should resolve to OrderService.
	if len(worker.Services) != 1 {
		t.Fatalf("expected 1 service ref, got %d", len(worker.Services))
	}
	svcRef := worker.Services[0]
	if svcRef.Resolved == nil {
		t.Error("service ref not resolved")
	} else if svcRef.Resolved.Name != "OrderService" {
		t.Errorf("service ref resolved to %q, expected 'OrderService'", svcRef.Resolved.Name)
	}
}

func TestNamespaceWorkerResolution(t *testing.T) {
	input := `workflow Foo(x: int) -> (int):
    return x

worker myWorker:
    workflow Foo

namespace myNs:
    worker myWorker
        options:
            task_queue: "q"
`
	file := mustParse(t, input)
	errs := Resolve(file)
	if len(errs) != 0 {
		for _, e := range errs {
			t.Errorf("unexpected error: %v", e)
		}
	}

	// Verify NamespaceWorker resolution link.
	ns := file.Definitions[2].(*ast.NamespaceDef)
	if ns.Name != "myNs" {
		t.Fatalf("expected namespace 'myNs', got %q", ns.Name)
	}
	if len(ns.Workers) != 1 {
		t.Fatalf("expected 1 worker in namespace, got %d", len(ns.Workers))
	}

	nw := ns.Workers[0]
	if nw.Worker.Resolved == nil {
		t.Error("namespace worker not resolved")
	} else if nw.Worker.Resolved.Name != "myWorker" {
		t.Errorf("namespace worker resolved to %q, expected 'myWorker'", nw.Worker.Resolved.Name)
	}
}

func TestSignalSendResolution(t *testing.T) {
	input := `workflow OrderSaga(order):
    promise pay <- workflow ProcessPayment(order)
    signal pay.OrderShipped(shipmentId)

workflow ProcessPayment(order):
    signal OrderShipped(id):
        shipped = true
`
	file := mustParse(t, input)
	errs := Resolve(file)
	if len(errs) > 0 {
		for _, e := range errs {
			t.Errorf("unexpected error: %v", e)
		}
		t.FailNow()
	}
	wf := file.Definitions[0].(*ast.WorkflowDef)
	send := wf.Body[1].(*ast.SignalSendStmt)
	if send.Head.Handle.Resolved == nil {
		t.Fatal("signal-send handle not resolved")
	}
	if send.Head.Handle.Resolved.Name != "pay" {
		t.Errorf("handle resolved to %q, expected 'pay'", send.Head.Handle.Resolved.Name)
	}
}

func TestSignalSendHandleNotWorkflow(t *testing.T) {
	input := `workflow Foo(x):
    promise t <- timer(5m)
    signal t.Something(x)
`
	file := mustParse(t, input)
	errs := Resolve(file)
	if len(errs) != 1 {
		t.Fatalf("expected 1 error, got %d", len(errs))
	}
	if errs[0].Kind != ErrSignalSendHandleNotWorkflow {
		t.Errorf("expected ErrSignalSendHandleNotWorkflow, got %v", errs[0].Kind)
	}
	if !strings.Contains(errs[0].Msg, "not a workflow-bound promise") {
		t.Errorf("unexpected error: %q", errs[0].Msg)
	}
}

func TestSignalSendUndefinedSignal(t *testing.T) {
	input := `workflow OrderSaga(order):
    promise pay <- workflow ProcessPayment(order)
    signal pay.NopeSignal(x)

workflow ProcessPayment(order):
    return done
`
	file := mustParse(t, input)
	errs := Resolve(file)
	if len(errs) != 1 {
		t.Fatalf("expected 1 error, got %d", len(errs))
	}
	if errs[0].Kind != ErrSignalSendUndefinedSignal {
		t.Errorf("expected ErrSignalSendUndefinedSignal, got %v", errs[0].Kind)
	}
	if !strings.Contains(errs[0].Msg, "is not declared by workflow ProcessPayment") {
		t.Errorf("unexpected error: %q", errs[0].Msg)
	}
}

func TestSignalSendUndefinedHandle(t *testing.T) {
	input := `workflow Foo(x):
    log(start)
    signal ghost.Something(x)
`
	file := mustParse(t, input)
	errs := Resolve(file)
	if len(errs) != 1 {
		t.Fatalf("expected 1 error, got %d", len(errs))
	}
	if errs[0].Kind != ErrUndefinedPromiseOrCondition {
		t.Errorf("expected ErrUndefinedPromiseOrCondition, got %v", errs[0].Kind)
	}
}

func TestSignalSendTargetWorkflowUndefined(t *testing.T) {
	// The target workflow name is itself undefined: the promise's own
	// resolution reports it; signal-send resolution must degrade gracefully
	// (no duplicate, no panic) and leave the handle unresolved.
	input := `workflow Foo(order):
    promise pay <- workflow Missing(order)
    signal pay.OrderShipped(x)
`
	file := mustParse(t, input)
	errs := Resolve(file)
	if len(errs) != 1 {
		t.Fatalf("expected 1 error, got %d", len(errs))
	}
	if errs[0].Kind != ErrUndefinedWorkflow {
		t.Errorf("expected ErrUndefinedWorkflow, got %v", errs[0].Kind)
	}
	wf := file.Definitions[0].(*ast.WorkflowDef)
	send := wf.Body[1].(*ast.SignalSendStmt)
	if send.Head.Handle.Resolved != nil {
		t.Error("handle should remain unresolved when target workflow is undefined")
	}
}

// hasError checks if any non-warning error contains the given substring.
func hasError(errs []*ResolveError, substr string) bool {
	for _, e := range errs {
		if e.Severity != "warning" && strings.Contains(e.Msg, substr) {
			return true
		}
	}
	return false
}

// hasWarning checks if any warning contains the given substring.
func hasWarning(errs []*ResolveError, substr string) bool {
	for _, e := range errs {
		if e.Severity == "warning" && strings.Contains(e.Msg, substr) {
			return true
		}
	}
	return false
}

// TestDiagnosticOrder pins Resolve's output to file, line, column, then code
// order. Namespaces and workers are walked from maps, so without the final sort
// this order changes from run to run (issue #237).
func TestDiagnosticOrder(t *testing.T) {
	const n = 8
	var b strings.Builder
	for i := range n {
		fmt.Fprintf(&b, "worker w%d:\n    workflow Missing%d\n\n", i, i)
	}
	for i := range n {
		fmt.Fprintf(&b, "namespace ns%d:\n    worker ghost%d\n\n", i, i)
	}
	for run := range 20 {
		var got []string
		var lines []int
		for _, e := range Resolve(mustParse(t, b.String())) {
			got = append(got, fmt.Sprintf("%d:%d %s", e.Line, e.Column, e.Code()))
			lines = append(lines, e.Line)
		}
		if len(lines) != 2*n || !slices.IsSorted(lines) {
			t.Fatalf("run %d: diagnostics not in source order: %q", run, got)
		}
	}
}

// TestDuplicateEndpointDefinitionOrder: namespaces are walked in definition
// order — files in input order, then position — so the first declaration of an
// endpoint name keeps it: a nexus call resolves to it, and a DUPLICATE_ENDPOINT
// lands on each later one, naming the first's namespace, in the same file a
// DUPLICATE_WORKFLOW does. Repeated so map order cannot pass by luck.
func TestDuplicateEndpointDefinitionOrder(t *testing.T) {
	b := `namespace nc:
    nexus endpoint e
        options:
            task_queue: "q"

namespace na:
    nexus endpoint e
        options:
            task_queue: "q"

workflow Dup():
    close complete()
`
	a := `nexus service S:
    sync Op() -> ():
        close complete()

workflow W():
    nexus e S.Op()
    close complete()

namespace nd:
    nexus endpoint e
        options:
            task_queue: "q"

namespace nb:
    nexus endpoint e
        options:
            task_queue: "q"

workflow Dup():
    close complete()
`
	want := []string{
		`a.twf:10:5 duplicate nexus endpoint name "e": defined in namespace nc and namespace nd`,
		`a.twf:15:5 duplicate nexus endpoint name "e": defined in namespace nc and namespace nb`,
		`a.twf:19:1 duplicate workflow definition: Dup (first at b.twf:11)`,
		`b.twf:7:5 duplicate nexus endpoint name "e": defined in namespace nc and namespace na`,
	}
	for range 50 {
		file := ast.Stamp([]ast.StampInput{
			{File: mustParse(t, b), SourceFile: "b.twf"},
			{File: mustParse(t, a), SourceFile: "a.twf"},
		})
		var got []string
		for _, e := range Resolve(file) {
			if e.Kind == ErrDuplicateEndpoint || e.Kind == ErrDuplicateWorkflow {
				got = append(got, fmt.Sprintf("%s:%d:%d %s", e.File, e.Line, e.Column, e.Msg))
			}
		}
		if !slices.Equal(got, want) {
			t.Fatalf("duplicates:\n got  %s\n want %s", strings.Join(got, "\n      "), strings.Join(want, "\n      "))
		}
		call := file.Definitions[4].(*ast.WorkflowDef).Body[0].(*ast.NexusCall)
		if ep := call.Endpoint.Resolved; ep == nil || ep.Namespace != "nc" {
			t.Fatalf("nexus e resolved to %+v, want the endpoint in namespace nc", ep)
		}
	}
}

// TestDuplicateKeepsFirst: a name declared twice in one package keeps its first
// declaration, in definition order (input files in order, then position): a
// reference resolves to it, and the DUPLICATE_* error lands on the later one
// and says where the first is. b.twf is input before a.twf, so the first is
// not in the alphabetically first file. Repeated so map order cannot pass by
// luck.
func TestDuplicateKeepsFirst(t *testing.T) {
	caller := func(f *ast.File) *ast.WorkflowDef {
		for _, d := range f.Definitions {
			if wf, ok := d.(*ast.WorkflowDef); ok && wf.Name == "Caller" {
				return wf
			}
		}
		return nil
	}
	tests := []struct {
		kind    string
		errKind ErrorKind
		// decl declares X; use references it.
		decl, use string
		// resolved is what use's reference resolved to. want is what the first
		// declaration gives it, when that is not the declaration itself.
		resolved func(*ast.File) ast.Node
		want     func(first ast.Definition) ast.Node
	}{
		{
			kind: "workflow", errKind: ErrDuplicateWorkflow,
			decl: "workflow X():\n    close complete()\n",
			use:  "workflow Caller():\n    workflow X()\n    close complete()\n",
			resolved: func(f *ast.File) ast.Node {
				return caller(f).Body[0].(*ast.WorkflowCall).Workflow.Resolved
			},
		},
		{
			kind: "activity", errKind: ErrDuplicateActivity,
			decl: "activity X(x: X) -> (X):\n    return x\n",
			use:  "workflow Caller(x: X):\n    activity X(x) -> r\n    close complete(r)\n",
			resolved: func(f *ast.File) ast.Node {
				return caller(f).Body[0].(*ast.ActivityCall).Activity.Resolved
			},
		},
		{
			kind: "worker", errKind: ErrDuplicateWorker,
			decl: "worker X:\n    workflow W\n",
			use:  "workflow W():\n    close complete()\n\nnamespace n:\n    worker X\n        options:\n            task_queue: \"q\"\n",
			resolved: func(f *ast.File) ast.Node {
				return findNamespace(f).Workers[0].Worker.Resolved
			},
		},
		{
			kind: "nexus service", errKind: ErrDuplicateNexusService,
			decl: "nexus service X:\n    sync Op() -> ():\n        close complete()\n",
			use:  "workflow Caller():\n    nexus e X.Op()\n    close complete()\n\nnamespace n:\n    nexus endpoint e\n        options:\n            task_queue: \"q\"\n",
			resolved: func(f *ast.File) ast.Node {
				return caller(f).Body[0].(*ast.NexusCall).Service.Resolved
			},
		},
		{
			// A namespace is referenced through its endpoints.
			kind: "namespace", errKind: ErrDuplicateNamespace,
			decl: "namespace X:\n    nexus endpoint e\n        options:\n            task_queue: \"q\"\n",
			use:  "nexus service S:\n    sync Op() -> ():\n        close complete()\n\nworkflow Caller():\n    nexus e S.Op()\n    close complete()\n",
			resolved: func(f *ast.File) ast.Node {
				return caller(f).Body[0].(*ast.NexusCall).Endpoint.Resolved
			},
			want: func(first ast.Definition) ast.Node {
				return &first.(*ast.NamespaceDef).Endpoints[0]
			},
		},
	}
	type input struct{ src, file string }
	for _, tt := range tests {
		useLines := strings.Count(tt.use, "\n")
		layouts := []struct {
			name   string
			inputs []input
			first  int // index of the first declaration in the merged definitions
			want   string
		}{
			{
				name:   "one file",
				inputs: []input{{tt.use + "\n" + tt.decl + "\n" + tt.decl, "a.twf"}},
				first:  len(mustParse(t, tt.use).Definitions),
				want:   fmt.Sprintf("a.twf:%d:1 duplicate %s definition: X (first at line %d)", useLines+strings.Count(tt.decl, "\n")+3, tt.kind, useLines+2),
			},
			{
				name:   "two files",
				inputs: []input{{tt.decl, "b.twf"}, {tt.use + "\n" + tt.decl, "a.twf"}},
				want:   fmt.Sprintf("a.twf:%d:1 duplicate %s definition: X (first at b.twf:1)", useLines+2, tt.kind),
			},
		}
		for _, l := range layouts {
			t.Run(tt.kind+"/"+l.name, func(t *testing.T) {
				for range 50 {
					var inputs []ast.StampInput
					for _, in := range l.inputs {
						inputs = append(inputs, ast.StampInput{File: mustParse(t, in.src), SourceFile: in.file})
					}
					file := ast.Stamp(inputs)
					var got []string
					for _, e := range Resolve(file) {
						if e.Kind == tt.errKind {
							got = append(got, fmt.Sprintf("%s:%d:%d %s", e.File, e.Line, e.Column, e.Msg))
						}
					}
					if !slices.Equal(got, []string{l.want}) {
						t.Fatalf("duplicates:\n got  %s\n want %s", strings.Join(got, "\n      "), l.want)
					}
					first := file.Definitions[l.first]
					var want ast.Node = first
					if tt.want != nil {
						want = tt.want(first)
					}
					if got := tt.resolved(file); got != want {
						t.Fatalf("reference resolved to %+v, want the first declaration's %+v", got, want)
					}
				}
			})
		}
	}
}

// TestDuplicateNamespaceChecksFirst: a namespace declared twice in one package
// is its first declaration, so the first's workers and endpoints are checked
// and the later one's are not: the undefined worker and the endpoint name it
// shares with m are both the first's.
func TestDuplicateNamespaceChecksFirst(t *testing.T) {
	src := `namespace m:
    nexus endpoint e
        options:
            task_queue: "q"

namespace n:
    worker ghost
        options:
            task_queue: "q"
    nexus endpoint e
        options:
            task_queue: "q"

namespace n:
    worker spook
        options:
            task_queue: "q"
    nexus endpoint f
        options:
            task_queue: "q"
`
	want := []string{
		`7:12 NAMESPACE_UNDEFINED_WORKER namespace n references undefined worker: ghost`,
		`10:5 DUPLICATE_ENDPOINT duplicate nexus endpoint name "e": defined in namespace m and namespace n`,
		`14:1 DUPLICATE_NAMESPACE duplicate namespace definition: n (first at line 6)`,
	}
	for range 50 {
		file := mustParse(t, src)
		var got []string
		for _, e := range Resolve(file) {
			got = append(got, fmt.Sprintf("%d:%d %s %s", e.Line, e.Column, e.Code(), e.Msg))
		}
		if !slices.Equal(got, want) {
			t.Fatalf("errors:\n got  %s\n want %s", strings.Join(got, "\n      "), strings.Join(want, "\n      "))
		}
	}
}
