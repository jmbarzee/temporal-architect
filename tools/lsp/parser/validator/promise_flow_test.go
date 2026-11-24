package validator

import (
	"slices"
	"testing"
)

func TestPromiseNeverAwaited(t *testing.T) {
	checkFixtures(t, "promise_never_awaited", ErrPromiseNeverAwaited)
}

// A promise bound in a for body is in scope in that body, so an await there
// takes it (#22); one awaited after the loop is the resolver's undefined
// promise (see resolver's TestPromiseScope), not this check's.
func TestPromiseNeverAwaitedDiagnostic(t *testing.T) {
	src := "workflow Fetch(ids):\n\tfor (id in ids):\n\t\tpromise p <- activity Load(id)\n\tclose complete()\n\nactivity Load(id):\n\treturn id\n"
	var got []string
	for _, e := range Validate(mustParseAndResolve(t, src)) {
		if e.Kind == ErrPromiseNeverAwaited {
			got = append(got, e.Severity+" "+e.Code()+" "+e.Name+": "+e.Msg)
		}
	}
	if want := []string{"warning PROMISE_NEVER_AWAITED p: promise p is never awaited"}; !slices.Equal(got, want) {
		t.Errorf("diagnostics %v, want %v", got, want)
	}
}
