package resolver

import (
	"slices"
	"testing"
)

// TestAsyncTargetUndefinedPosition: an undefined reference in an async target
// is reported at the target's keyword, as a synchronous call is at its own
// (#276).
func TestAsyncTargetUndefinedPosition(t *testing.T) {
	tests := []struct {
		name   string
		line   string
		kind   ErrorKind
		column int
	}{
		{"promise workflow", "promise p <- workflow Missing(x)", ErrUndefinedWorkflow, 18},
		{"promise activity", "promise p <- activity Missing(x)", ErrUndefinedActivity, 18},
		{"promise signal", "promise p <- signal Missing", ErrUndefinedSignal, 18},
		{"await workflow", "await workflow Missing(x)", ErrUndefinedWorkflow, 11},
		{"await update", "await update Missing", ErrUndefinedUpdate, 11},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			file := mustParse(t, "workflow P(x: string):\n    "+tt.line+"\n    close complete()\n")
			errs := Resolve(file)
			if got := kindsOf(errs); !slices.Equal(got, []ErrorKind{tt.kind}) {
				t.Fatalf("kinds = %v, want only %v: %v", got, tt.kind, errs)
			}
			if e := errs[0]; e.Line != 2 || e.Column != tt.column {
				t.Errorf("reported at %d:%d, want 2:%d", e.Line, e.Column, tt.column)
			}
		})
	}
}
