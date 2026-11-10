package graph

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"reflect"
	"slices"
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

var update = flag.Bool("update", false, "rewrite testdata/cross_sdk.{graph,crossings}.json")

// TestSDKCrossings: activity, workflow and Nexus call and signal-send edges
// between disjoint declared SDK sets cross; a call within one SDK and a call to
// a worker with no `@sdk` do not. The fixture's graph and its crossings, one
// `[from, to, kind]` per edge pair, are committed beside it for the
// visualizer's copy of the rule (`src/adapter/sdk.test.ts`) to check against.
func TestSDKCrossings(t *testing.T) {
	g := loadFixture(t, "testdata/cross_sdk.twf")
	var got []string
	var pairs [][3]string
	for _, c := range g.SDKCrossings() {
		got = append(got, fmt.Sprintf("%s %s:%d %v→%v", c.Edge.Kind, c.Caller, c.Edge.Line, c.From, c.To))
		pair := [3]string{c.Edge.From, c.Edge.To, c.Edge.Kind}
		if !slices.Contains(pairs, pair) {
			pairs = append(pairs, pair)
		}
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
	golden(t, "testdata/cross_sdk.graph.json", g)
	golden(t, "testdata/cross_sdk.crossings.json", pairs)
}

// golden checks v's indented JSON against path, or writes it there under -update.
func golden(t *testing.T, path string, v any) {
	t.Helper()
	got, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	got = append(got, '\n')
	if *update {
		if err := os.WriteFile(path, got, 0o644); err != nil {
			t.Fatal(err)
		}
		return
	}
	want, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("%v (run with -update)", err)
	}
	if !bytes.Equal(got, want) {
		t.Errorf("%s is stale: run `go test ./parser/graph -run TestSDKCrossings -update`", path)
	}
}
