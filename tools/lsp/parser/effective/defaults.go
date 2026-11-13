package effective

import (
	"slices"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
)

// start is the Temporal operation a call becomes.
type start int

const (
	activity start = iota
	childStart
	clientStart
	nexusCall
)

// A row is Temporal's default for key: value, or else the effective value of
// sameAs, whose row comes first. Unlimited is spelled as Temporal spells it: a
// 0s timeout, or maximum_attempts: 0.
type row struct {
	key    string
	value  *ast.OptionEntry
	sameAs string
	doc    string // the docs.temporal.io page that states it
}

const (
	activityFailures = "https://docs.temporal.io/encyclopedia/detecting-activity-failures"
	retryPolicies    = "https://docs.temporal.io/encyclopedia/retry-policies"
	workflowFailures = "https://docs.temporal.io/encyclopedia/detecting-workflow-failures"
	workflowIDs      = "https://docs.temporal.io/workflow-execution/workflowid-runid"
	parentClose      = "https://docs.temporal.io/parent-close-policy"
	priorities       = "https://docs.temporal.io/develop/task-queue-priority-fairness"
	nexusOperations  = "https://docs.temporal.io/nexus/operations"
)

var workflowStart = []row{
	{key: "workflow_execution_timeout", value: scalar("duration", "0s"), doc: workflowFailures},
	{key: "workflow_run_timeout", sameAs: "workflow_execution_timeout", doc: workflowFailures},
	{key: "workflow_task_timeout", value: scalar("duration", "10s"), doc: workflowFailures},
	{key: "workflow_id_reuse_policy", value: scalar("enum", "ALLOW_DUPLICATE"), doc: workflowIDs},
}

var temporalDefaults = map[start][]row{
	activity: {
		{key: "schedule_to_close_timeout", value: scalar("duration", "0s"), doc: activityFailures},
		{key: "schedule_to_start_timeout", sameAs: "schedule_to_close_timeout", doc: activityFailures},
		{key: "start_to_close_timeout", sameAs: "schedule_to_close_timeout", doc: activityFailures},
		{key: "heartbeat_timeout", value: scalar("duration", "0s"), doc: activityFailures},
		{key: "retry_policy", value: block(
			field("initial_interval", "duration", "1s"),
			field("backoff_coefficient", "number", "2.0"),
			field("maximum_interval", "duration", "100s"),
			field("maximum_attempts", "number", "0"),
		), doc: retryPolicies},
	},
	childStart: slices.Concat(workflowStart, []row{
		{key: parentClosePolicy, value: scalar("enum", "TERMINATE"), doc: parentClose},
	}),
	clientStart: slices.Concat(workflowStart, []row{
		{key: conflictPolicy, value: scalar("enum", "FAIL"), doc: workflowIDs},
		{key: "priority", value: block(
			field("priority_key", "number", "3"),
			field("fairness_weight", "number", "1.0"),
		), doc: priorities},
	}),
	// The server caps an unset schedule_to_close_timeout at its maximum.
	nexusCall: {
		{key: "schedule_to_close_timeout", value: scalar("duration", "0s"), doc: nexusOperations},
		{key: "schedule_to_start_timeout", sameAs: "schedule_to_close_timeout", doc: nexusOperations},
		{key: "start_to_close_timeout", sameAs: "schedule_to_close_timeout", doc: nexusOperations},
	},
}

// entry returns r's value as an entry of its own, given o's effective options.
func (r row) entry(o Options) *ast.OptionEntry {
	v := r.value
	if r.sameAs != "" {
		v = o[r.sameAs].OptionEntry
	}
	return &ast.OptionEntry{Key: r.key, Value: v.Value, ValueType: v.ValueType, Nested: v.Nested}
}

func scalar(valueType, value string) *ast.OptionEntry {
	return &ast.OptionEntry{Value: value, ValueType: valueType}
}

func field(key, valueType, value string) *ast.OptionEntry {
	return &ast.OptionEntry{Key: key, Value: value, ValueType: valueType}
}

func block(fields ...*ast.OptionEntry) *ast.OptionEntry {
	return &ast.OptionEntry{Nested: fields}
}
