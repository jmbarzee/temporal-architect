package server

import (
	"github.com/jmbarzee/glsp"
	protocol "github.com/jmbarzee/glsp/protocol_3_16"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/lexer"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/token"
)

func referencesHandler(store *DocumentStore) protocol.TextDocumentReferencesFunc {
	return func(context *glsp.Context, params *protocol.ReferenceParams) ([]protocol.Location, error) {
		_, occs, at, ok := occurrenceAt(store, params.TextDocument.URI, params.Position)
		if !ok {
			return nil, nil
		}
		src := newSources(store, params.TextDocument.URI)
		var locs []protocol.Location
		for _, o := range occs {
			if o.decl == at.decl && (params.Context.IncludeDeclaration || !o.isDecl) {
				if loc, fresh := src.location(o); fresh {
					locs = append(locs, loc)
				}
			}
		}
		return locs, nil
	}
}

// occurrence is one spelling of a declared name: the declaration's own name
// token, or a reference's.
type occurrence struct {
	file string // the source file, as its definition's SourceFile spells it
	ast.Pos
	name   string
	decl   ast.Node       // the declaration; nil for an unresolved reference
	owner  ast.Definition // the top-level definition the spelling is in
	isDecl bool
}

// occurrenceAt finds the name under the cursor of the buffer at uri and
// returns it with every occurrence in the AST that holds it: the buffer's
// workspace run, so references reach other files and packages, else the
// buffer's own AST. file is the AST that holds them. ok is false off a name or
// on an unresolved one.
func occurrenceAt(store *DocumentStore, uri string, cursor protocol.Position) (file *ast.File, occs []occurrence, at occurrence, ok bool) {
	doc, found := store.Get(uri)
	if !found {
		return nil, nil, occurrence{}, false
	}
	lines := doc.lines()
	src := newSources(store, uri)
	for _, f := range []*ast.File{doc.run, doc.File} {
		if f == nil {
			continue
		}
		occs = occurrences(f, src)
		for _, o := range occs {
			if o.file != doc.sourceFile || o.Line-1 != int(cursor.Line) {
				continue
			}
			r := nameRange(lines, o.Pos, o.name)
			if r.Start.Character <= cursor.Character && cursor.Character <= r.End.Character {
				return f, occs, o, o.decl != nil
			}
		}
	}
	return nil, nil, occurrence{}, false
}

// occurrences lists every declared name in file and every reference to one.
// src gives the text of each source file, where an endpoint's
// allowed_caller_namespaces entries are found.
func occurrences(file *ast.File, src *sources) []occurrence {
	var x indexer
	namespaces := map[string]*ast.NamespaceDef{} // by name, the first of each
	for _, def := range file.Definitions {
		if ns, ok := def.(*ast.NamespaceDef); ok && namespaces[ns.Name] == nil {
			namespaces[ns.Name] = ns
		}
	}
	for _, def := range file.Definitions {
		switch d := def.(type) {
		case *ast.WorkflowDef:
			x.file, x.owner = d.SourceFile, d
			x.decl(d, d.NamePos, d.Name)
			if d.State != nil {
				for _, c := range d.State.Conditions {
					x.decl(c, c.NamePos, c.Name)
				}
			}
			for _, s := range d.Signals {
				x.decl(s, s.NamePos, s.Name)
				x.stmts(s.Body)
			}
			for _, q := range d.Queries {
				x.decl(q, q.NamePos, q.Name)
				x.stmts(q.Body)
			}
			for _, u := range d.Updates {
				x.decl(u, u.NamePos, u.Name)
				x.stmts(u.Body)
			}
			x.stmts(d.Body)
		case *ast.ActivityDef:
			x.file, x.owner = d.SourceFile, d
			x.decl(d, d.NamePos, d.Name)
			x.stmts(d.Body)
		case *ast.NexusServiceDef:
			x.file, x.owner = d.SourceFile, d
			x.decl(d, d.NamePos, d.Name)
			for _, op := range d.Operations {
				x.decl(op, op.NamePos, op.Name)
				if op.OpType == ast.NexusOpAsync {
					refOcc(&x, op.Workflow)
				}
				x.stmts(op.Body)
			}
		case *ast.WorkerDef:
			x.file, x.owner = d.SourceFile, d
			x.decl(d, d.NamePos, d.Name)
			for _, r := range d.Workflows {
				refOcc(&x, r)
			}
			for _, r := range d.Activities {
				refOcc(&x, r)
			}
			for _, r := range d.Services {
				refOcc(&x, r)
			}
		case *ast.NamespaceDef:
			x.file, x.owner = d.SourceFile, d
			x.decl(d, d.NamePos, d.Name)
			for _, w := range d.Workers {
				refOcc(&x, w.Worker)
			}
			for i := range d.Endpoints {
				ep := &d.Endpoints[i]
				x.decl(ep, ep.NamePos, ep.EndpointName)
				x.callers(ep, src.open(x.file).lines, namespaces)
			}
		}
	}
	return x.out
}

