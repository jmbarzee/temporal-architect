package concurrency

import (
	"testing"

	"github.com/stretchr/testify/require"
	"go.temporal.io/sdk/testsuite"
)

func TestArchive(t *testing.T) {
	var s testsuite.WorkflowTestSuite
	env := s.NewTestWorkflowEnvironment()
	RegisterBatchTypes(env)

	env.ExecuteWorkflow(Archive, []string{"a"})

	require.NoError(t, env.GetWorkflowError())
}
