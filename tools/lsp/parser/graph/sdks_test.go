package graph

import (
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
