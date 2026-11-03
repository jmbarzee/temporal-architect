package resolver

import (
	"reflect"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
)

// A static endpoint inside a templated namespace is not a param superset of its
// namespace, so its flat-global name would collide across the family.
func TestEndpointParamNotSuperset(t *testing.T) {
	input := `namespace fabric-shard-{org}:
    nexus endpoint BootstrapShard
        options:
            task_queue: "q"
`
	file := mustParse(t, input)
	errs := Resolve(file)
	if !hasErrorKind(errs, ErrEndpointParamNotSuperset) {
		t.Errorf("expected ENDPOINT_PARAM_NOT_SUPERSET, got %v", errs)
	}
}

// An endpoint whose params are a superset of the namespace's is fine.
func TestEndpointParamSupersetOK(t *testing.T) {
	input := `namespace fabric-shard-{org}:
    nexus endpoint fabric-shard-{org}-BootstrapShard
        options:
            task_queue: "q"
`
	file := mustParse(t, input)
	errs := Resolve(file)
	if hasErrorKind(errs, ErrEndpointParamNotSuperset) {
		t.Errorf("did not expect ENDPOINT_PARAM_NOT_SUPERSET, got %v", errs)
	}
	if hasErrorKind(errs, ErrEndpointTaskQueueTemplated) {
		t.Errorf("did not expect ENDPOINT_TASK_QUEUE_TEMPLATED, got %v", errs)
	}
}

// A {param} in a worker task_queue is an instance parameter, not a name
// parameter to bind: the instantiation is a per-instance family.
func TestWorkerQueueParamIsInstanceParam(t *testing.T) {
	input := `worker w:
    workflow W

workflow W():
    return x

namespace fabric-shard-{org}:
    worker w
        options:
            task_queue: "q-{region}-bootstrap"
`
	file := mustParse(t, input)
	if errs := Resolve(file); len(errs) != 0 {
		t.Errorf("expected no resolve errors, got %v", errs)
	}
	if got := workerParams(file); !reflect.DeepEqual(got, [][]string{{"region"}}) {
		t.Errorf("worker TemplateParams = %v, want [[region]]", got)
	}
}

// A queue parameter spelled like a namespace parameter is still an instance
// parameter: the namespace no longer binds it.
func TestNamespaceSpelledQueueParamIsInstanceParam(t *testing.T) {
	input := `worker w:
    workflow W

workflow W():
    return x

namespace fabric-shard-{org}:
    worker w
        options:
            task_queue: "q-{org}-{org}-bootstrap"
`
	file := mustParse(t, input)
	if errs := Resolve(file); len(errs) != 0 {
		t.Errorf("expected no resolve errors, got %v", errs)
	}
	if got := workerParams(file); !reflect.DeepEqual(got, [][]string{{"org"}}) {
		t.Errorf("worker TemplateParams = %v, want [[org]]", got)
	}
}

// worker_identity is free text: its parameters bind, match and declare nothing.
func TestWorkerIdentityParamsAreFreeText(t *testing.T) {
	input := `worker w:
    workflow W

workflow W():
    return x

namespace ns:
    worker w
        options:
            task_queue: "static"
            worker_identity: "sidecar-{podName}-{a.b}{}"
`
	file := mustParse(t, input)
	if errs := Resolve(file); len(errs) != 0 {
		t.Errorf("expected no resolve errors, got %v", errs)
	}
	if got := workerParams(file); !reflect.DeepEqual(got, [][]string{nil}) {
		t.Errorf("worker TemplateParams = %v, want [[]]", got)
	}
}

// A malformed family queue reports its first broken rule at the option entry,
// and still carries its instance parameters. A queue with no IDENT parameter is
// opaque literal text and never malformed.
func TestQueueTemplateMalformed(t *testing.T) {
	tests := []struct {
		queue  string
		want   string
		params []string
	}{
		{"sandbox{a}{b}", "parameters must be separated by fixed text", []string{"a", "b"}},
		{"q-{x}-{a.b}", "{a.b} is not a parameter name", []string{"x"}},
		{"q-{x}}", "stray or unclosed brace", []string{"x"}},
		{"/_sys/{x}", `fixed text begins with reserved prefix "/_sys/"`, []string{"x"}},
		{"q-{a.b}-{}", "", nil},
	}
	for _, tt := range tests {
		file := mustParse(t, `worker w:
    workflow W

workflow W():
    return x

namespace ns:
    worker w
        options:
            task_queue: "`+tt.queue+`"
`)
		file.Definitions[2].(*ast.NamespaceDef).SourceFile = "ns.twf"
		var want []*ResolveError
		if tt.want != "" {
			want = []*ResolveError{{
				Msg:    `task_queue "` + tt.queue + `" of worker w in namespace ns is not a well-formed template: ` + tt.want,
				Line:   10,
				Column: 13,
				Kind:   ErrQueueTemplateMalformed,
				Name:   "w",
				File:   "ns.twf",
			}}
		}
		if got := Resolve(file); !reflect.DeepEqual(got, want) {
			t.Errorf("%q: resolve errors\n got  %v\n want %v", tt.queue, got, want)
		}
		if got := workerParams(file); !reflect.DeepEqual(got, [][]string{tt.params}) {
			t.Errorf("%q: worker TemplateParams = %v, want [%v]", tt.queue, got, tt.params)
		}
	}
}

