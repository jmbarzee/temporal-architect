package nexus

import (
	"testing"

	"github.com/stretchr/testify/require"
	"go.temporal.io/sdk/testsuite"
)

func TestCaller(t *testing.T) {
	var s testsuite.WorkflowTestSuite
	env := s.NewTestWorkflowEnvironment()
	RegisterCallerTypes(env)
	RegisterGreeterTypes(env)

	env.ExecuteWorkflow(Caller, "Ada", "Grace")

	require.True(t, env.IsWorkflowCompleted())
	require.NoError(t, env.GetWorkflowError())
	var got Greetings
	require.NoError(t, env.GetWorkflowResult(&got))
	require.Equal(t, Greetings{Hello: "Hello, Ada", Greeting: "Greetings, Ada"}, got)
}
