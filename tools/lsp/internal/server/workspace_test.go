package server

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/resolver"
)

// writeTWF writes content to name under dir and returns its absolute path and
// the `file://` URI the LSP would carry for it.
func writeTWF(t *testing.T, dir, name, content string) (abs, uri string) {
	t.Helper()
	abs = filepath.Join(dir, name)
	if err := os.WriteFile(abs, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", abs, err)
	}
	return abs, "file://" + abs
}

func hasKind(errs []*resolver.ResolveError, kind resolver.ErrorKind) bool {
	for _, e := range errs {
		if e.Kind == kind {
			return true
		}
	}
	return false
}

// TestWorkspaceCrossPackageResolves: an open buffer in package `peer` that
// imports a sibling package `orderer` (defined in a sibling .twf on disk) and
// calls orderer.ChannelJoin resolves cleanly — no UNDEFINED_WORKFLOW and no
// QUALIFIED_REF_WITHOUT_IMPORT for the cross-package ref.
func TestWorkspaceCrossPackageResolves(t *testing.T) {
	dir := t.TempDir()

	writeTWF(t, dir, "orderer.twf", `package orderer

workflow ChannelJoin(id):
    close complete(id)
`)
	peer := `package peer

import "acme/orderer"

workflow ChannelJoin(id):
    workflow orderer.ChannelJoin(id) -> res
    close complete(res)
`
	_, peerURI := writeTWF(t, dir, "peer.twf", peer)

	store := NewDocumentStore()
	store.SetRoot(dir)
	doc := store.Open(peerURI, peer)

	if hasKind(doc.ResolveErrs, resolver.ErrUndefinedWorkflow) {
		t.Errorf("unexpected UNDEFINED_WORKFLOW for cross-package call: %v", doc.ResolveErrs)
	}
	if hasKind(doc.ResolveErrs, resolver.ErrQualifiedRefWithoutImport) {
		t.Errorf("unexpected QUALIFIED_REF_WITHOUT_IMPORT for imported ref: %v", doc.ResolveErrs)
	}
	// The import is resolved (package present) and used, so no import warnings.
	if hasKind(doc.ResolveErrs, resolver.ErrUnresolvedImport) || hasKind(doc.ResolveErrs, resolver.ErrUnusedImport) {
		t.Errorf("unexpected import diagnostic: %v", doc.ResolveErrs)
	}
}

// TestWorkspaceExternalImportWarns: an open buffer importing a path whose leaf
// package is absent from the tree surfaces an UNRESOLVED_IMPORT warning at the
// import's line.
func TestWorkspaceExternalImportWarns(t *testing.T) {
	dir := t.TempDir()

	solo := `package solo

import "some/external"

workflow W():
    workflow external.Thing() -> r
    close complete(r)
`
	_, soloURI := writeTWF(t, dir, "solo.twf", solo)

	store := NewDocumentStore()
	store.SetRoot(dir)
	doc := store.Open(soloURI, solo)

	var found *resolver.ResolveError
	for _, e := range doc.ResolveErrs {
		if e.Kind == resolver.ErrUnresolvedImport {
			found = e
			break
		}
	}
	if found == nil {
		t.Fatalf("expected UNRESOLVED_IMPORT warning, got %v", doc.ResolveErrs)
	}
	if found.Severity != "warning" {
		t.Errorf("UNRESOLVED_IMPORT severity = %q, want warning", found.Severity)
	}
	if found.Line != 3 {
		t.Errorf("UNRESOLVED_IMPORT at line %d, want 3 (the import line)", found.Line)
	}
}

// TestWorkspaceNoRootIsolatedBuffer: with no root set, an isolated buffer
// analyzes exactly as the single-buffer path — an intra-file undefined activity
// still reports UNDEFINED_ACTIVITY.
func TestWorkspaceNoRootIsolatedBuffer(t *testing.T) {
	content := `workflow W():
    activity GhostActivity()
`
	store := NewDocumentStore() // no SetRoot
	doc := store.Open("file:///tmp/isolated.twf", content)

	if !hasKind(doc.ResolveErrs, resolver.ErrUndefinedActivity) {
		t.Fatalf("expected UNDEFINED_ACTIVITY in single-buffer mode, got %v", doc.ResolveErrs)
	}
}

// TestWorkspaceReferenceErrorSurfacesOnlyOnReferencingBuffer is the issue #136
// regression for the LSP path: gamma imports alpha and beta (each defining a
// Process workflow) and makes a bare `Process` call. The merged UNDEFINED_WORKFLOW
// must surface on the gamma buffer and must NOT leak onto alpha, which merely
// defines a same-named symbol. Before the fix, the name/line heuristic kept the
// error on any buffer defining `Process`.
func TestWorkspaceReferenceErrorSurfacesOnlyOnReferencingBuffer(t *testing.T) {
	dir := t.TempDir()

	alpha := `package alpha

workflow Process(id):
    close complete(id)
`
	beta := `package beta

workflow Process(id):
    close complete(id)
`
	gamma := `package gamma

import "acme/alpha"
import "acme/beta"

workflow Gamma(id):
    workflow Process(id) -> out
    close complete(out)
`
	alphaAbs, alphaURI := writeTWF(t, dir, "alpha.twf", alpha)
	_ = alphaAbs
	writeTWF(t, dir, "beta.twf", beta)
	_, gammaURI := writeTWF(t, dir, "gamma.twf", gamma)

	store := NewDocumentStore()
	store.SetRoot(dir)

	// The referencing buffer sees the undefined-workflow error, attributed to
	// itself.
	gammaDoc := store.Open(gammaURI, gamma)
	var undef *resolver.ResolveError
	for _, e := range gammaDoc.ResolveErrs {
		if e.Kind == resolver.ErrUndefinedWorkflow {
			undef = e
			break
		}
	}
	if undef == nil {
		t.Fatalf("expected UNDEFINED_WORKFLOW on gamma buffer, got %v", gammaDoc.ResolveErrs)
	}
	if undef.File != "gamma.twf" {
		t.Errorf("UNDEFINED_WORKFLOW file = %q, want gamma.twf", undef.File)
	}
	if undef.Line != 7 {
		t.Errorf("UNDEFINED_WORKFLOW at line %d, want 7 (the reference site)", undef.Line)
	}

	// The defining buffer must not see the reference error leak onto it.
	alphaDoc := store.Open(alphaURI, alpha)
	if hasKind(alphaDoc.ResolveErrs, resolver.ErrUndefinedWorkflow) {
		t.Errorf("UNDEFINED_WORKFLOW leaked onto alpha (a defining buffer): %v", alphaDoc.ResolveErrs)
	}
}

// TestWorkspaceSiblingErrorDoesNotLeak: with a root set, a sibling file's own
// resolve error (an undefined activity in the sibling) does not leak onto the
// open buffer, which is itself clean.
func TestWorkspaceSiblingErrorDoesNotLeak(t *testing.T) {
	dir := t.TempDir()

	// Sibling's undefined-activity error lands on line 6 — a line the buffer
	// below does not own — so it must be filtered out.
	writeTWF(t, dir, "sib.twf", `package sib



workflow Sib():
    activity GhostActivity()
`)
	main := `package main

workflow Main():
    close complete("ok")
`
	_, mainURI := writeTWF(t, dir, "main.twf", main)

	store := NewDocumentStore()
	store.SetRoot(dir)
	doc := store.Open(mainURI, main)

	if len(doc.ResolveErrs) != 0 {
		t.Fatalf("sibling error leaked onto open buffer: %v", doc.ResolveErrs)
	}
}
