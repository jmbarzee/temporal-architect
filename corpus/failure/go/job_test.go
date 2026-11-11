package failure

import (
	"context"
	"os/exec"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	enumspb "go.temporal.io/api/enums/v1"
	"go.temporal.io/sdk/activity"
	"go.temporal.io/sdk/client"
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/testsuite"
	"go.temporal.io/sdk/worker"
)

// TestJob runs against a dev server, unlike the other Go copies: the claim is
// about history (no cancel request for the slow branch), and the in-memory
// environment has none. It uses the temporal CLI on PATH, or StartDevServer
// downloads one (sdk-go testsuite/devserver.go:76-123).
func TestJob(t *testing.T) {
	opts := testsuite.DevServerOptions{}
	if path, err := exec.LookPath("temporal"); err == nil {
		opts.ExistingPath = path
	}
	// A download gets its own bound, apart from the test's.
	startCtx, cancelStart := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancelStart()
	server, err := testsuite.StartDevServer(startCtx, opts)
	require.NoError(t, err)
	defer server.Stop()
	c := server.Client()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Process is held until teardown: the slow branch.
	release := make(chan struct{})
	w := worker.New(c, "jobs", worker.Options{})
	w.RegisterWorkflow(Job)
	w.RegisterActivity(Reject)
	w.RegisterActivityWithOptions(func(ctx context.Context, item string) error {
		select {
		case <-release:
		case <-ctx.Done():
		}
		return nil
	}, activity.RegisterOptions{Name: "Process"})
	require.NoError(t, w.Start())
	defer w.Stop()
	defer close(release)

	run, err := c.ExecuteWorkflow(ctx, client.StartWorkflowOptions{ID: "job-1", TaskQueue: "jobs"}, Job, "job-1")
	require.NoError(t, err)

	// The update fails with Reject's failure, and the run goes on.
	update, err := c.UpdateWorkflow(ctx, client.UpdateWorkflowOptions{
		WorkflowID:   run.GetID(),
		UpdateName:   AttemptUpdate,
		WaitForStage: client.WorkflowUpdateStageCompleted,
	})
	require.NoError(t, err)
	requireRejected(t, update.Get(ctx, nil))
	desc, err := c.DescribeWorkflowExecution(ctx, run.GetID(), run.GetRunID())
	require.NoError(t, err)
	require.Equal(t, enumspb.WORKFLOW_EXECUTION_STATUS_RUNNING, desc.WorkflowExecutionInfo.Status, "the failed update ended the run")

	// The run fails with Reject's failure while Process is still held.
	require.NoError(t, c.SignalWorkflow(ctx, run.GetID(), run.GetRunID(), ProceedSignal, nil))
	requireRejected(t, run.Get(ctx, nil))

	scheduled := 0
	history := c.GetWorkflowHistory(ctx, run.GetID(), run.GetRunID(), false, enumspb.HISTORY_EVENT_FILTER_TYPE_ALL_EVENT)
	for history.HasNext() {
		event, err := history.Next()
		require.NoError(t, err)
		switch event.EventType {
		case enumspb.EVENT_TYPE_ACTIVITY_TASK_SCHEDULED:
			if event.GetActivityTaskScheduledEventAttributes().GetActivityType().GetName() == "Process" {
				scheduled++
			}
		case enumspb.EVENT_TYPE_ACTIVITY_TASK_CANCEL_REQUESTED:
			t.Errorf("event %d requests an activity's cancellation", event.EventId)
		case enumspb.EVENT_TYPE_ACTIVITY_TASK_COMPLETED:
			t.Errorf("event %d completes an activity the run should not have waited for", event.EventId)
		}
	}
	require.Equal(t, 2, scheduled, "the update and the main body each schedule Process")
}

func requireRejected(t *testing.T, err error) {
	t.Helper()
	var appErr *temporal.ApplicationError
	require.ErrorAs(t, err, &appErr)
	require.Equal(t, "Rejected", appErr.Type())
}
