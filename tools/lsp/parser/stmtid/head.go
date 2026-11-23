package stmtid

import (
	"strings"
	"unicode"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
)

// head renders s's first line from its fields, as written up to whitespace:
// without its trailing ':', comment, options: block or send address, and a
// handler without its parameters.
func head(s ast.Statement) string {
	return squeeze(line(s))
}

func line(s ast.Statement) string {
	switch s := s.(type) {
	case *ast.ActivityCall:
		return call("activity", ref(s.Activity), s.Args, s.Result)
	case *ast.WorkflowCall:
		return detach(s.Mode == ast.CallDetach) + call("workflow", ref(s.Workflow), s.Args, s.Result)
	case *ast.NexusCall:
		return detach(s.Detach) + call("nexus "+s.Endpoint.Name, ref(s.Service)+"."+s.Operation.Name, s.Args, s.Result)
	case *ast.SignalSendStmt:
		to := s.Head.Handle.Name
		if s.Head.Kind == ast.SendHeadType {
			to = ref(s.Head.Type)
		}
		return "signal " + to + "." + s.Signal + "(" + s.Args + ")"
	case *ast.PromiseStmt:
		return "promise " + s.Name + " <- " + target(s.Target)
	case *ast.AwaitStmt:
		return "await " + target(s.Target)
	case *ast.AwaitAllBlock:
		return "await all"
	case *ast.AwaitOneBlock:
		return "await one"
	case *ast.AwaitOneCase:
		if s.AwaitAll != nil {
			return "await all"
		}
		return target(s.Target)
	case *ast.SwitchBlock:
		return "switch (" + s.Expr + ")"
	case *ast.SwitchCase:
		return "case " + s.Value
	case *ast.IfStmt:
		return "if (" + s.Condition + ")"
	case *ast.ForStmt:
		switch s.Variant {
		case ast.ForConditional:
			return "for (" + s.Condition + ")"
		case ast.ForIteration:
			return "for (" + s.Variable + " in " + s.Iterable + ")"
		}
		return "for"
	case *ast.ReturnStmt:
		return "return " + s.Value
	case *ast.CloseStmt:
		reason := [...]string{ast.CloseComplete: "complete", ast.CloseFailWorkflow: "fail", ast.CloseContinueAsNew: "continue_as_new"}[s.Reason]
		if s.Args == "" {
			return "close " + reason
		}
		return "close " + reason + "(" + s.Args + ")"
	case *ast.BreakStmt:
		return "break"
	case *ast.ContinueStmt:
		return "continue"
	case *ast.SetStmt:
		return "set " + s.Condition.Name
	case *ast.UnsetStmt:
		return "unset " + s.Condition.Name
	case *ast.RawStmt:
		return s.Text
	case *ast.SignalDecl:
		return "signal " + s.Name
	case *ast.UpdateDecl:
		return "update " + s.Name
	case *ast.QueryDecl:
		return "query " + s.Name
	}
	return ""
}

// target renders an awaited or promised operation.
func target(t ast.AsyncTarget) string {
	switch t := t.(type) {
	case *ast.TimerTarget:
		return "timer(" + t.Duration + ")"
	case *ast.SignalTarget:
		return "signal " + t.Signal.Name + binding(t.Params)
	case *ast.UpdateTarget:
		return "update " + t.Update.Name + binding(t.Params)
	case *ast.ActivityTarget:
		return call("activity", ref(t.Activity), t.Args, t.Result)
	case *ast.WorkflowTarget:
		return call("workflow", ref(t.Workflow), t.Args, t.Result)
	case *ast.NexusTarget:
		return call("nexus "+t.Endpoint.Name, ref(t.Service)+"."+t.Operation.Name, t.Args, t.Result)
	case *ast.IdentTarget:
		return t.Name + arrow(t.Result)
	}
	return ""
}

func call(keyword, name, args, result string) string {
	return keyword + " " + name + "(" + args + ")" + arrow(result)
}

func detach(on bool) string {
	if on {
		return "detach "
	}
	return ""
}

func ref[T any](r ast.Ref[T]) string {
	if r.Package == "" {
		return r.Name
	}
	return r.Package + "." + r.Name
}

func arrow(result string) string {
	if result == "" {
		return ""
	}
	return " -> " + result
}

// binding renders a signal or update arrival's parameter binding. The AST
// keeps a parenthesized list without its parentheses, so one parameter
// written in them renders bare.
func binding(params string) string {
	if strings.Contains(params, ",") {
		return " -> (" + params + ")"
	}
	return arrow(params)
}

// squeeze trims s and collapses each run of whitespace outside strings to a
// space, or to nothing inside a bracket's edge, so a multi-line argument
// list renders on one line.
func squeeze(s string) string {
	var b strings.Builder
	space, last := false, rune(0)
	scan(strings.TrimSpace(s), func(_ int, r rune, quoted bool) {
		if !quoted && unicode.IsSpace(r) {
			space = true
			return
		}
		if space && !strings.ContainsRune("([{", last) && !strings.ContainsRune(")]}", r) {
			b.WriteByte(' ')
		}
		space, last = false, r
		b.WriteRune(r)
	})
	return b.String()
}
