package effective

import (
	"strings"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
)

var names = map[start]string{activity: "activity", childStart: "child start", clientStart: "client start", nexusCall: "nexus call"}

// call returns a call of kind k with call-site options site.
func call(k start, site *ast.OptionsBlock) ast.Statement {
	switch k {
	case activity:
		return &ast.ActivityCall{Options: site}
	case childStart:
		return &ast.WorkflowCall{Start: ast.StartChild, Options: site}
	case clientStart:
		return &ast.WorkflowCall{Start: ast.StartClient, Options: site}
	}
	return &ast.NexusCall{Options: site}
}

func TestTemporalDefaults(t *testing.T) {
	retry2s := options(block("retry_policy", field("initial_interval", "duration", "2s")))
	tests := []struct {
		call start
		site *ast.OptionsBlock
		key  string
		want string
	}{
		{activity, nil, "schedule_to_close_timeout", "0s from Temporal"},
		{activity, nil, "schedule_to_start_timeout", "0s from Temporal"},
		{activity, nil, "start_to_close_timeout", "absent"},
		{activity, nil, "heartbeat_timeout", "0s from Temporal"},
		{activity, nil, "retry_policy", "initial_interval: 1s, backoff_coefficient: 2.0, maximum_interval: 100s, maximum_attempts: 0 from Temporal"},
		{activity, nil, "task_queue", "absent"},
		{activity, nil, "priority", "absent"},
		{childStart, nil, "workflow_execution_timeout", "0s from Temporal"},
		{childStart, nil, "workflow_run_timeout", "0s from Temporal"},
		{childStart, nil, "workflow_task_timeout", "10s from Temporal"},
		{childStart, nil, "workflow_id_reuse_policy", "ALLOW_DUPLICATE from Temporal"},
		{childStart, nil, "retry_policy", "absent"},
		{childStart, retry2s, "retry_policy", "initial_interval: 2s, backoff_coefficient: 2.0, maximum_interval: 200s, maximum_attempts: 0 from call site"},
		{childStart, nil, "parent_close_policy", "TERMINATE from Temporal"},
		{childStart, nil, "task_queue", "absent"},
		{childStart, nil, "priority", "absent"},
		{clientStart, nil, "workflow_execution_timeout", "0s from Temporal"},
		{clientStart, nil, "workflow_run_timeout", "0s from Temporal"},
		{clientStart, nil, "workflow_task_timeout", "10s from Temporal"},
		{clientStart, nil, "workflow_id_reuse_policy", "ALLOW_DUPLICATE from Temporal"},
		{clientStart, retry2s, "retry_policy", "initial_interval: 2s, backoff_coefficient: 2.0, maximum_interval: 200s, maximum_attempts: 0 from call site"},
		{clientStart, nil, "workflow_id_conflict_policy", "FAIL from Temporal"},
		{clientStart, nil, "priority", "priority_key: 3, fairness_weight: 1.0 from Temporal"},
		{clientStart, nil, "task_queue", "absent"},
		{nexusCall, nil, "schedule_to_close_timeout", "0s from Temporal"},
		{nexusCall, nil, "schedule_to_start_timeout", "0s from Temporal"},
		{nexusCall, nil, "start_to_close_timeout", "0s from Temporal"},
	}
	tested := map[start]map[string]bool{}
	for _, tt := range tests {
		o, _ := Of(call(tt.call, tt.site))
		if got := describe(o[tt.key]); got != tt.want {
			t.Errorf("%s %s = %s, want %s", names[tt.call], tt.key, got, tt.want)
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

func TestPrecedence(t *testing.T) {
	def := &ast.ActivityDef{DefaultOptions: options(
		field("task_queue", "string", "def-q"),
		field("heartbeat_timeout", "duration", "30s"),
		block("retry_policy", field("maximum_attempts", "number", "5")),
	)}
	site := options(
		field("task_queue", "string", "site-q"),
		field("schedule_to_close_timeout", "duration", "5m"),
		block("retry_policy", field("initial_interval", "duration", "1.5s")),
	)
	o, _ := Of(&ast.ActivityCall{Activity: ast.Ref[*ast.ActivityDef]{Resolved: def}, Options: site})
	for key, want := range map[string]string{
		"task_queue":                "site-q from call site",
		"schedule_to_close_timeout": "5m from call site",
		"retry_policy":              "initial_interval: 1.5s, backoff_coefficient: 2.0, maximum_interval: 150s, maximum_attempts: 0 from call site",
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
		block("priority", field("fairness_key", "string", "tenant")),
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
		{"child", child, "priority", "fairness_key: tenant from definition"},
		{"client", client, conflictPolicy, "USE_EXISTING from definition"},
		{"client", client, "priority", "fairness_key: tenant, priority_key: 3, fairness_weight: 1.0 from definition"},
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

func TestAbsentIsNotWritten(t *testing.T) {
	o, _ := Of(call(activity, nil))
	if absent := o["task_queue"]; absent.From == CallSite || absent.Written() {
		t.Errorf("absent task_queue reads as written: %+v", absent)
	}
}

func options(entries ...*ast.OptionEntry) *ast.OptionsBlock {
	return &ast.OptionsBlock{Entries: entries}
}

func field(key, valueType, value string) *ast.OptionEntry {
	return &ast.OptionEntry{Key: key, Value: value, ValueType: valueType}
}

func block(key string, fields ...*ast.OptionEntry) *ast.OptionEntry {
	return &ast.OptionEntry{Key: key, Nested: fields}
}

var sources = map[Source]string{CallSite: "call site", Definition: "definition", Temporal: "Temporal"}

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
