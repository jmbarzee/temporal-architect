// Package effective computes the options a call runs with. Each key comes from
// the call site, else the target's default_options, else Temporal's default. A
// written nested block replaces the layers below it whole, and Temporal fills
// the fields it leaves out. The start kind decides what applies: a child start
// carries no conflict policy, and a detached one abandons its child. A key is
// absent when Temporal takes it from the caller or has no default.
//
// A check reads the effective value, since Temporal acts on it. Provenance only
// decides where a finding lands: the call site's entry before the definition's,
// and the call itself for a Temporal default, which is never a site.
package effective

import "github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"

// Source is where an effective option comes from.
type Source int

const (
	CallSite   Source = iota + 1 // the call's options:, or its statement kind
	Definition                   // the target's default_options:
	Temporal                     // Temporal's default
)

// Option is one effective option; an absent key's is the zero Option. The
// fields Temporal fills in a written block take the block's Source.
type Option struct {
	*ast.OptionEntry // zero Pos when From is Temporal
	From             Source
}

// Written reports whether the design writes o, at the call site or in the
// definition.
func (o Option) Written() bool { return o.From == CallSite || o.From == Definition }

// Options are a call's effective options by key.
type Options map[string]Option

const (
	conflictPolicy    = "workflow_id_conflict_policy"
	parentClosePolicy = "parent_close_policy"
)

// Of returns the effective options of the call s makes, directly or through
// its async target; false when s makes none.
func Of(s ast.Statement) (Options, bool) {
	switch n := s.(type) {
	case *ast.ActivityCall:
		return activityOptions(n.Options, n.Activity.Resolved), true
	case *ast.WorkflowCall:
		o := workflowOptions(n.Start, n.Options, n.Workflow.Resolved)
		if n.Mode == ast.CallDetach && n.Start == ast.StartChild {
			o[parentClosePolicy] = Option{&ast.OptionEntry{Pos: n.Pos, Key: parentClosePolicy, Value: "ABANDON", ValueType: "enum"}, CallSite}
		}
		return o, true
	case *ast.NexusCall:
		return resolve(nexusCall, n.Options, nil), true
	}
	switch t := ast.AsyncTargetOf(s).(type) {
	case *ast.ActivityTarget:
		return activityOptions(nil, t.Activity.Resolved), true
	case *ast.WorkflowTarget:
		return workflowOptions(t.Start, nil, t.Workflow.Resolved), true
	case *ast.NexusTarget:
		return resolve(nexusCall, nil, nil), true
	}
	return nil, false
}

func activityOptions(site *ast.OptionsBlock, def *ast.ActivityDef) Options {
	var defaults *ast.OptionsBlock
	if def != nil {
		defaults = def.DefaultOptions
	}
	return resolve(activity, site, defaults)
}

func workflowOptions(kind ast.StartKind, site *ast.OptionsBlock, def *ast.WorkflowDef) Options {
	var defaults *ast.OptionsBlock
	if def != nil {
		defaults = def.DefaultOptions
	}
	if kind == ast.StartClient {
		return resolve(clientStart, site, defaults)
	}
	o := resolve(childStart, site, defaults)
	delete(o, conflictPolicy)
	return o
}

// resolve layers a call of kind k: the call site over the definition over
// Temporal.
func resolve(k start, site, def *ast.OptionsBlock) Options {
	o := Options{}
	o.set(def, Definition)
	o.set(site, CallSite)
	written := func(key string) *ast.OptionEntry {
		if w := o[key]; w.Written() {
			return w.OptionEntry
		}
		return nil
	}
	for _, r := range temporalDefaults[k] {
		switch w := o[r.key]; {
		case w.Written() && r.fields != nil:
			o[r.key] = Option{fill(w.OptionEntry, r.fields), w.From}
		case !w.Written():
			if e := r.entry(written); e != nil {
				o[r.key] = Option{e, Temporal}
			}
		}
	}
	return o
}

func (o Options) set(b *ast.OptionsBlock, from Source) {
	if b == nil {
		return
	}
	for _, e := range b.Entries {
		o[e.Key] = Option{e, from}
	}
}
