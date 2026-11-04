package concurrency

import (
	"testing"

	"github.com/stretchr/testify/require"
	"go.temporal.io/sdk/testsuite"
)

func TestAudit(t *testing.T) {
	var s testsuite.WorkflowTestSuite
	env := s.NewTestWorkflowEnvironment()
	RegisterBatchTypes(env)

	env.ExecuteWorkflow(Audit, []string{"a"})

	require.NoError(t, env.GetWorkflowError())
	var got bool
	require.NoError(t, env.GetWorkflowResult(&got))
	require.True(t, got)
}
