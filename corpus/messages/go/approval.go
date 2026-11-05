package messages

import "go.temporal.io/sdk/workflow"

const (
	OpenSignal    = "Open"
	ApproveSignal = "Approve"
	ReviewUpdate  = "Review"
	StatusQuery   = "Status"
)

type ApproveArgs struct {
	Approver string
}

type Decision struct {
	Request  string
	Approver string
	Note     string
	Status   string
}

func Approval(ctx workflow.Context, request string) (Decision, error) {
	status := "submitted"
	var opens arrivals[struct{}]
	var approves arrivals[ApproveArgs]
	var reviews arrivals[string]

	if err := workflow.SetQueryHandler(ctx, StatusQuery, func() (string, error) {
		return status, nil
	}); err != nil {
		return Decision{}, err
	}
	if err := workflow.SetUpdateHandler(ctx, ReviewUpdate, func(ctx workflow.Context, note string) (string, error) {
		status = "reviewed"
		reviews.add(note)
		return status, nil
	}); err != nil {
		return Decision{}, err
	}
	openCh := workflow.GetSignalChannel(ctx, OpenSignal)
	workflow.Go(ctx, func(gCtx workflow.Context) {
		for {
			openCh.Receive(gCtx, nil)
			status = "open"
			opens.add(struct{}{})
		}
	})
	approveCh := workflow.GetSignalChannel(ctx, ApproveSignal)
	workflow.Go(ctx, func(gCtx workflow.Context) {
		for {
			var args ApproveArgs
			approveCh.Receive(gCtx, &args)
			status = "approved"
			approves.add(args)
		}
	})

	if _, err := opens.take(ctx); err != nil {
		return Decision{}, err
	}

	// A promise begins waiting at its binding.
	approval, settle := workflow.NewFuture(ctx)
	workflow.Go(ctx, func(gCtx workflow.Context) {
		settle.Set(approves.take(gCtx))
	})

	note, err := reviews.take(ctx)
	if err != nil {
		return Decision{}, err
	}
	var approved ApproveArgs
	if err := approval.Get(ctx, &approved); err != nil {
		return Decision{}, err
	}

	return Decision{Request: request, Approver: approved.Approver, Note: note, Status: status}, nil
}
