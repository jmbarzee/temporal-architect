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

	countF := workflow.ExecuteActivity(ctx, Count, items)
	auditF := workflow.ExecuteChildWorkflow(ctx, Audit, items)
	if err := awaitAll(ctx, countF, auditF); err != nil {
		return Report{}, err
	}
	var count int
	var audited bool
	if err := countF.Get(ctx, &count); err != nil {
		return Report{}, err
	}
	if err := auditF.Get(ctx, &audited); err != nil {
		return Report{}, err
	}

	// detach: abandon the child, cut it off from this workflow's cancellation, and wait only for its start.
	detachedCtx, _ := workflow.NewDisconnectedContext(ctx)
	detachedCtx = workflow.WithChildOptions(detachedCtx, workflow.ChildWorkflowOptions{
		ParentClosePolicy: enumspb.PARENT_CLOSE_POLICY_ABANDON,
	})
	if err := workflow.ExecuteChildWorkflow(detachedCtx, Archive, items).GetChildWorkflowExecution().Get(ctx, nil); err != nil {
		return Report{}, err
	}

	// await one: Ack is listed first, so it wins a tie with the timer. A signal
	// in the timer's workflow task reaches its handler only after this
	// coroutine resumes, so yield once before reading acks. The losing timer is
	// cancelled (spec 06, lifecycle of non-winning cases).
	timerCtx, cancelTimer := workflow.WithCancel(ctx)
	timer := workflow.NewTimer(timerCtx, time.Hour)
	if err := workflow.Await(ctx, func() bool { return acks > 0 || timer.IsReady() }); err != nil {
		return Report{}, err
	}
	yielded := false
	workflow.Go(ctx, func(workflow.Context) { yielded = true })
	if err := workflow.Await(ctx, func() bool { return yielded }); err != nil {
		return Report{}, err
	}
	if acks > 0 {
		acks--
		cancelTimer()
	}

	return Report{Count: count, Audited: audited, Status: status}, nil
}

// awaitAll waits for every future and returns at the first error, leaving the
// rest running.
func awaitAll(ctx workflow.Context, futures ...workflow.Future) error {
	var err error
	sel := workflow.NewSelector(ctx)
	for _, f := range futures {
		sel.AddFuture(f, func(f workflow.Future) { err = f.Get(ctx, nil) })
	}
	for range futures {
		sel.Select(ctx)
		if err != nil {
			return err
		}
	}
	return nil
}
