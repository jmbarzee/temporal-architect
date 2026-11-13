package effective

import (
	"strings"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
)

var calls = map[start]ast.Statement{
	activity:    &ast.ActivityCall{},
	childStart:  &ast.WorkflowCall{Start: ast.StartChild},
	clientStart: &ast.WorkflowCall{Start: ast.StartClient},
	nexusCall:   &ast.NexusCall{},
}

var names = map[start]string{activity: "activity", childStart: "child start", clientStart: "client start", nexusCall: "nexus call"}

func TestTemporalDefaults(t *testing.T) {
	tests := []struct {
		call start
		key  string
		want string
	}{
		{activity, "schedule_to_close_timeout", "0s"},
		{activity, "schedule_to_start_timeout", "0s"},
		{activity, "start_to_close_timeout", "0s"},
		{activity, "heartbeat_timeout", "0s"},
		{activity, "retry_policy", "initial_interval: 1s, backoff_coefficient: 2.0, maximum_interval: 100s, maximum_attempts: 0"},
		{childStart, "workflow_execution_timeout", "0s"},
		{childStart, "workflow_run_timeout", "0s"},
		{childStart, "workflow_task_timeout", "10s"},
		{childStart, "workflow_id_reuse_policy", "ALLOW_DUPLICATE"},
		{childStart, "parent_close_policy", "TERMINATE"},
		{clientStart, "workflow_execution_timeout", "0s"},
		{clientStart, "workflow_run_timeout", "0s"},
		{clientStart, "workflow_task_timeout", "10s"},
		{clientStart, "workflow_id_reuse_policy", "ALLOW_DUPLICATE"},
		{clientStart, "workflow_id_conflict_policy", "FAIL"},
		{clientStart, "priority", "priority_key: 3, fairness_weight: 1.0"},
		{nexusCall, "schedule_to_close_timeout", "0s"},
		{nexusCall, "schedule_to_start_timeout", "0s"},
		{nexusCall, "start_to_close_timeout", "0s"},
	}
	tested := map[start]map[string]bool{}
	for _, tt := range tests {
		o, _ := Of(calls[tt.call])
		if got, want := describe(o[tt.key]), tt.want+" from Temporal"; got != want {
			t.Errorf("%s %s = %s, want %s", names[tt.call], tt.key, got, want)
		}
		if tested[tt.call] == nil {
			tested[tt.call] = map[string]bool{}
		}
		tested[tt.call][tt.key] = true
	}
	for k, rows := range temporalDefaults {
		for _, r := range rows {
			if !tested[k][r.key] {
				t.Errorf("%s %s has no test", names[k], r.key)
			}
			if !strings.HasPrefix(r.doc, "https://docs.temporal.io/") {
				t.Errorf("%s %s cites %q, not docs.temporal.io", names[k], r.key, r.doc)
			}
		}
	}
}

func TestAbsentKeys(t *testing.T) {
	tests := []struct {
		call start
		key  string
	}{
		{activity, "task_queue"},
		{activity, "priority"},
		{childStart, "task_queue"},
		{childStart, "priority"},
		{childStart, "retry_policy"},
		{clientStart, "task_queue"},
		{clientStart, "retry_policy"},
	}
	for _, tt := range tests {
		o, _ := Of(calls[tt.call])
		if got := describe(o[tt.key]); got != "absent" {
			t.Errorf("%s %s = %s, want absent", names[tt.call], tt.key, got)
		}
	}
}

func TestPrecedence(t *testing.T) {
	def := &ast.ActivityDef{DefaultOptions: options(
		field("task_queue", "string", "def-q"),
		field("heartbeat_timeout", "duration", "30s"),
		retry(field("maximum_attempts", "number", "5")),
	)}
	site := options(
		field("task_queue", "string", "site-q"),
		field("schedule_to_close_timeout", "duration", "5m"),
		retry(field("initial_interval", "duration", "2s")),
	)
	o, _ := Of(&ast.ActivityCall{Activity: ast.Ref[*ast.ActivityDef]{Resolved: def}, Options: site})
	for key, want := range map[string]string{
		"task_queue":                "site-q from call site",
		"schedule_to_close_timeout": "5m from call site",
		"retry_policy":              "initial_interval: 2s from call site",
		"heartbeat_timeout":         "30s from definition",
		"schedule_to_start_timeout": "5m from Temporal",
		"start_to_close_timeout":    "5m from Temporal",
	} {
		if got := describe(o[key]); got != want {
			t.Errorf("%s = %s, want %s", key, got, want)
		}
	}
}

func TestStartKind(t *testing.T) {
	ref := ast.Ref[*ast.WorkflowDef]{Resolved: &ast.WorkflowDef{DefaultOptions: options(
		field("workflow_id_reuse_policy", "enum", "REJECT_DUPLICATE"),
		field("workflow_id_conflict_policy", "enum", "USE_EXISTING"),
	)}}
	at := ast.Pos{Line: 3, Column: 2}
	child, _ := Of(&ast.WorkflowCall{Start: ast.StartChild, Workflow: ref})
	client, _ := Of(&ast.AwaitStmt{Target: &ast.WorkflowTarget{Start: ast.StartClient, Workflow: ref}})
	detached, _ := Of(&ast.WorkflowCall{Pos: at, Mode: ast.CallDetach, Start: ast.StartChild, Workflow: ref})
	detachedClient, _ := Of(&ast.WorkflowCall{Mode: ast.CallDetach, Start: ast.StartClient, Workflow: ref})
	tests := []struct {
		name string
		o    Options
		key  string
		want string
	}{
		{"child", child, conflictPolicy, "absent"},
		{"child", child, "workflow_id_reuse_policy", "REJECT_DUPLICATE from definition"},
		{"client", client, conflictPolicy, "USE_EXISTING from definition"},
		{"detached", detached, parentClosePolicy, "ABANDON from call site"},
		{"detached client", detachedClient, parentClosePolicy, "absent"},
	}
	for _, tt := range tests {
		if got := describe(tt.o[tt.key]); got != tt.want {
			t.Errorf("%s %s = %s, want %s", tt.name, tt.key, got, tt.want)
		}
	}
	if got := detached[parentClosePolicy]; got.OptionEntry != nil && got.Pos != at {
		t.Errorf("detached %s at %v, want %v", parentClosePolicy, got.Pos, at)
	}
}

func TestNotACall(t *testing.T) {
	if o, ok := Of(&ast.Comment{}); ok {
		t.Errorf("Of(comment) = %v, true; want false", o)
	}
}

func options(entries ...*ast.OptionEntry) *ast.OptionsBlock {
	return &ast.OptionsBlock{Entries: entries}
}

func retry(fields ...*ast.OptionEntry) *ast.OptionEntry {
	e := block(fields...)
	e.Key = "retry_policy"
	return e
}

var sources = [...]string{CallSite: "call site", Definition: "definition", Temporal: "Temporal"}

// describe spells o as "value from source", a nested block's value as its
// key: value fields.
func describe(o Option) string {
	if o.OptionEntry == nil {
		return "absent"
	}
	value := o.Value
	if o.Nested != nil {
		fields := make([]string, len(o.Nested))
		for i, f := range o.Nested {
			fields[i] = f.Key + ": " + f.Value
		}
		value = strings.Join(fields, ", ")
	}
	return value + " from " + sources[o.From]
}
