package validator

import (
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/parser"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/resolver"
)

// mustMergeAndResolve parses several single-package sources and merges them
// exactly as the envelope does (issue #109): each definition and import is
// stamped with its file's package, and File.Package is the sole package when
// the whole tree is single-package (empty when it spans multiple packages). It
// then resolves the merged tree, failing on any non-warning resolve error. This
// lets the validator be unit-tested on multi-package trees without importing the
// CLI envelope (which would be an import cycle).
func mustMergeAndResolve(t *testing.T, sources ...string) *ast.File {
	t.Helper()
	merged := &ast.File{}
	pkgs := map[string]bool{}
	for _, src := range sources {
		f, err := parser.ParseFile(src)
		if err != nil {
			t.Fatalf("unexpected parse error: %v", err)
		}
		pkgs[f.Package] = true
		for _, imp := range f.Imports {
			imp.Package = f.Package
			merged.Imports = append(merged.Imports, imp)
		}
		for _, def := range f.Definitions {
			stampPkg(def, f.Package)
			merged.Definitions = append(merged.Definitions, def)
		}
	}
	if len(pkgs) == 1 {
		for p := range pkgs {
			merged.Package = p
		}
	}
	for _, e := range resolver.Resolve(merged) {
		if e.Severity != "warning" {
			t.Fatalf("unexpected resolve error: %s %q", e.Kind, e.Msg)
		}
	}
	return merged
}

func stampPkg(def ast.Definition, pkg string) {
	switch d := def.(type) {
	case *ast.WorkflowDef:
		d.Package = pkg
	case *ast.ActivityDef:
		d.Package = pkg
	case *ast.WorkerDef:
		d.Package = pkg
	case *ast.NamespaceDef:
		d.Package = pkg
	case *ast.NexusServiceDef:
		d.Package = pkg
	}
}

func countKind(errs []*Error, kind ErrorKind) int {
	n := 0
	for _, e := range errs {
		if e.Kind == kind {
			n++
		}
	}
	return n
}

// TestCrossPackageCoverageIndependent: two packages each define a workflow with
// the same short name. Only alpha's copy is registered on an instantiated
// worker; beta's copy is genuinely uncovered. Coverage must be judged per
// package — exactly one UNCOVERED_WORKFLOW, for beta's copy. Under the old
// bare-name keying alpha's registration would mark the shared name "Process"
// covered and mask beta's gap (zero warnings).
func TestCrossPackageCoverageIndependent(t *testing.T) {
	alpha := `package alpha

workflow Process(id):
    close complete(id)

worker aw:
    workflow Process

namespace ans:
    worker aw
        options:
            task_queue: "aq"
`
	beta := `package beta

workflow Process(id):
    close complete(id)

activity Helper(id):
    return id

worker bw:
    activity Helper

namespace bns:
    worker bw
        options:
            task_queue: "bq"
`
	errs := Validate(mustMergeAndResolve(t, alpha, beta))
	if got := countKind(errs, ErrUncoveredWorkflow); got != 1 {
		t.Fatalf("expected exactly 1 UNCOVERED_WORKFLOW (beta.Process), got %d: %v", got, errs)
	}
}

// TestCrossPackageWorkerNameCollision: two packages each define a worker with
// the same short name, each instantiated in its own namespace and registering
// its own package's workflow. Neither workflow is uncovered. Under the old
// bare-name keying the two workers collided in the definition map, so one
// package's registrations were lost and its workflow was falsely flagged
// UNCOVERED.
func TestCrossPackageWorkerNameCollision(t *testing.T) {
	alpha := `package alpha

workflow Alpha(id):
    close complete(id)

worker w:
    workflow Alpha

namespace ans:
    worker w
        options:
            task_queue: "aq"
`
	beta := `package beta

workflow Beta(id):
    close complete(id)

worker w:
    workflow Beta

namespace bns:
    worker w
        options:
            task_queue: "bq"
`
	errs := Validate(mustMergeAndResolve(t, alpha, beta))
	if got := countKind(errs, ErrUncoveredWorkflow); got != 0 {
		t.Fatalf("expected no UNCOVERED_WORKFLOW (both workflows covered per package), got %d: %v", got, errs)
	}
	if got := countKind(errs, ErrUninstantiatedWorker); got != 0 {
		t.Fatalf("expected no UNINSTANTIATED_WORKER (both workers instantiated), got %d: %v", got, errs)
	}
}

// TestCrossPackageRoutingIndependent: alpha.Caller calls alpha.Charge, which is
// NOT deployed on any worker on the caller's queue. A same-named activity in
// beta IS deployed on a worker on an identically-named queue. Routing must be
// judged per package, so the real mismatch (alpha.Charge undeployed) is
// reported. Under the old bare-name keying beta's "Charge" registration would
// satisfy the check and hide the mismatch.
func TestCrossPackageRoutingIndependent(t *testing.T) {
	alpha := `package alpha

workflow Caller(x):
    activity Charge(x) -> y
    close complete(y)

activity Charge(x):
    return x

worker aw:
    workflow Caller

namespace ans:
    worker aw
        options:
            task_queue: "shared"
`
	beta := `package beta

activity Charge(x):
    return x

worker bw:
    activity Charge

namespace bns:
    worker bw
        options:
            task_queue: "shared"
`
	errs := Validate(mustMergeAndResolve(t, alpha, beta))
	if !hasError(errs, `activity Charge is not on any worker polling task queue "shared" (inherited from workflow Caller)`) {
		t.Fatalf("expected IMPLICIT_ROUTING_MISMATCH for alpha.Charge, got: %v", errs)
	}
}

// TestCrossPackageEndpointServiceLinkage: a nexus endpoint routes to a queue
// whose worker registers a same-named service from a DIFFERENT package than the
// one the call targets. The linkage must be judged per package, so the mismatch
// is reported. Endpoints themselves stay flat-global (bare name).
func TestCrossPackageEndpointServiceLinkage(t *testing.T) {
	alpha := `package alpha

nexus service Svc:
    async Op workflow W

workflow W():
    nexus Ep Svc.Op(x) -> result
    close complete(result)

worker aw:
    workflow W

namespace ans:
    worker aw
        options:
            task_queue: "q"
    nexus endpoint Ep
        options:
            task_queue: "q"
`
	beta := `package beta

nexus service Svc:
    async Op workflow BW

workflow BW():
    close complete(0)

worker bw:
    nexus service Svc
    workflow BW

namespace bns:
    worker bw
        options:
            task_queue: "q"
`
	errs := Validate(mustMergeAndResolve(t, alpha, beta))
	if !hasError(errs, "no worker on that queue has service Svc") {
		t.Fatalf("expected ENDPOINT_SERVICE_LINKAGE mismatch for alpha.Svc, got: %v", errs)
	}
}

// TestSinglePackageClauseUnchanged: a single explicit package clause (not the
// default) still keys every check correctly — a covered workflow produces no
// UNCOVERED warning, exactly as the default-package case does.
func TestSinglePackageClauseUnchanged(t *testing.T) {
	src := `package solo

workflow Only(id):
    close complete(id)

worker w:
    workflow Only

namespace ns:
    worker w
        options:
            task_queue: "q"
`
	errs := Validate(mustMergeAndResolve(t, src))
	if got := countKind(errs, ErrUncoveredWorkflow); got != 0 {
		t.Fatalf("expected no UNCOVERED_WORKFLOW in a covered single-package tree, got %d: %v", got, errs)
	}
}
