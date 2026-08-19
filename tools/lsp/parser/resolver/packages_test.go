package resolver

import (
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
)

// mustMerge parses several single-package sources and merges them exactly as the
// envelope does (issue #109): each definition and import is stamped with its
// file's package, and File.Package is the sole package when the whole tree is
// single-package (empty when it spans multiple packages). It lets the resolver
// be unit-tested on multi-package trees without importing the CLI envelope
// (which would be an import cycle).
func mustMerge(t *testing.T, sources ...string) *ast.File {
	t.Helper()
	merged := &ast.File{}
	pkgs := map[string]bool{}
	for _, src := range sources {
		f := mustParse(t, src)
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

// TestCrossPackageSameNameResolves: F8 — the same short name in two packages
// resolves without a DUPLICATE_* error, and a cross-package call through an
// import resolves to the correct package's definition.
func TestCrossPackageSameNameResolves(t *testing.T) {
	orderer := `package orderer

workflow ChannelJoin(id):
    close complete(id)
`
	peer := `package peer

import "acme/orderer"

workflow ChannelJoin(id):
    workflow orderer.ChannelJoin(id) -> res
    close complete(res)
`
	file := mustMerge(t, orderer, peer)
	errs := Resolve(file)
	for _, e := range errs {
		if e.Severity != "warning" {
			t.Errorf("unexpected error: %s %q", e.Kind, e.Msg)
		}
	}
	// peer.ChannelJoin's cross-package call must resolve to orderer.ChannelJoin.
	peerWf := file.Definitions[1].(*ast.WorkflowDef)
	call := peerWf.Body[0].(*ast.WorkflowCall)
	if call.Workflow.Resolved == nil {
		t.Fatal("cross-package workflow call did not resolve")
	}
	if call.Workflow.Resolved.Package != "orderer" {
		t.Errorf("resolved to package %q, want orderer", call.Workflow.Resolved.Package)
	}
}

// TestDuplicateWithinOnePackageStillErrors: two same-named workflows in the SAME
// package remain a duplicate error (the per-key duplicate check).
func TestDuplicateWithinOnePackageStillErrors(t *testing.T) {
	src := `package billing

workflow Charge(id):
    close complete(id)

workflow Charge(id):
    close complete(id)
`
	errs := Resolve(mustParse(t, src))
	var found bool
	for _, e := range errs {
		if e.Kind == ErrDuplicateWorkflow {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected DUPLICATE_WORKFLOW within one package, got %v", errs)
	}
}

// TestGlobalEndpointDuplicateAcrossPackages: endpoints are flat-global, so the
// same endpoint name defined in two packages' namespaces is still a hard
// duplicate error.
func TestGlobalEndpointDuplicateAcrossPackages(t *testing.T) {
	a := `package a

namespace nsA:
    nexus endpoint Shared
        options:
            task_queue: "q"
`
	b := `package b

namespace nsB:
    nexus endpoint Shared
        options:
            task_queue: "q"
`
	errs := Resolve(mustMerge(t, a, b))
	var found bool
	for _, e := range errs {
		if e.Kind == ErrDuplicateEndpoint {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected DUPLICATE_ENDPOINT across packages, got %v", errs)
	}
}

// TestAliasResolvesLeafClash: two imports whose paths share a leaf name would
// clash on the same qualifier; an alias binds a distinct qualifier, and a
// reference through the alias resolves to the aliased package.
func TestAliasResolvesLeafClash(t *testing.T) {
	orderer := `package orderer

workflow Run(id):
    close complete(id)
`
	// app imports two "orderer" leaves: the bare one binds "orderer", the
	// aliased one binds "ord". Both target package orderer (present).
	app := `package app

import "acme/orderer"
import ord "beta/orderer"

workflow Caller(id):
    workflow ord.Run(id) -> r
    close complete(r)
`
	file := mustMerge(t, orderer, app)
	errs := Resolve(file)
	for _, e := range errs {
		if e.Severity != "warning" && e.Kind != ErrUnusedImport {
			t.Errorf("unexpected error: %s %q", e.Kind, e.Msg)
		}
	}
	caller := file.Definitions[1].(*ast.WorkflowDef)
	call := caller.Body[0].(*ast.WorkflowCall)
	if call.Workflow.Resolved == nil || call.Workflow.Resolved.Package != "orderer" {
		t.Fatalf("alias-qualified ref did not resolve to package orderer: %+v", call.Workflow.Resolved)
	}
}

// TestNexusExternalServiceCoexistsWithLocal: with the #31 cliff removed, a nexus
// CALL to an external (imported-unresolved) service resolves as external (no
// error) while a local nexus service in the same file still resolves — the two
// coexist.
func TestNexusExternalServiceCoexistsWithLocal(t *testing.T) {
	src := `package app

import remote "acme/remote"

nexus service LocalSvc:
    async DoLocal workflow Runner

workflow Runner(id):
    close complete(id)

workflow Coordinator(id):
    nexus Gateway LocalSvc.DoLocal(id) -> a
    nexus Gateway remote.RemoteSvc.DoRemote(id) -> b
    close complete(a)

worker w:
    workflow Runner
    workflow Coordinator
    nexus service LocalSvc

namespace ns:
    worker w
        options:
            task_queue: "q"
    nexus endpoint Gateway
        options:
            task_queue: "q"
`
	file := mustParse(t, src)
	errs := Resolve(file)
	for _, e := range errs {
		if e.Severity == "error" {
			t.Errorf("unexpected error: %s %q", e.Kind, e.Msg)
		}
	}
	coord := findWorkflow(t, file, "Coordinator")
	local := coord.Body[0].(*ast.NexusCall)
	if local.Service.Resolved == nil || local.Service.Resolved.Name != "LocalSvc" {
		t.Errorf("local nexus service call did not resolve to LocalSvc: %+v", local.Service.Resolved)
	}
	external := coord.Body[1].(*ast.NexusCall)
	if external.Service.Resolved != nil {
		t.Errorf("external nexus service call should be left unresolved, got %v", external.Service.Resolved)
	}
	// The endpoint is flat-global and resolves for both calls.
	if external.Endpoint.Resolved == nil {
		t.Error("endpoint should resolve for the external service call (flat-global)")
	}
}

func findWorkflow(t *testing.T, file *ast.File, name string) *ast.WorkflowDef {
	t.Helper()
	for _, def := range file.Definitions {
		if wf, ok := def.(*ast.WorkflowDef); ok && wf.Name == name {
			return wf
		}
	}
	t.Fatalf("workflow %q not found", name)
	return nil
}

// TestOwnPackageQualifierResolves: a qualifier naming the file's own package
// behaves exactly like an unqualified same-package reference — it resolves.
func TestOwnPackageQualifierResolves(t *testing.T) {
	input := `package billing

activity Charge(amt) -> (ok):
    return ok

workflow Order(id):
    activity billing.Charge(id) -> done
`
	file := mustParse(t, input)
	errs := Resolve(file)
	if len(errs) != 0 {
		t.Fatalf("expected no resolve errors, got %v", errs)
	}
	wf := file.Definitions[1].(*ast.WorkflowDef)
	ac := wf.Body[0].(*ast.ActivityCall)
	if ac.Activity.Resolved == nil {
		t.Errorf("own-package-qualified activity ref was not resolved")
	}
}

// TestImportedPackageQualifierResolvesAsExternal: a qualifier naming an import
// whose target package is absent from the tree resolves as external — the ref
// is left unresolved with NO UNDEFINED_* error, and the import surfaces a single
// UNRESOLVED_IMPORT "treated as external" warning (issue #109).
func TestImportedPackageQualifierResolvesAsExternal(t *testing.T) {
	input := `package billing

import "acme/shared"

workflow Order(id):
    activity shared.Charge(id) -> done
`
	file := mustParse(t, input)
	errs := Resolve(file)

	// Exactly one diagnostic: the unresolved-import warning. No error-severity
	// diagnostics (the external ref must NOT produce UNDEFINED_ACTIVITY).
	var warnings, errors int
	for _, e := range errs {
		if e.Severity == "warning" {
			warnings++
			if e.Kind != ErrUnresolvedImport {
				t.Errorf("unexpected warning kind %s", e.Kind)
			}
		} else {
			errors++
		}
	}
	if errors != 0 {
		t.Fatalf("external ref should produce no error-severity diagnostics, got %v", errs)
	}
	if warnings != 1 {
		t.Fatalf("expected exactly one unresolved-import warning, got %v", errs)
	}

	wf := file.Definitions[0].(*ast.WorkflowDef)
	ac := wf.Body[0].(*ast.ActivityCall)
	if ac.Activity.Resolved != nil {
		t.Errorf("external activity ref should be left unresolved, got %v", ac.Activity.Resolved)
	}
}

// TestQualifiedRefWithoutImport: a qualifier that is neither the own package nor
// a bound import is a hard error (issue #109).
func TestQualifiedRefWithoutImport(t *testing.T) {
	input := `package billing

workflow Order(id):
    activity shared.Charge(id) -> done
`
	file := mustParse(t, input)
	errs := Resolve(file)
	var found bool
	for _, e := range errs {
		if e.Kind == ErrQualifiedRefWithoutImport {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected QUALIFIED_REF_WITHOUT_IMPORT, got %v", errs)
	}
}

// TestVersionedImportAliasedResolves: an aliased import of a Go-style versioned
// module path binds the alias qualifier but targets the version-stripped package
// (`import orders ".../orders/v1"` → package orders, present), so a reference
// through the alias resolves rather than silently falling to external (#135).
func TestVersionedImportAliasedResolves(t *testing.T) {
	orders := `package orders

workflow ProcessOrder(id):
    close complete(id)
`
	app := `package app

import orders "example.com/acme/orders/v1"

workflow Caller(id):
    workflow orders.ProcessOrder(id) -> r
    close complete(r)
`
	file := mustMerge(t, orders, app)
	errs := Resolve(file)
	for _, e := range errs {
		if e.Severity == "error" {
			t.Errorf("unexpected error: %s %q", e.Kind, e.Msg)
		}
	}
	caller := findWorkflow(t, file, "Caller")
	call := caller.Body[0].(*ast.WorkflowCall)
	if call.Workflow.Resolved == nil || call.Workflow.Resolved.Package != "orders" {
		t.Fatalf("versioned aliased ref did not resolve to package orders: %+v", call.Workflow.Resolved)
	}
}

// TestVersionedImportBareResolves: a bare (unaliased) versioned import defaults
// its qualifier to the version-stripped leaf (`import ".../orders/v1"` →
// qualifier and package "orders"), so `orders.ProcessOrder` resolves (#135).
func TestVersionedImportBareResolves(t *testing.T) {
	orders := `package orders

workflow ProcessOrder(id):
    close complete(id)
`
	app := `package app

import "example.com/acme/orders/v1"

workflow Caller(id):
    workflow orders.ProcessOrder(id) -> r
    close complete(r)
`
	file := mustMerge(t, orders, app)
	errs := Resolve(file)
	for _, e := range errs {
		if e.Severity == "error" {
			t.Errorf("unexpected error: %s %q", e.Kind, e.Msg)
		}
	}
	caller := findWorkflow(t, file, "Caller")
	call := caller.Body[0].(*ast.WorkflowCall)
	if call.Workflow.Resolved == nil || call.Workflow.Resolved.Package != "orders" {
		t.Fatalf("bare versioned ref did not resolve to package orders: %+v", call.Workflow.Resolved)
	}
}

// TestVersionedImportAliasDistinctNameResolves: an alias whose name differs from
// the leaf overrides only the local qualifier — the target is still the
// version-stripped package (`import o ".../orders/v1"` → `o.X` targets orders).
func TestVersionedImportAliasDistinctNameResolves(t *testing.T) {
	orders := `package orders

workflow ProcessOrder(id):
    close complete(id)
`
	app := `package app

import o "example.com/acme/orders/v1"

workflow Caller(id):
    workflow o.ProcessOrder(id) -> r
    close complete(r)
`
	file := mustMerge(t, orders, app)
	errs := Resolve(file)
	for _, e := range errs {
		if e.Severity == "error" {
			t.Errorf("unexpected error: %s %q", e.Kind, e.Msg)
		}
	}
	caller := findWorkflow(t, file, "Caller")
	call := caller.Body[0].(*ast.WorkflowCall)
	if call.Workflow.Resolved == nil || call.Workflow.Resolved.Package != "orders" {
		t.Fatalf("distinct-alias versioned ref did not resolve to package orders: %+v", call.Workflow.Resolved)
	}
}

// TestVersionedImportTypoRaisesUndefined: with coverage restored, a typo in a
// reference through a versioned import (`orders.PorcessOrder`) now targets the
// resolved package "orders" and raises UNDEFINED_WORKFLOW instead of silently
// passing as external (#135 — the silent-failure this fix closes).
func TestVersionedImportTypoRaisesUndefined(t *testing.T) {
	orders := `package orders

workflow ProcessOrder(id):
    close complete(id)
`
	app := `package app

import "example.com/acme/orders/v1"

workflow Caller(id):
    workflow orders.PorcessOrder(id) -> r
    close complete(r)
`
	file := mustMerge(t, orders, app)
	errs := Resolve(file)
	var found bool
	for _, e := range errs {
		if e.Kind == ErrUndefinedWorkflow {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected UNDEFINED_WORKFLOW for typo through versioned import, got %v", errs)
	}
}

// TestVersionedImportAbsentStaysExternal: a versioned import whose version-
// stripped leaf is genuinely absent from the tree keeps resolving as external —
// the reference is left unresolved with NO UNDEFINED_* error and a single
// UNRESOLVED_IMPORT warning surfaces (the legitimate external path is preserved).
func TestVersionedImportAbsentStaysExternal(t *testing.T) {
	input := `package app

import "example.com/acme/missing/v1"

workflow Caller(id):
    workflow missing.DoThing(id) -> r
    close complete(r)
`
	file := mustParse(t, input)
	errs := Resolve(file)
	var warnings, errors int
	for _, e := range errs {
		if e.Severity == "warning" {
			warnings++
			if e.Kind != ErrUnresolvedImport {
				t.Errorf("unexpected warning kind %s", e.Kind)
			}
		} else {
			errors++
		}
	}
	if errors != 0 {
		t.Fatalf("absent versioned import should produce no error-severity diagnostics, got %v", errs)
	}
	if warnings != 1 {
		t.Fatalf("expected exactly one unresolved-import warning, got %v", errs)
	}
	caller := findWorkflow(t, file, "Caller")
	call := caller.Body[0].(*ast.WorkflowCall)
	if call.Workflow.Resolved != nil {
		t.Errorf("external versioned ref should be left unresolved, got %v", call.Workflow.Resolved)
	}
}
