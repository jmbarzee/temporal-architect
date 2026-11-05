package messages

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"go.temporal.io/sdk/testsuite"
	"go.temporal.io/sdk/workflow"
)

// twoWaiters starts two waiters of signal X. The coroutine created first sleeps
// before it waits, so the other begins waiting first.
func twoWaiters(ctx workflow.Context) (map[string]string, error) {
	var xs arrivals[string]
	ch := workflow.GetSignalChannel(ctx, "X")
	workflow.Go(ctx, func(gCtx workflow.Context) {
		for {
			var v string
			ch.Receive(gCtx, &v)
			xs.add(v)
		}
	})

	took := map[string]string{}
	wg := workflow.NewWaitGroup(ctx)
	wg.Go(ctx, func(gCtx workflow.Context) {
		_ = workflow.Sleep(gCtx, time.Second)
		took["created first"], _ = xs.take(gCtx)
	})
	wg.Go(ctx, func(gCtx workflow.Context) {
		took["began first"], _ = xs.take(gCtx)
	})
	wg.Wait(ctx)
	return took, nil
}

func TestArrivalsGoToWaitersInTheOrderTheyBegan(t *testing.T) {
	var s testsuite.WorkflowTestSuite
	env := s.NewTestWorkflowEnvironment()
	env.RegisterWorkflow(twoWaiters)
	env.RegisterDelayedCallback(func() { env.SignalWorkflow("X", "1") }, time.Minute)
	env.RegisterDelayedCallback(func() { env.SignalWorkflow("X", "2") }, 2*time.Minute)

	env.ExecuteWorkflow(twoWaiters)

	require.NoError(t, env.GetWorkflowError())
	var got map[string]string
	require.NoError(t, env.GetWorkflowResult(&got))
	require.Equal(t, map[string]string{"began first": "1", "created first": "2"}, got)
}
