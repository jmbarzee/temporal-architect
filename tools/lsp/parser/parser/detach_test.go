package parser

import "testing"

// TestDetachNeverAwaited pins that a detached call is never awaited: it cannot
// follow await, fill a promise, or race in await one, but under await all it
// is done once started.
func TestDetachNeverAwaited(t *testing.T) {
	tests := []struct {
		name  string
		input string
		code  string // "" means the input parses cleanly
	}{
		{"await detach workflow", `workflow W(a: A):
	await detach workflow T(a)
`, CodeDetachAwaited},
		{"await detach nexus", `workflow W(a: A):
	await detach nexus Ep Svc.Op(a)
`, CodeDetachAwaited},
		{"detach as an await one case", `workflow W(a: A):
	await one:
		timer(1h):
		detach workflow T(a):
`, CodeDetachAwaited},
		{"promise of a detached call", `workflow W(a: A):
	promise p <- detach nexus Ep Svc.Op(a)
`, CodeDetachAwaited},
		{"detach under await all", `workflow W(a: A):
	await all:
		detach workflow T(a)
		detach nexus Ep Svc.Op(a)
		activity Do(a)
`, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, errs := ParseFileAll(tt.input)
			if tt.code == "" {
				if len(errs) > 0 {
					t.Fatalf("expected a clean parse, got %v", errs)
				}
				return
			}
			if len(errs) == 0 || errs[0].Code() != tt.code {
				t.Fatalf("expected %s first, got %v", tt.code, errs)
			}
		})
	}
}
