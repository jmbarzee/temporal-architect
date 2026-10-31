package validator

import (
	"fmt"
	"slices"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
)

// checkParentSends checks every `id: parent` send against the model's child
// starts: the claimed type must start the sender somewhere (NOT_A_PARENT), and
// every other type that starts the sender must declare the signal too, since at
// runtime the parent may be any of them (STARTER_LACKS_SIGNAL).
func (v *validationCtx) checkParentSends(defs []ast.Definition) {
	starters := map[*ast.WorkflowDef][]*ast.WorkflowDef{}
	addStarter := func(child, parent *ast.WorkflowDef) {
		if child != nil && !slices.Contains(starters[child], parent) {
			starters[child] = append(starters[child], parent)
		}
	}
	for _, wf := range workflowsOf(defs) {
		walkWorkflow(wf, func(s ast.Statement) {
			if call, ok := s.(*ast.WorkflowCall); ok {
				addStarter(call.Workflow.Resolved, wf)
			}
		}, func(t ast.AsyncTarget) {
			if wt, ok := t.(*ast.WorkflowTarget); ok {
				addStarter(wt.Workflow.Resolved, wf)
			}
		})
	}

	for _, sender := range workflowsOf(defs) {
		walkWorkflow(sender, func(s ast.Statement) {
			send, ok := s.(*ast.SignalSendStmt)
			if !ok || send.Head.Address == nil || send.Head.Address.ID.Kind != ast.IDParent {
				return
			}
			claimed := send.Head.Type.Resolved
			if claimed == nil {
				return
			}
			if !slices.Contains(starters[sender], claimed) {
				v.errs = append(v.errs, &Error{
					Msg:      fmt.Sprintf("id: parent claims workflow %s is the parent, but %s never starts %s as a child in this model", claimed.Name, claimed.Name, sender.Name),
					Line:     send.Head.Address.ID.Line,
					Column:   send.Head.Address.ID.Column,
					Severity: "warning",
					Kind:     ErrNotAParent,
					Name:     claimed.Name,
				})
			}
			for _, other := range starters[sender] {
				if other == claimed || slices.ContainsFunc(other.Signals, func(d *ast.SignalDecl) bool { return d.Name == send.Signal }) {
					continue
				}
				v.errs = append(v.errs, &Error{
					Msg:      fmt.Sprintf("%s is also started by workflow %s, which declares no signal %s; sent via id: parent it would fail there", sender.Name, other.Name, send.Signal),
					Line:     send.Line,
					Column:   send.Column,
					Severity: "warning",
					Kind:     ErrStarterLacksSignal,
					Name:     other.Name,
				})
			}
		}, nil)
	}
}

// checkIDSchemeOverlap hints at two workflow types hosted in one namespace whose
// id_schemes could produce the same ID: a start of one could then collide with,
// or a send could reach, a running instance of the other.
func (v *validationCtx) checkIDSchemeOverlap(defs []ast.Definition) {
	reported := map[[2]*ast.WorkflowDef]bool{}
	for _, def := range defs {
		ns, ok := def.(*ast.NamespaceDef)
		if !ok {
			continue
		}
		var hosted []*ast.WorkflowDef
		for _, nw := range ns.Workers {
			if nw.Worker.Resolved == nil {
				continue
			}
			for _, ref := range nw.Worker.Resolved.Workflows {
				if wf := ref.Resolved; wf != nil && wf.IDScheme != nil && !slices.Contains(hosted, wf) {
					hosted = append(hosted, wf)
				}
			}
		}
		for i, a := range hosted {
			for _, b := range hosted[i+1:] {
				pair := [2]*ast.WorkflowDef{a, b}
				if reported[pair] || reported[[2]*ast.WorkflowDef{b, a}] || !templatesOverlap(a.IDScheme.Template, b.IDScheme.Template) {
					continue
				}
				reported[pair] = true
				v.errs = append(v.errs, &Error{
					Msg:      fmt.Sprintf("id_scheme %q of workflow %s and %q of workflow %s could produce the same ID in namespace %s", b.IDScheme.Template, b.Name, a.IDScheme.Template, a.Name, ns.Name),
					Line:     b.IDScheme.Line,
					Column:   b.IDScheme.Column,
					Severity: "hint",
					Kind:     ErrIDSchemeOverlap,
					Name:     b.Name,
				})
			}
		}
	}
}

// templatesOverlap reports whether some string matches both ID templates, each
// hole standing for one or more arbitrary characters.
func templatesOverlap(a, b string) bool {
	pa, pb := globOf(a), globOf(b)
	memo := map[[2]int]bool{}
	var match func(i, j int) bool
	match = func(i, j int) bool {
		key := [2]int{i, j}
		if r, ok := memo[key]; ok {
			return r
		}
		var r bool
		switch {
		case i == len(pa) && j == len(pb):
			r = true
		case i < len(pa) && pa[i] == globStar:
			r = match(i+1, j) || (j < len(pb) && match(i, j+1))
		case j < len(pb) && pb[j] == globStar:
			r = match(i, j+1) || (i < len(pa) && match(i+1, j))
		case i < len(pa) && j < len(pb):
			r = (pa[i] == globAny || pb[j] == globAny || pa[i] == pb[j]) && match(i+1, j+1)
		}
		memo[key] = r
		return r
	}
	return match(0, 0)
}

const (
	globAny  = -1 // exactly one character
	globStar = -2 // zero or more characters
)

// globOf turns an ID template into glob tokens: fixed bytes, and each hole as
// globAny followed by globStar.
func globOf(template string) []int {
	fixed, holes, msg := ast.ParseIDTemplate(template)
	if msg != "" {
		return nil
	}
	var out []int
	for i, f := range fixed {
		for _, c := range []byte(f) {
			out = append(out, int(c))
		}
		if i < len(holes) {
			out = append(out, globAny, globStar)
		}
	}
	return out
}

func workflowsOf(defs []ast.Definition) []*ast.WorkflowDef {
	var out []*ast.WorkflowDef
	for _, def := range defs {
		if wf, ok := def.(*ast.WorkflowDef); ok {
			out = append(out, wf)
		}
	}
	return out
}

// walkWorkflow visits every statement, and every async target when onTarget is
// non-nil, in a workflow's body and its handlers.
func walkWorkflow(wf *ast.WorkflowDef, onStmt func(ast.Statement), onTarget func(ast.AsyncTarget)) {
	bodies := [][]ast.Statement{wf.Body}
	for _, s := range wf.Signals {
		bodies = append(bodies, s.Body)
	}
	for _, q := range wf.Queries {
		bodies = append(bodies, q.Body)
	}
	for _, u := range wf.Updates {
		bodies = append(bodies, u.Body)
	}
	var opts []ast.WalkOption
	if onTarget != nil {
		opts = append(opts, ast.WithAsyncTargets(func(t ast.AsyncTarget, _ ast.Statement) bool {
			onTarget(t)
			return true
		}))
	}
	for _, body := range bodies {
		ast.WalkStatements(body, func(s ast.Statement) bool {
			onStmt(s)
			return true
		}, opts...)
	}
}
