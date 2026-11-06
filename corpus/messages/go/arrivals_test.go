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

// cancelledWaiter starts a waiter of signal X and cancels it, then takes X.
func cancelledWaiter(ctx workflow.Context) (string, error) {
	var xs arrivals[string]
	ch := workflow.GetSignalChannel(ctx, "X")
	workflow.Go(ctx, func(gCtx workflow.Context) {
		for {
			var v string
			ch.Receive(gCtx, &v)
			xs.add(v)
		}
	})

	waitCtx, cancel := workflow.WithCancel(ctx)
	workflow.Go(waitCtx, func(gCtx workflow.Context) {
		_, _ = xs.take(gCtx)
	})
	if err := workflow.Sleep(ctx, time.Second); err != nil {
		return "", err
	}
	cancel()
	return xs.take(ctx)
}

// promiseThenAwait binds a promise on signal X, then awaits X.
func promiseThenAwait(ctx workflow.Context) (map[string]string, error) {
	var xs arrivals[string]
	ch := workflow.GetSignalChannel(ctx, "X")
	workflow.Go(ctx, func(gCtx workflow.Context) {
		for {
			var v string
			ch.Receive(gCtx, &v)
			xs.add(v)
		}
	})

	ticket := xs.wait()
	p, settle := workflow.NewFuture(ctx)
	workflow.Go(ctx, func(gCtx workflow.Context) {
		settle.Set(xs.takeAt(gCtx, ticket))
	})
	awaited, err := xs.take(ctx)
	if err != nil {
		return nil, err
	}
	var promised string
	if err := p.Get(ctx, &promised); err != nil {
		return nil, err
	}
	return map[string]string{"promise": promised, "await": awaited}, nil
}

func TestPromiseBeginsWaitingAtItsBinding(t *testing.T) {
	var s testsuite.WorkflowTestSuite
	env := s.NewTestWorkflowEnvironment()
	env.RegisterWorkflow(promiseThenAwait)
	env.RegisterDelayedCallback(func() { env.SignalWorkflow("X", "1") }, time.Minute)
	env.RegisterDelayedCallback(func() { env.SignalWorkflow("X", "2") }, 2*time.Minute)

	env.ExecuteWorkflow(promiseThenAwait)

	require.NoError(t, env.GetWorkflowError())
	var got map[string]string
	require.NoError(t, env.GetWorkflowResult(&got))
	require.Equal(t, map[string]string{"promise": "1", "await": "2"}, got)
}

// awaitOne races a case for signal X against a timer, then takes X.
func awaitOne(ctx workflow.Context, timeout time.Duration) ([]string, error) {
	var xs arrivals[string]
	ch := workflow.GetSignalChannel(ctx, "X")
	workflow.Go(ctx, func(gCtx workflow.Context) {
		for {
			var v string
			ch.Receive(gCtx, &v)
			xs.add(v)
		}
	})

	var took []string
	ticket := xs.wait()
	timer := workflow.NewTimer(ctx, timeout)
	if err := workflow.Await(ctx, func() bool { return xs.ready(ticket) || timer.IsReady() }); err != nil {
		return nil, err
	}
	if xs.ready(ticket) {
		took = append(took, "case "+xs.claim())
	} else {
		xs.leave(ticket)
		took = append(took, "timer")
	}
	v, err := xs.take(ctx)
	return append(took, "then "+v), err
}

func TestAwaitOneCaseTakesOnlyIfItWins(t *testing.T) {
	tests := []struct {
		name    string
		timeout time.Duration
		want    []string
	}{
		{"case wins", time.Hour, []string{"case 1", "then 2"}},
		{"timer wins", time.Second, []string{"timer", "then 1"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var s testsuite.WorkflowTestSuite
			env := s.NewTestWorkflowEnvironment()
			env.RegisterWorkflow(awaitOne)
			env.RegisterDelayedCallback(func() { env.SignalWorkflow("X", "1") }, time.Minute)
			env.RegisterDelayedCallback(func() { env.SignalWorkflow("X", "2") }, 2*time.Minute)

			env.ExecuteWorkflow(awaitOne, tt.timeout)

			require.NoError(t, env.GetWorkflowError())
			var got []string
			require.NoError(t, env.GetWorkflowResult(&got))
			require.Equal(t, tt.want, got)
		})
	}
}

func TestCancelledWaiterLeavesTheQueue(t *testing.T) {
	var s testsuite.WorkflowTestSuite
	env := s.NewTestWorkflowEnvironment()
	env.RegisterWorkflow(cancelledWaiter)
	env.RegisterDelayedCallback(func() { env.SignalWorkflow("X", "1") }, time.Minute)

	env.ExecuteWorkflow(cancelledWaiter)

	require.NoError(t, env.GetWorkflowError())
	var got string
	require.NoError(t, env.GetWorkflowResult(&got))
	require.Equal(t, "1", got)
}
