package parser

import "testing"

// TestDuplicateOptionKey pins that a key repeated in one options block, at any
// nesting depth, is DUPLICATE_OPTION_KEY at the second occurrence.
func TestDuplicateOptionKey(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		line, col int
	}{
		{"workflow defaults", `workflow W(a: A):
	default_options:
		workflow_id_reuse_policy: ALLOW_DUPLICATE
		workflow_id_reuse_policy: REJECT_DUPLICATE
	close complete()
`, 4, 3},
		{"call-site options", `workflow W(a: A):
	activity Do(a)
		options:
			start_to_close_timeout: 1m
			start_to_close_timeout: 2m
	close complete()
`, 5, 4},
		{"nested block", `workflow W(a: A):
	activity Do(a)
		options:
			retry_policy:
				maximum_attempts: 3
				maximum_attempts: 5
	close complete()
`, 6, 5},
		{"worker options", `namespace ns:
	worker w
		options:
			task_queue: "a"
			task_queue: "b"
`, 5, 4},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, errs := ParseFileAll(tt.input)
			for _, e := range errs {
				if e.Code() == CodeDuplicateOptionKey {
					if e.Line != tt.line || e.Column != tt.col {
						t.Errorf("at %d:%d, want %d:%d", e.Line, e.Column, tt.line, tt.col)
					}
					return
				}
			}
			t.Fatalf("expected %s, got %v", CodeDuplicateOptionKey, errs)
		})
	}

	t.Run("a repeated misplaced key reports as misplaced", func(t *testing.T) {
		_, errs := ParseFileAll(`workflow W(a: A):
	workflow T(a)
		options:
			workflow_id_conflict_policy: FAIL
			workflow_id_conflict_policy: FAIL
`)
		if len(errs) == 0 || errs[0].Code() != CodeOptionMisplaced {
			t.Fatalf("expected %s first, got %v", CodeOptionMisplaced, errs)
		}
	})

	t.Run("same key in sibling blocks", func(t *testing.T) {
		_, errs := ParseFileAll(`workflow W(a: A):
	default_options:
		task_queue: "q"
		retry_policy:
			maximum_attempts: 3
		priority:
			priority_key: 1
	close complete()
`)
		if len(errs) > 0 {
			t.Fatalf("expected a clean parse, got %v", errs)
		}
	})
}
