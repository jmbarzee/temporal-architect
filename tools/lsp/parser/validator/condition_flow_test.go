package validator

import (
	"slices"
	"testing"
)

func TestConditionUnpaired(t *testing.T) {
	checkFixtures(t, "condition_unpaired", ErrConditionUnpaired)
}

// An await of a condition no set precedes is an error at the await, a condition
// never awaited a warning at its declaration, each naming the condition.
func TestConditionUnpairedDiagnostics(t *testing.T) {
	src := "workflow Gate(order):\n\tstate:\n\t\tcondition paid\n\t\tcondition seen\n\tset seen\n\tawait paid\n"
	type diagnostic struct {
		line     int
		severity string
		name     string
		msg      string
	}
	var got []diagnostic
	for _, e := range Validate(mustParseAndResolve(t, src)) {
		if e.Kind == ErrConditionUnpaired {
			got = append(got, diagnostic{e.Line, e.Severity, e.Name, e.Msg})
		}
	}
	want := []diagnostic{
		{4, "warning", "seen", "condition seen is never awaited"},
		{6, "error", "paid", "condition paid is awaited but no set precedes it"},
	}
	if !slices.Equal(got, want) {
		t.Errorf("diagnostics %v, want %v", got, want)
	}
}
