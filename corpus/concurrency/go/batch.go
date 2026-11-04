package concurrency

import (
	"time"

	enumspb "go.temporal.io/api/enums/v1"
	"go.temporal.io/sdk/workflow"
)

const AckSignal = "Ack"

type Report struct {
	Count   int
	Audited bool
	Status  string
}

func Batch(ctx workflow.Context, items []string) (Report, error) {
	ctx = workflow.WithActivityOptions(ctx, workflow.ActivityOptions{StartToCloseTimeout: time.Minute})
	status := "unacknowledged"
	acks := 0 // pending arrivals of Ack

	ackCh := workflow.GetSignalChannel(ctx, AckSignal)
	workflow.Go(ctx, func(gCtx workflow.Context) {
		for {
			ackCh.Receive(gCtx, nil)
			status = "acknowledged"
			acks++
		}
	})

	var count int
	var audited bool
	var countErr, auditErr error
	wg := workflow.NewWaitGroup(ctx)
	wg.Go(ctx, func(gCtx workflow.Context) {
		countErr = workflow.ExecuteActivity(gCtx, Count, items).Get(gCtx, &count)
	})
	wg.Go(ctx, func(gCtx workflow.Context) {
		auditErr = workflow.ExecuteChildWorkflow(gCtx, Audit, items).Get(gCtx, &audited)
	})
	wg.Wait(ctx)
	if countErr != nil {
		return Report{}, countErr
	}
	if auditErr != nil {
		return Report{}, auditErr
	}

	// detach: abandon the child, cut it off from this workflow's cancellation, and wait only for its start.
	detachedCtx, _ := workflow.NewDisconnectedContext(ctx)
	detachedCtx = workflow.WithChildOptions(detachedCtx, workflow.ChildWorkflowOptions{
		ParentClosePolicy: enumspb.PARENT_CLOSE_POLICY_ABANDON,
	})
	if err := workflow.ExecuteChildWorkflow(detachedCtx, Archive, items).GetChildWorkflowExecution().Get(ctx, nil); err != nil {
		return Report{}, err
	}

	// await one: the Ack case is listed first, so a pending arrival wins over the timer.
	if _, err := workflow.AwaitWithTimeout(ctx, time.Hour, func() bool { return acks > 0 }); err != nil {
		return Report{}, err
	}

	return Report{Count: count, Audited: audited, Status: status}, nil
}