// An endpoint targets one static queue: a parameter in its task_queue is an
// error, reported once at its first parameter, whatever the names bind.
func TestEndpointTaskQueueTemplated(t *testing.T) {
	input := `namespace fabric-shard-{org}:
    nexus endpoint fabric-shard-{org}-BootstrapShard
        options:
            task_queue: "q-{org}-{shard}"
`
	file := mustParse(t, input)
	file.Definitions[0].(*ast.NamespaceDef).SourceFile = "ns.twf"
	want := []*ResolveError{{
		Msg:    `task_queue "q-{org}-{shard}" of nexus endpoint fabric-shard-{org}-BootstrapShard in namespace fabric-shard-{org} has a {org} parameter: an endpoint targets one task queue in its namespace`,
		Line:   4,
		Column: 13,
		Kind:   ErrEndpointTaskQueueTemplated,
		Name:   "fabric-shard-{org}-BootstrapShard",
		File:   "ns.twf",
	}}
	if got := Resolve(file); !reflect.DeepEqual(got, want) {
		t.Errorf("resolve errors\n got  %v\n want %v", got, want)
	}
}

// An endpoint queue with no IDENT parameter is opaque and legal.
func TestEndpointOpaqueQueueOK(t *testing.T) {
	input := `namespace ns:
    nexus endpoint Ep
        options:
            task_queue: "q-{a.b}-{}"
`
	if errs := Resolve(mustParse(t, input)); len(errs) != 0 {
		t.Errorf("expected no resolve errors, got %v", errs)
	}
}

// Rule 4: a templated endpoint reference resolves through the existing
// flat-global registry by exact templated-name string.
func TestTemplatedEndpointReferenceResolves(t *testing.T) {
	input := `nexus service Svc:
    async Op workflow W

workflow W():
    nexus fabric-shard-{org}-BootstrapShard Svc.Op(x) -> result
    close complete(result)

worker w:
    workflow W
    nexus service Svc

namespace fabric-shard-{org}:
    worker w
        options:
            task_queue: "q"
    nexus endpoint fabric-shard-{org}-BootstrapShard
        options:
            task_queue: "q"
`
	file := mustParse(t, input)
	errs := Resolve(file)
	for _, e := range errs {
		if e.Severity != "warning" {
			t.Errorf("unexpected error: %v (kind %s)", e, e.Kind)
		}
	}
	if hasError(errs, "undefined nexus endpoint") {
		t.Error("templated endpoint reference should resolve to its definition")
	}
}

// A static reference to a templated endpoint (spelling mismatch) does not resolve.
func TestStaticReferenceToTemplatedEndpointUnresolved(t *testing.T) {
	input := `nexus service Svc:
    async Op workflow W

workflow W():
    nexus BootstrapShard Svc.Op(x) -> result
    close complete(result)

worker w:
    workflow W
    nexus service Svc

namespace fabric-shard-{org}:
    worker w
        options:
            task_queue: "q"
    nexus endpoint fabric-shard-{org}-BootstrapShard
        options:
            task_queue: "q"
`
	file := mustParse(t, input)
	errs := Resolve(file)
	if !hasError(errs, "undefined nexus endpoint: BootstrapShard") {
		t.Errorf("expected undefined nexus endpoint for spelling mismatch, got %v", errs)
	}
}

func hasErrorKind(errs []*ResolveError, kind ErrorKind) bool {
	for _, e := range errs {
		if e.Kind == kind {
			return true
		}
	}
	return false
}

// workerParams returns each namespace worker's TemplateParams, in file order.
func workerParams(file *ast.File) [][]string {
	var out [][]string
	for _, def := range file.Definitions {
		if ns, ok := def.(*ast.NamespaceDef); ok {
			for _, nw := range ns.Workers {
				out = append(out, nw.TemplateParams)
			}
		}
	}
	return out
}
