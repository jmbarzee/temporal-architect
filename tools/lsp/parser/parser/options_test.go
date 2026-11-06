package parser

import (
	"strings"
	"testing"
)

// TestWorkerOptionDroppedKeys pins that a worker option one Tier-1 SDK lacks,
// or that was renamed, is an unknown option key.
func TestWorkerOptionDroppedKeys(t *testing.T) {
	for _, entry := range []string{
		"worker_local_activity_rate_limit: 10",
		"enable_sessions: true",
		"max_concurrent_session_executions: 5",
		"heartbeat_throttle_interval: 30s",
	} {
		t.Run(entry, func(t *testing.T) {
			_, errs := ParseFileAll("namespace ns:\n\tworker w\n\t\toptions:\n\t\t\ttask_queue: \"q\"\n\t\t\t" + entry + "\n")
			if len(errs) != 1 || !strings.HasPrefix(errs[0].Msg, "unknown option key") || errs[0].Line != 5 {
				t.Fatalf("expected one unknown option key at line 5, got %v", errs)
			}
		})
	}

	t.Run("max_heartbeat_throttle_interval", func(t *testing.T) {
		_, errs := ParseFileAll("namespace ns:\n\tworker w\n\t\toptions:\n\t\t\ttask_queue: \"q\"\n\t\t\tmax_heartbeat_throttle_interval: 30s\n")
		if len(errs) > 0 {
			t.Fatalf("expected a clean parse, got %v", errs)
		}
	})
}

func TestNexusCallOptions(t *testing.T) {
	tests := []struct {
		entry string
		code  string // "" means the input parses cleanly
	}{
		{"schedule_to_close_timeout: 1h", ""},
		{"schedule_to_start_timeout: 5m", ""},
		{"start_to_close_timeout: 10m", ""},
		{"start_to_close_timeout: 30", CodeSyntax},
		{"retry_policy:\n\t\t\t\tmaximum_attempts: 3", CodeOptionMisplaced},
		{"priority:\n\t\t\t\tpriority_key: 1", CodeOptionMisplaced},
	}
	for _, tt := range tests {
		t.Run(tt.entry, func(t *testing.T) {
			_, errs := ParseFileAll("workflow W(x):\n\tnexus Ep Svc.Op(x) -> y\n\t\toptions:\n\t\t\t" + tt.entry + "\n\tclose complete(y)\n")
			if tt.code == "" {
				if len(errs) > 0 {
					t.Fatalf("expected a clean parse, got %v", errs)
				}
				return
			}
			if len(errs) == 0 || errs[0].Code() != tt.code {
				t.Fatalf("expected %s, got %v", tt.code, errs)
			}
		})
	}
}
