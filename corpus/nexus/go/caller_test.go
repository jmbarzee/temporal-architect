package nexus

import (
	"testing"
	"time"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
	"go.temporal.io/sdk/testsuite"
)

func TestCaller(t *testing.T) {
	var s testsuite.WorkflowTestSuite
	env := s.NewTestWorkflowEnvironment()
	RegisterCallerTypes(env)
	RegisterGreeterTypes(env)
	env.OnActivity(Compose, mock.Anything, "Ada").Return("Greetings, Ada", nil)
	env.OnActivity(Compose, mock.Anything, "Grace").Return("Greetings, Grace", nil).After(48 * time.Hour)
	env.SetDetachedChildWait(false)
	start := env.Now()

	env.ExecuteWorkflow(Caller, "Ada", "Grace")

	require.True(t, env.IsWorkflowCompleted())
	require.NoError(t, env.GetWorkflowError())
	var got Greetings
	require.NoError(t, env.GetWorkflowResult(&got))
	require.Equal(t, Greetings{Hello: "Hello, Ada", Greeting: "Greetings, Ada"}, got)
	require.Less(t, env.Now().Sub(start), 48*time.Hour, "Caller awaited its detached Greet")
}
