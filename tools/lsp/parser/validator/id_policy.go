package validator

import (
	"fmt"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/effective"
)

const (
	reusePolicyKey    = "workflow_id_reuse_policy"
	conflictPolicyKey = "workflow_id_conflict_policy"
)

// checkIDPolicies checks workflow ID reuse and conflict policies against the
// start that carries them. The checks are body-local, so they run on every
// declaration, a dropped duplicate's included (see walkAllBodies).
func (v *validationCtx) checkIDPolicies(defs []ast.Definition) {
	for _, def := range defs {
		switch d := def.(type) {
		case *ast.WorkflowDef:
			v.checkDefaultIDPolicies(d)
			walkWorkflow(d, false, func(s ast.Statement) {
				if call, ok := s.(*ast.WorkflowCall); ok {
					v.checkChildStart(call.Workflow.Resolved, call, d.SourceFile)
				}
			}, func(t ast.AsyncTarget, parent ast.Statement) {
				if wt, ok := t.(*ast.WorkflowTarget); ok {
					v.checkChildStart(wt.Workflow.Resolved, parent, d.SourceFile)
				}
			})
		case *ast.NexusServiceDef:
			for _, op := range d.Operations {
				if op.OpType == ast.NexusOpAsync {
					v.checkNexusRunScheme(d, op)
					continue
				}
				ast.WalkStatements(op.Body, func(s ast.Statement) bool {
					if call, ok := s.(*ast.WorkflowCall); ok {
						v.checkClientStart(call, d.SourceFile)
					}
					return true
				})
			}
		}
	}
}

// checkDefaultIDPolicies checks a workflow's default policies, which every
// client start inherits, including starts outside the model.
func (v *validationCtx) checkDefaultIDPolicies(wf *ast.WorkflowDef) {
	reuse := optionEntry(wf.DefaultOptions, reusePolicyKey)
	conflict := optionEntry(wf.DefaultOptions, conflictPolicyKey)
	if rejectsPair(reuse, conflict) {
		v.errs = append(v.errs, &Error{
			Msg:    fmt.Sprintf("workflow %s's default_options pair %s: TERMINATE_EXISTING with %s: REJECT_DUPLICATE; Temporal (server 1.27+, default config) rejects every client start that sends both; use ALLOW_DUPLICATE for latest-wins, or USE_EXISTING or FAIL for once per key", wf.Name, conflictPolicyKey, reusePolicyKey),
			Line:   conflict.Line,
			Column: conflict.Column,
			Kind:   ErrIDPolicyIncompatible,
			Name:   wf.Name,
			File:   wf.SourceFile,
		})
	}
	v.checkPoliciesNeedScheme(wf, wf.SourceFile, reuse, conflict)
}

// checkChildStart checks s, a child start of target in file. A child start
// cannot carry a conflict policy, so a type whose starts default to joining or
// replacing a running instance is not honoured here.
func (v *validationCtx) checkChildStart(target *ast.WorkflowDef, s ast.Statement, file string) {
	if target == nil {
		return
	}
	opts, _ := effective.Of(s)
	v.checkPoliciesNeedScheme(target, file, written(opts[reusePolicyKey]))
	if target.IDScheme == nil {
		return
	}
	conflict := optionEntry(target.DefaultOptions, conflictPolicyKey)
	if conflict == nil || conflict.Value == "FAIL" {
		return
	}
	v.errs = append(v.errs, &Error{
		Msg:      fmt.Sprintf("%s's starts default to %s: %s, but this child start cannot carry it and fails on a running %s with the same ID; if that is intended, no change is needed, otherwise signal the running one or start it from a client start", target.Name, conflictPolicyKey, conflict.Value, target.Name),
		Line:     s.NodeLine(),
		Column:   s.NodeColumn(),
		Severity: "hint",
		Kind:     ErrChildStartConflictMismatch,
		Name:     target.Name,
		File:     file,
	})
}

