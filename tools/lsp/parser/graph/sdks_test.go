package graph

import (
	"fmt"
	"reflect"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/parser"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/resolver"
)

// TestNodeSDKs: a worker node carries its worker's `@sdk` set, and so does
// every node it hosts; an orphan definition and a worker with no `@sdk` carry
// none.
func TestNodeSDKs(t *testing.T) {
	file, errs := parser.ParseFileAll(`@sdk(go, "cmd/orders/main.go")
@sdk(typescript)
worker orders:
	workflow Place
	activity Charge
	nexus service Orders

@sdk(python)
worker idle:
	activity Charge

worker plain:
	activity Notify

workflow Place():
	activity Charge()

workflow Lost():
	activity Charge()

activity Charge():
	return x

activity Notify():
	return x

nexus service Orders:
	sync Get() -> (R):
		return x

namespace shop:
	worker orders
		options:
			task_queue: "orders"
	worker plain
		options:
			task_queue: "plain"
`)
	if len(errs) > 0 {
		t.Fatalf("parse: %v", errs)
	}
	resolver.Resolve(file)
	g := Extract(file)

	both := []ast.SDKJSON{{SDK: "go", Impl: "cmd/orders/main.go"}, {SDK: "typescript"}}
	want := map[string][]ast.SDKJSON{
		"worker:orders/namespace:shop":                           both,
		"workflow:Place/worker:orders/namespace:shop":            both,
		"activity:Charge/worker:orders/namespace:shop":           both,
		"nexusService:Orders/worker:orders/namespace:shop":       both,
		"nexusOperation:Orders.Get/worker:orders/namespace:shop": both,
		"worker:idle/orphan":                                     {{SDK: "python"}},
		"worker:plain/namespace:shop":                            nil,
		"activity:Notify/worker:plain/namespace:shop":            nil,
		"workflow:Lost/orphan":                                   nil,
	}
	for id, sdks := range want {
		n := g.node(id)
		if n == nil {
			t.Errorf("no node %s", id)
			continue
		}
		if !reflect.DeepEqual(n.SDKs, sdks) {
			t.Errorf("%s SDKs = %v, want %v", id, n.SDKs, sdks)
		}
	}
}

// TestSDKCrossings: activity, workflow and Nexus call and signal-send edges
// between disjoint declared SDK sets cross; a call within one SDK and a call to a worker with no
// `@sdk` do not.
func TestSDKCrossings(t *testing.T) {
	file, errs := parser.ParseFileAll(`workflow W():
	activity A()
	workflow C()
	nexus Ep Svc.Op()
	activity Same()
	activity Plain()
	promise c <- workflow C()
	signal c.Go()
	close complete()

activity A():
	default_options:
		task_queue: "py"
	return x

activity Same():
	return x

activity Plain():
	default_options:
		task_queue: "plain"
	return x

workflow C():
	default_options:
		task_queue: "py"
	signal Go():
		x = 1
	close complete()

nexus service Svc:
	async Op workflow C

@sdk(go)
worker goW:
	workflow W
	activity Same

@sdk(python)
worker pyW:
	activity A
	workflow C
	nexus service Svc

worker plainW:
	activity Plain

namespace ns:
	worker goW
		options:
			task_queue: "go"
	worker pyW
		options:
			task_queue: "py"
	worker plainW
		options:
			task_queue: "plain"
	nexus endpoint Ep
		options:
			task_queue: "py"
`)
	if len(errs) > 0 {
		t.Fatalf("parse: %v", errs)
	}
	resolver.Resolve(file)
	var got []string
	for _, c := range Extract(file).SDKCrossings() {
		got = append(got, fmt.Sprintf("%s %s:%d %v→%v", c.Edge.Kind, c.Caller, c.Edge.Line, c.From, c.To))
	}
	want := []string{
		"activityCall workflow:W:2 [go]→[python]",
		"nexusCall workflow:W:4 [go]→[python]",
		"signalSend workflow:W:8 [go]→[python]",
		"workflowCall workflow:W:3 [go]→[python]",
		"workflowCall workflow:W:7 [go]→[python]",
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("SDKCrossings:\n got  %v\n want %v", got, want)
	}
}
