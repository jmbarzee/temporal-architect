package nexus

import (
	"testing"

	"github.com/stretchr/testify/require"
	"go.temporal.io/sdk/testsuite"
)

func TestGreet(t *testing.T) {
	var s testsuite.WorkflowTestSuite
	env := s.NewTestWorkflowEnvironment()
	RegisterGreeterTypes(env)

	env.ExecuteWorkflow(Greet, "Ada")

	require.NoError(t, env.GetWorkflowError())
	var got string
	require.NoError(t, env.GetWorkflowResult(&got))
	require.Equal(t, "Greetings, Ada", got)
}
