package server

import (
	"fmt"
	"reflect"

	"github.com/jmbarzee/glsp"
	protocol "github.com/jmbarzee/glsp/protocol_3_16"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/lexer"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/resolver"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/token"
)

func renameHandler(store *DocumentStore) protocol.TextDocumentRenameFunc {
	return func(context *glsp.Context, params *protocol.RenameParams) (*protocol.WorkspaceEdit, error) {
		file, occs, at, ok := occurrenceAt(store, params.TextDocument.URI, params.Position)
		if !ok {
			return nil, nil
		}
		if err := checkNewName(file, occs, at, params.NewName); err != nil {
			return nil, err
		}
		src := newSources(store, params.TextDocument.URI)
		changes := map[string][]protocol.TextEdit{}
		for _, o := range occs {
			if o.decl != at.decl {
				continue
			}
			loc, fresh := src.location(o)
			if !fresh {
				return nil, fmt.Errorf("%s changed on disk since it was analyzed; save or reopen it and rename again", loc.URI)
			}
			changes[loc.URI] = append(changes[loc.URI], protocol.TextEdit{Range: loc.Range, NewText: params.NewName})
		}
		return &protocol.WorkspaceEdit{Changes: changes}, nil
	}
}

// prepareRenameHandler returns the range of the name under the cursor. The
// protocol gives it no new name to check; rename checks it.
func prepareRenameHandler(store *DocumentStore) protocol.TextDocumentPrepareRenameFunc {
	return func(context *glsp.Context, params *protocol.PrepareRenameParams) (any, error) {
		_, _, at, ok := occurrenceAt(store, params.TextDocument.URI, params.Position)
		if !ok {
			return nil, nil
		}
		loc, _ := newSources(store, params.TextDocument.URI).location(at)
		return loc.Range, nil
	}
}

// checkNewName reports why at's declaration, among occs in file, cannot be
// renamed to newName: the lexer would not read newName as one name, or another
// declaration already holds it where the two would clash.
func checkNewName(file *ast.File, occs []occurrence, at occurrence, newName string) error {
	decl := occurrence{name: at.name, decl: at.decl} // its owner, once found
	for _, o := range occs {
		if o.isDecl && o.decl == at.decl {
			decl = o
		}
	}
	if newName == decl.name {
		return nil
	}
	fail := func(format string, args ...any) error {
		return fmt.Errorf("cannot rename %s %s to %q: %s", kindOf(decl.decl), decl.name, newName, fmt.Sprintf(format, args...))
	}

	// The name must lex as the parser reads it there: one identifier, or for a
	// namespace or endpoint one deployment name.
	tok := lexer.New(newName).NextToken()
	switch decl.decl.(type) {
	case *ast.NamespaceDef, *ast.NamespaceEndpoint:
		if tok.Type == token.IDENT {
			tok, _ = lexer.New(newName).RescanDeployName(tok)
		}
	}
	switch {
	case tok.Literal == newName && tok.Type.IsKeyword():
		return fail("it is a keyword")
	case tok.Type != token.IDENT || tok.Literal != newName:
		return fail("it is not a name")
	}
	switch decl.decl.(type) {
	case *ast.ConditionDecl, *ast.PromiseStmt:
		if newName == resolver.ReservedName {
			return fail("it is reserved for `id: parent`")
		}
	}

	for _, o := range occs {
		if o.isDecl && o.name == newName && o.decl != decl.decl && clashes(file, decl, o) {
			return fail("%s %s is already declared %s", kindOf(o.decl), newName, scopeOf(decl))
		}
	}

	// A worker registers types by name: it cannot hold two of one kind.
	for _, reg := range occs {
		if reg.isDecl || reg.decl != decl.decl {
			continue
		}
		if _, ok := reg.owner.(*ast.WorkerDef); !ok {
			continue
		}
		for _, o := range occs {
			if !o.isDecl && o.owner == reg.owner && o.name == newName && o.decl != nil && sameKind(o.decl, decl.decl) {
				return fail("worker %s already registers %s %s", reg.owner.(*ast.WorkerDef).Name, kindOf(o.decl), newName)
			}
		}
	}
	return nil
}

// clashes reports whether declarations decl and other, if named alike, would
// clash: endpoints anywhere; top-level definitions of one kind in one package;
// a workflow's promises and conditions; otherwise handlers or operations of
// one kind in one workflow or service.
func clashes(file *ast.File, decl, other occurrence) bool {
	switch decl.decl.(type) {
	case *ast.NamespaceEndpoint:
		return sameKind(decl.decl, other.decl)
	case *ast.ConditionDecl, *ast.PromiseStmt:
		switch other.decl.(type) {
		case *ast.ConditionDecl, *ast.PromiseStmt:
			return other.owner == decl.owner
		}
		return false
	}
	if decl.decl == ast.Node(decl.owner) {
		return sameKind(decl.decl, other.decl) && packageOf(file, decl.owner) == packageOf(file, other.owner)
	}
	return sameKind(decl.decl, other.decl) && other.owner == decl.owner
}

// scopeOf names where a declaration like decl's must be unique.
func scopeOf(decl occurrence) string {
	switch decl.decl.(type) {
	case *ast.NamespaceEndpoint:
		return "(endpoint names are global)"
	}
	if decl.decl == ast.Node(decl.owner) {
		return "in this package"
	}
	return "in " + kindOf(decl.owner) + " " + nameOf(decl.owner)
}

func sameKind(a, b ast.Node) bool { return reflect.TypeOf(a) == reflect.TypeOf(b) }

func packageOf(file *ast.File, def ast.Definition) string {
	if p, ok := def.(ast.Packaged); ok {
		return ast.PackageIDOf(p, file)
	}
	return ""
}

// kindOf is the keyword-level name of a declaration's kind.
func kindOf(n ast.Node) string {
	switch n.(type) {
	case *ast.WorkflowDef:
		return "workflow"
	case *ast.ActivityDef:
		return "activity"
	case *ast.WorkerDef:
		return "worker"
	case *ast.NamespaceDef:
		return "namespace"
	case *ast.NamespaceEndpoint:
		return "nexus endpoint"
	case *ast.NexusServiceDef:
		return "nexus service"
	case *ast.NexusOperation:
		return "nexus operation"
	case *ast.SignalDecl:
		return "signal"
	case *ast.QueryDecl:
		return "query"
	case *ast.UpdateDecl:
		return "update"
	case *ast.ConditionDecl:
		return "condition"
	case *ast.PromiseStmt:
		return "promise"
	}
	return "name"
}

// nameOf is a top-level definition's name.
func nameOf(def ast.Definition) string {
	switch d := def.(type) {
	case *ast.WorkflowDef:
		return d.Name
	case *ast.ActivityDef:
		return d.Name
	case *ast.WorkerDef:
		return d.Name
	case *ast.NamespaceDef:
		return d.Name
	case *ast.NexusServiceDef:
		return d.Name
	}
	return ""
}
