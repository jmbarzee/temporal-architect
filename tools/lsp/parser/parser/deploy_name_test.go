package parser

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
)

func TestParseTemplatedNamespaceName(t *testing.T) {
	input := `namespace fabric-shard-{org}:
    nexus endpoint fabric-shard-{org}-BootstrapShard
`
	file, err := ParseFile(input)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	ns := file.Definitions[0].(*ast.NamespaceDef)
	if ns.Name != "fabric-shard-{org}" {
		t.Errorf("namespace name = %q, want %q", ns.Name, "fabric-shard-{org}")
	}
	if !reflect.DeepEqual(ns.TemplateParams, []string{"org"}) {
		t.Errorf("namespace TemplateParams = %v, want [org]", ns.TemplateParams)
	}
	if len(ns.Endpoints) != 1 {
		t.Fatalf("expected 1 endpoint, got %d", len(ns.Endpoints))
	}
	ep := ns.Endpoints[0]
	if ep.EndpointName != "fabric-shard-{org}-BootstrapShard" {
		t.Errorf("endpoint name = %q, want %q", ep.EndpointName, "fabric-shard-{org}-BootstrapShard")
	}
	if !reflect.DeepEqual(ep.TemplateParams, []string{"org"}) {
		t.Errorf("endpoint TemplateParams = %v, want [org]", ep.TemplateParams)
	}
}

func TestParsePlainHyphenNamespaceName(t *testing.T) {
	input := `namespace fabric-shard:
    nexus endpoint fabric-shard-BootstrapShard
`
	file, err := ParseFile(input)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	ns := file.Definitions[0].(*ast.NamespaceDef)
	if ns.Name != "fabric-shard" {
		t.Errorf("namespace name = %q, want %q", ns.Name, "fabric-shard")
	}
	if len(ns.TemplateParams) != 0 {
		t.Errorf("namespace TemplateParams = %v, want empty", ns.TemplateParams)
	}
	if ns.Endpoints[0].EndpointName != "fabric-shard-BootstrapShard" {
		t.Errorf("endpoint name = %q", ns.Endpoints[0].EndpointName)
	}
}

func TestParseMultipleAndRepeatedHoles(t *testing.T) {
	input := `namespace region-{region}-{org}-{region}:
    nexus endpoint region-{region}-{org}-{region}-Ep
`
	file, err := ParseFile(input)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	ns := file.Definitions[0].(*ast.NamespaceDef)
	if want := []string{"region", "org"}; !reflect.DeepEqual(ns.TemplateParams, want) {
		t.Errorf("TemplateParams = %v, want %v", ns.TemplateParams, want)
	}
}

func TestParseTemplatedNexusCallEndpointRef(t *testing.T) {
	input := `workflow Foo(x: int) -> (Result):
    nexus fabric-shard-{org}-BootstrapShard Svc.Op(card) -> r
`
	file, err := ParseFile(input)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	wf := file.Definitions[0].(*ast.WorkflowDef)
	call := wf.Body[0].(*ast.NexusCall)
	if call.Endpoint.Name != "fabric-shard-{org}-BootstrapShard" {
		t.Errorf("endpoint ref = %q, want %q", call.Endpoint.Name, "fabric-shard-{org}-BootstrapShard")
	}
	if call.Service.Name != "Svc" || call.Operation.Name != "Op" {
		t.Errorf("service.op = %s.%s, want Svc.Op", call.Service.Name, call.Operation.Name)
	}
}

func TestParseTemplatedAwaitNexusTargetRef(t *testing.T) {
	input := `workflow Foo(x: int) -> (Result):
    await nexus fabric-shard-{org}-BootstrapShard Svc.Op(card) -> r
`
	file, err := ParseFile(input)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	wf := file.Definitions[0].(*ast.WorkflowDef)
	await := wf.Body[0].(*ast.AwaitStmt)
	nt, ok := await.Target.(*ast.NexusTarget)
	if !ok {
		t.Fatalf("expected NexusTarget, got %T", await.Target)
	}
	if nt.Endpoint.Name != "fabric-shard-{org}-BootstrapShard" {
		t.Errorf("await nexus endpoint ref = %q", nt.Endpoint.Name)
	}
}

func TestParseNamespaceNameRejectsDot(t *testing.T) {
	input := `namespace fabric.shard:
    nexus endpoint Ep
`
	_, err := ParseFile(input)
	if err == nil {
		t.Fatal("expected parse error for dotted namespace name, got nil")
	}
}

// TestStaticNamespaceJSONByteIdentical asserts a static namespace/endpoint emits
// no templateParams field, so its wire output is byte-identical to before this
// change.
func TestStaticNamespaceJSONByteIdentical(t *testing.T) {
	input := `worker w:
    workflow W

workflow W():
    return x

namespace orders:
    worker w
        options:
            task_queue: "q"
    nexus endpoint OrderEndpoint
        options:
            task_queue: "q"
`
	file, err := ParseFile(input)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	data, err := json.Marshal(file)
	if err != nil {
		t.Fatalf("marshal error: %v", err)
	}
	if strings.Contains(string(data), "templateParams") {
		t.Errorf("static namespace JSON should not contain templateParams, got:\n%s", data)
	}
}

func TestTemplatedNamespaceJSONEmitsParams(t *testing.T) {
	input := `namespace fabric-shard-{org}:
    nexus endpoint fabric-shard-{org}-BootstrapShard
`
	file, err := ParseFile(input)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	data, err := json.Marshal(file)
	if err != nil {
		t.Fatalf("marshal error: %v", err)
	}
	s := string(data)
	if !strings.Contains(s, `"templateParams":["org"]`) {
		t.Errorf("expected templateParams:[\"org\"] in JSON, got:\n%s", s)
	}
}
