package failure

import (
	"testing"
	"time"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
	"go.temporal.io/sdk/activity"
	"go.temporal.io/sdk/converter"
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/testsuite"
)

func TestJob(t *testing.T) {
	var s testsuite.WorkflowTestSuite
	env := s.NewTestWorkflowEnvironment()
	RegisterJobTypes(env)
	env.OnActivity(Process, mock.Anything, "job-1").Return(nil).After(30 * time.Second)

	processed := 0
	env.SetOnActivityCompletedListener(func(info *activity.Info, _ converter.EncodedValue, _ error) {
		if info.ActivityType.Name == "Process" {
			processed++
		}
	})
	// The test environment's stand-in for a cancel request in history.
	env.SetOnActivityCanceledListener(func(info *activity.Info) {
		t.Errorf("%s was cancelled", info.ActivityType.Name)
	})

	env.RegisterDelayedCallback(func() {
		env.UpdateWorkflow(AttemptUpdate, "attempt-1", &testsuite.TestUpdateCallback{
			OnReject: func(err error) { t.Fatalf("update rejected: %v", err) },
			OnAccept: func() {},
			OnComplete: func(_ interface{}, err error) {
				requireRejected(t, err)
				require.Zero(t, processed, "the update waited for Process")
			},
		})
	}, time.Minute)
	env.RegisterDelayedCallback(func() {
		require.False(t, env.IsWorkflowCompleted(), "the failed update ended the run")
		require.Equal(t, 1, processed, "the update's Process stopped running")
		env.SignalWorkflow(ProceedSignal, nil)
	}, 2*time.Minute)

	env.ExecuteWorkflow(Job, "job-1")

	requireRejected(t, env.GetWorkflowError())
	require.Equal(t, 1, processed, "the run waited for Process")
}

func requireRejected(t *testing.T, err error) {
	t.Helper()
	var appErr *temporal.ApplicationError
	require.ErrorAs(t, err, &appErr)
	require.Equal(t, "Rejected", appErr.Type())
}