// checkClientStart checks a start in a sync nexus operation body in file by
// its effective policies. A pair made only of defaults is reported once, on
// the definition.
func (v *validationCtx) checkClientStart(call *ast.WorkflowCall, file string) {
	target := call.Workflow.Resolved
	if target == nil {
		return
	}
	opts, _ := effective.Of(call)
	reuse, conflict := written(opts[reusePolicyKey]), written(opts[conflictPolicyKey])
	v.checkPoliciesNeedScheme(target, file, reuse, conflict)
	if !rejectsPair(opts[reusePolicyKey].OptionEntry, opts[conflictPolicyKey].OptionEntry) {
		return
	}
	var msg string
	at := reuse
	switch {
	case reuse != nil && conflict != nil:
		msg = fmt.Sprintf("this start pairs %s: TERMINATE_EXISTING with %s: REJECT_DUPLICATE", conflictPolicyKey, reusePolicyKey)
		if conflict.Line < reuse.Line {
			at = conflict
		}
	case reuse != nil:
		msg = fmt.Sprintf("this start's %s: REJECT_DUPLICATE meets %s's default %s: TERMINATE_EXISTING", reusePolicyKey, target.Name, conflictPolicyKey)
	case conflict != nil:
		at = conflict
		msg = fmt.Sprintf("this start's %s: TERMINATE_EXISTING meets %s's default %s: REJECT_DUPLICATE", conflictPolicyKey, target.Name, reusePolicyKey)
	default:
		return
	}
	v.errs = append(v.errs, &Error{
		Msg:    msg + "; Temporal (server 1.27+, default config) rejects the start",
		Line:   at.Line,
		Column: at.Column,
		Kind:   ErrIDPolicyIncompatible,
		Name:   target.Name,
		File:   file,
	})
}

// checkPoliciesNeedScheme hints at each policy, written in file, for a workflow
// with no id_scheme: no start in the model repeats its ID, so the policy acts
// only on a starter outside the design that picks a repeating ID.
func (v *validationCtx) checkPoliciesNeedScheme(wf *ast.WorkflowDef, file string, entries ...*ast.OptionEntry) {
	if wf.IDScheme != nil {
		return
	}
	for _, e := range entries {
		if e == nil {
			continue
		}
		v.errs = append(v.errs, &Error{
			Msg:      fmt.Sprintf("workflow %s has no id_scheme, so no start in this design repeats its ID and %s applies only if a starter outside the design does; declare the scheme that makes starts share an ID", wf.Name, e.Key),
			Line:     e.Line,
			Column:   e.Column,
			Severity: "hint",
			Kind:     ErrIDPolicyWithoutIDScheme,
			Name:     wf.Name,
			File:     file,
		})
	}
}

// checkNexusRunScheme warns when an async nexus operation starts a workflow with
// no id_scheme. A nexus run operation's start may be retried, so the workflow ID must
// derive from the operation input, which in .twf is the backing workflow's scheme.
func (v *validationCtx) checkNexusRunScheme(svc *ast.NexusServiceDef, op *ast.NexusOperation) {
	wf := op.Workflow.Resolved
	if wf == nil || wf.IDScheme != nil {
		return
	}
	v.errs = append(v.errs, &Error{
		Msg:      fmt.Sprintf("async operation %s starts workflow %s, which has no id_scheme; a nexus run operation's start may be retried, so the workflow ID must derive from the input; declare %s's id_scheme", op.Name, wf.Name, wf.Name),
		Line:     op.Line,
		Column:   op.Column,
		Severity: "warning",
		Kind:     ErrNexusRunWithoutIDScheme,
		Name:     wf.Name,
		File:     svc.SourceFile,
	})
}

// rejectsPair reports whether a client start sending reuse and conflict would
// be rejected: Temporal refuses TERMINATE_EXISTING with REJECT_DUPLICATE.
func rejectsPair(reuse, conflict *ast.OptionEntry) bool {
	return reuse != nil && conflict != nil && reuse.Value == "REJECT_DUPLICATE" && conflict.Value == "TERMINATE_EXISTING"
}

// written returns o's entry when the call site wrote it, else nil.
func written(o effective.Option) *ast.OptionEntry {
	if o.From != effective.CallSite {
		return nil
	}
	return o.OptionEntry
}

// optionEntry returns the top-level entry for key in opts, or nil.
func optionEntry(opts *ast.OptionsBlock, key string) *ast.OptionEntry {
	if opts == nil {
		return nil
	}
	for _, e := range opts.Entries {
		if e.Key == key {
			return e
		}
	}
	return nil
}
