package concurrency

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"go.temporal.io/sdk/testsuite"
)

func TestBatch(t *testing.T) {
	items := []string{"a", "b"}
	tests := map[string]struct {
		ack  bool
		want Report
	}{
		"acknowledged": {ack: true, want: Report{Count: 2, Audited: true, Status: "acknowledged"}},
		"timer wins":   {ack: false, want: Report{Count: 2, Audited: true, Status: "unacknowledged"}},
	}
	for name, tt := range tests {
		t.Run(name, func(t *testing.T) {
			var s testsuite.WorkflowTestSuite
			env := s.NewTestWorkflowEnvironment()
			RegisterBatchTypes(env)
			if tt.ack {
				env.RegisterDelayedCallback(func() {
					env.SignalWorkflow(AckSignal, nil)
				}, time.Minute)
			}

			env.ExecuteWorkflow(Batch, items)

			require.NoError(t, env.GetWorkflowError())
			var got Report
			require.NoError(t, env.GetWorkflowResult(&got))
			require.Equal(t, tt.want, got)
		})
	}
}
