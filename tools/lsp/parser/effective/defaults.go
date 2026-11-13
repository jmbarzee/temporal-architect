package effective

import (
	"math/big"
	"slices"
	"strings"

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

// A row is Temporal's default for key: the written value of sameAs, times
// times when set, else value. A nested row's fields fill the gaps of a written
// block, and of an unwritten one unless fillsOnly. A row with none is absent.
// Unlimited is spelled as Temporal spells it: a 0s timeout, or
// maximum_attempts: 0.
type row struct {
	key       string
	value     *ast.OptionEntry
	sameAs    string
	times     int64
	fields    []row
	fillsOnly bool
	doc       string // the docs.temporal.io page that states it
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

// retryFields fill a retry policy's gaps, as the server's EnsureDefaults does
// (temporalio/temporal common/retrypolicy/retry_policy.go).
var retryFields = []row{
	{key: "initial_interval", value: scalar("duration", "1s")},
	{key: "backoff_coefficient", value: scalar("number", "2.0")},
	{key: "maximum_interval", value: scalar("duration", "100s"), sameAs: "initial_interval", times: 100},
	{key: "maximum_attempts", value: scalar("number", "0")},
}

var workflowStart = []row{
	{key: "workflow_execution_timeout", value: scalar("duration", "0s"), doc: workflowFailures},
	{key: "workflow_run_timeout", value: scalar("duration", "0s"), sameAs: "workflow_execution_timeout", doc: workflowFailures},
	{key: "workflow_task_timeout", value: scalar("duration", "10s"), doc: workflowFailures},
	{key: "workflow_id_reuse_policy", value: scalar("enum", "ALLOW_DUPLICATE"), doc: workflowIDs},
	{key: "retry_policy", fields: retryFields, fillsOnly: true, doc: retryPolicies},
}

var temporalDefaults = map[start][]row{
	activity: {
		{key: "schedule_to_close_timeout", value: scalar("duration", "0s"), doc: activityFailures},
		// The server fills both from a written schedule_to_close_timeout, and
		// rejects an activity with neither it nor start_to_close_timeout; given
		// start_to_close_timeout alone, it bounds the other two by the caller's
		// run timeout (temporalio/temporal chasm/lib/activity/validator.go).
		{key: "schedule_to_start_timeout", value: scalar("duration", "0s"), sameAs: "schedule_to_close_timeout", doc: activityFailures},
		{key: "start_to_close_timeout", sameAs: "schedule_to_close_timeout", doc: activityFailures},
		{key: "heartbeat_timeout", value: scalar("duration", "0s"), doc: activityFailures},
		{key: "retry_policy", fields: retryFields, doc: retryPolicies},
	},
	childStart: slices.Concat(workflowStart, []row{
		{key: parentClosePolicy, value: scalar("enum", "TERMINATE"), doc: parentClose},
	}),
	clientStart: slices.Concat(workflowStart, []row{
		{key: conflictPolicy, value: scalar("enum", "FAIL"), doc: workflowIDs},
		{key: "priority", fields: []row{
			{key: "priority_key", value: scalar("number", "3")},
			{key: "fairness_weight", value: scalar("number", "1.0")},
		}, doc: priorities},
	}),
	// Temporal Cloud caps schedule_to_close_timeout at 60 days.
	nexusCall: {
		{key: "schedule_to_close_timeout", value: scalar("duration", "0s"), doc: nexusOperations},
		{key: "schedule_to_start_timeout", value: scalar("duration", "0s"), doc: nexusOperations},
		{key: "start_to_close_timeout", value: scalar("duration", "0s"), doc: nexusOperations},
	},
}

// entry returns r's default as an entry of its own, given a block's written
// entries, or nil when it has none.
func (r row) entry(written func(key string) *ast.OptionEntry) *ast.OptionEntry {
	if src := written(r.sameAs); r.sameAs != "" && src != nil {
		if v, ok := multiply(src.Value, r.times); ok {
			return &ast.OptionEntry{Key: r.key, Value: v, ValueType: src.ValueType}
		}
	}
	switch {
	case r.fields != nil && !r.fillsOnly:
		return fill(&ast.OptionEntry{Key: r.key}, r.fields)
	case r.value != nil:
		return &ast.OptionEntry{Key: r.key, Value: r.value.Value, ValueType: r.value.ValueType}
	}
	return nil
}

// fill returns a copy of block with the fields it leaves out taken from rows.
func fill(block *ast.OptionEntry, rows []row) *ast.OptionEntry {
	out := *block
	out.Nested = slices.Clone(block.Nested)
	written := func(key string) *ast.OptionEntry {
		for _, f := range block.Nested {
			if f.Key == key {
				return f
			}
		}
		return nil
	}
	for _, r := range rows {
		if written(r.key) == nil {
			if e := r.entry(written); e != nil {
				out.Nested = append(out.Nested, e)
			}
		}
	}
	return &out
}

// multiply returns the duration d times n, or d when n is unset.
func multiply(d string, n int64) (string, bool) {
	if n == 0 {
		return d, true
	}
	i := strings.LastIndexFunc(d, func(c rune) bool { return c == '.' || c >= '0' && c <= '9' }) + 1
	r, ok := new(big.Rat).SetString(d[:i])
	if !ok {
		return "", false
	}
	v := r.Mul(r, big.NewRat(n, 1)).FloatString(i)
	if strings.Contains(v, ".") {
		v = strings.TrimRight(strings.TrimRight(v, "0"), ".")
	}
	return v + d[i:], true
}

func scalar(valueType, value string) *ast.OptionEntry {
	return &ast.OptionEntry{Value: value, ValueType: valueType}
}
