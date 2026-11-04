package concurrency

import (
	"testing"
	"time"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
	"go.temporal.io/sdk/testsuite"
)

func TestBatch(t *testing.T) {
	items := []string{"a", "b"}
	tests := map[string]struct {
		ackAt time.Duration // 0: no Ack
		tie   bool          // Ack and timer in one workflow task
		want  Report
	}{
		"acknowledged":                 {ackAt: time.Minute, want: Report{Count: 2, Audited: true, Status: "acknowledged"}},
		"timer wins":                   {want: Report{Count: 2, Audited: true, Status: "unacknowledged"}},
		"Ack wins a tie, listed first": {tie: true, want: Report{Count: 2, Audited: true, Status: "acknowledged"}},
	}
	for name, tt := range tests {
		t.Run(name, func(t *testing.T) {
			var s testsuite.WorkflowTestSuite
			env := s.NewTestWorkflowEnvironment()
			RegisterBatchTypes(env)
			env.OnActivity(Store, mock.Anything, items).Return(nil).After(48 * time.Hour)
			env.SetDetachedChildWait(false)
			if tt.ackAt > 0 {
				env.RegisterDelayedCallback(func() {
					env.SignalWorkflow(AckSignal, nil)
				}, tt.ackAt)
			}
			if tt.tie {
				// The Ack waits, unprocessed, for the workflow task the timer starts.
				env.RegisterDelayedCallback(func() {
					env.SignalWorkflowSkippingWorkflowTask(AckSignal, nil)
				}, time.Hour-time.Millisecond)
			}
			start := env.Now()

			env.ExecuteWorkflow(Batch, items)

			require.NoError(t, env.GetWorkflowError())
			var got Report
			require.NoError(t, env.GetWorkflowResult(&got))
			require.Equal(t, tt.want, got)
			env.AssertExpectations(t)
			require.Less(t, env.Now().Sub(start), 48*time.Hour, "Batch awaited its detached Archive")
		})
	}
}
