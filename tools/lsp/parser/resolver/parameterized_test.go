package resolver

import "testing"

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
            task_queue: "q-{org}"
`
	file := mustParse(t, input)
	errs := Resolve(file)
	if hasErrorKind(errs, ErrEndpointParamNotSuperset) {
		t.Errorf("did not expect ENDPOINT_PARAM_NOT_SUPERSET, got %v", errs)
	}
	if hasErrorKind(errs, ErrUnboundTemplateParam) {
		t.Errorf("did not expect UNBOUND_TEMPLATE_PARAM, got %v", errs)
	}
}

// A {param} hole in an option string that no enclosing template binds is an error.
func TestUnboundTemplateParamInWorkerOption(t *testing.T) {
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
	errs := Resolve(file)
	if !hasErrorKind(errs, ErrUnboundTemplateParam) {
		t.Errorf("expected UNBOUND_TEMPLATE_PARAM for {region}, got %v", errs)
	}
}

// A worker option hole bound by the namespace template is fine.
func TestBoundTemplateParamInWorkerOption(t *testing.T) {
	input := `worker w:
    workflow W

workflow W():
    return x

namespace fabric-shard-{org}:
    worker w
        options:
            task_queue: "q-{org}-bootstrap"
`
	file := mustParse(t, input)
	errs := Resolve(file)
	if hasErrorKind(errs, ErrUnboundTemplateParam) {
		t.Errorf("did not expect UNBOUND_TEMPLATE_PARAM, got %v", errs)
	}
}

// An endpoint option may reference either its own or its namespace's params.
func TestUnboundTemplateParamInEndpointOption(t *testing.T) {
	input := `namespace fabric-shard-{org}:
    nexus endpoint fabric-shard-{org}-BootstrapShard
        options:
            task_queue: "q-{shard}"
`
	file := mustParse(t, input)
	errs := Resolve(file)
	if !hasErrorKind(errs, ErrUnboundTemplateParam) {
		t.Errorf("expected UNBOUND_TEMPLATE_PARAM for {shard}, got %v", errs)
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
            task_queue: "q-{org}"
    nexus endpoint fabric-shard-{org}-BootstrapShard
        options:
            task_queue: "q-{org}"
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
            task_queue: "q-{org}"
    nexus endpoint fabric-shard-{org}-BootstrapShard
        options:
            task_queue: "q-{org}"
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