type indexer struct {
	file  string
	owner ast.Definition
	out   []occurrence
}

func (x *indexer) add(pos ast.Pos, name string, decl ast.Node, isDecl bool) {
	if pos.Line > 0 {
		x.out = append(x.out, occurrence{file: x.file, Pos: pos, name: name, decl: decl, owner: x.owner, isDecl: isDecl})
	}
}

func (x *indexer) decl(n ast.Node, pos ast.Pos, name string) {
	x.add(pos, name, n, true)
}

// callers records each allowed_caller_namespaces entry of ep that spells a
// namespace's name as a reference to it, at the text inside its quotes. The
// AST keeps no entry positions, so they are found by lexing the entry's line.
func (x *indexer) callers(ep *ast.NamespaceEndpoint, lines []string, namespaces map[string]*ast.NamespaceDef) {
	if ep.Options == nil {
		return
	}
	for _, e := range ep.Options.Entries {
		if e.Key != "allowed_caller_namespaces" || e.Line < 1 || e.Line > len(lines) || e.Column < 1 {
			continue
		}
		line := lines[e.Line-1]
		start := min(e.Column-1, len(line))
		for _, tok := range lexer.New(line[start:]).AllTokens() {
			ns := namespaces[tok.Literal]
			if tok.Type != token.STRING || ns == nil || line[start+tok.Offset+1:start+tok.End-1] != tok.Literal {
				continue // an escape spells the name otherwise
			}
			x.add(ast.Pos{Line: e.Line, Column: start + tok.Offset + 2}, tok.Literal, ns, false)
		}
	}
}

// refOcc records a reference, keeping an unresolved one's decl a nil
// interface rather than a nil pointer.
func refOcc[T interface {
	comparable
	ast.Node
}](x *indexer, r ast.Ref[T]) {
	var decl ast.Node
	var zero T
	if r.Resolved != zero {
		decl = r.Resolved
	}
	x.add(r.Pos, r.Name, decl, false)
}

func (x *indexer) stmts(stmts []ast.Statement) {
	ast.WalkStatements(stmts, func(s ast.Statement) bool {
		switch n := s.(type) {
		case *ast.ActivityCall:
			refOcc(x, n.Activity)
		case *ast.WorkflowCall:
			refOcc(x, n.Workflow)
		case *ast.SignalSendStmt:
			if n.Head.Kind == ast.SendHeadType {
				refOcc(x, n.Head.Type)
			} else {
				refOcc(x, n.Head.Handle)
			}
			var decl ast.Node
			if wf := n.Target(); wf != nil {
				decl = wf.Signal(n.Signal)
			}
			x.add(n.SignalPos, n.Signal, decl, false)
		case *ast.NexusCall:
			refOcc(x, n.Endpoint)
			refOcc(x, n.Service)
			refOcc(x, n.Operation)
		case *ast.SetStmt:
			refOcc(x, n.Condition)
		case *ast.UnsetStmt:
			refOcc(x, n.Condition)
		case *ast.PromiseStmt:
			x.decl(n, n.NamePos, n.Name)
		}
		return true
	}, ast.WithAsyncTargets(func(target ast.AsyncTarget, _ ast.Statement) bool {
		switch t := target.(type) {
		case *ast.SignalTarget:
			refOcc(x, t.Signal)
		case *ast.UpdateTarget:
			refOcc(x, t.Update)
		case *ast.ActivityTarget:
			refOcc(x, t.Activity)
		case *ast.WorkflowTarget:
			refOcc(x, t.Workflow)
		case *ast.NexusTarget:
			refOcc(x, t.Endpoint)
			refOcc(x, t.Service)
			refOcc(x, t.Operation)
		case *ast.IdentTarget:
			var decl ast.Node
			switch {
			case t.Resolved.Promise != nil:
				decl = t.Resolved.Promise
			case t.Resolved.Condition != nil:
				decl = t.Resolved.Condition
			}
			x.add(t.Pos, t.Name, decl, false)
		}
		return true
	}))
}
