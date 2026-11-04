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
