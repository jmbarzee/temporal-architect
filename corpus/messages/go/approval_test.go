package messages

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"go.temporal.io/sdk/testsuite"
)

func TestApproval(t *testing.T) {
	var s testsuite.WorkflowTestSuite
	env := s.NewTestWorkflowEnvironment()
	RegisterApprovalTypes(env)

	// Approve arrives before anything waits for it, and stays pending.
	env.RegisterDelayedCallback(func() {
		env.SignalWorkflow(ApproveSignal, ApproveArgs{Approver: "Grace"})
	}, 30*time.Second)
	env.RegisterDelayedCallback(func() {
		env.SignalWorkflow(OpenSignal, nil)
	}, time.Minute)
	env.RegisterDelayedCallback(func() {
		status, err := env.QueryWorkflow(StatusQuery)
		require.NoError(t, err)
		var got string
		require.NoError(t, status.Get(&got))
		require.Equal(t, "open", got)

		env.UpdateWorkflow(ReviewUpdate, "review-1", &testsuite.TestUpdateCallback{
			OnReject: func(err error) { t.Fatalf("update rejected: %v", err) },
			OnAccept: func() {},
			OnComplete: func(result interface{}, err error) {
				require.NoError(t, err)
				require.Equal(t, "reviewed", result)
			},
		}, "LGTM")
	}, 2*time.Minute)

	env.ExecuteWorkflow(Approval, "access")

	require.NoError(t, env.GetWorkflowError())
	var got Decision
	require.NoError(t, env.GetWorkflowResult(&got))
	require.Equal(t, Decision{Request: "access", Approver: "Grace", Note: "LGTM", Status: "reviewed"}, got)
}
