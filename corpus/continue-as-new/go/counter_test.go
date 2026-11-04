package continue_as_new

import (
	"testing"

	"github.com/stretchr/testify/require"
	"go.temporal.io/sdk/testsuite"
	"go.temporal.io/sdk/workflow"
)

func TestCounter(t *testing.T) {
	tests := map[string]struct {
		count, limit int
		check        func(t *testing.T, env *testsuite.TestWorkflowEnvironment)
	}{
		"completes at the limit": {count: 2, limit: 3, check: func(t *testing.T, env *testsuite.TestWorkflowEnvironment) {
			require.NoError(t, env.GetWorkflowError())
			var got int
			require.NoError(t, env.GetWorkflowResult(&got))
			require.Equal(t, 3, got)
		}},
		"continues as new below it": {count: 0, limit: 3, check: func(t *testing.T, env *testsuite.TestWorkflowEnvironment) {
			var can *workflow.ContinueAsNewError
			require.ErrorAs(t, env.GetWorkflowError(), &can)
			require.Equal(t, "Counter", can.WorkflowType.Name)
		}},
	}
	for name, tt := range tests {
		t.Run(name, func(t *testing.T) {
			var s testsuite.WorkflowTestSuite
			env := s.NewTestWorkflowEnvironment()
			RegisterCounterTypes(env)

			env.ExecuteWorkflow(Counter, tt.count, tt.limit)

			require.True(t, env.IsWorkflowCompleted())
			tt.check(t, env)
		})
	}
}
