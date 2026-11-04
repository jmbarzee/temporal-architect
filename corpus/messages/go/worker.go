package messages

import "go.temporal.io/sdk/worker"

func RegisterApprovalTypes(r worker.Registry) {
	r.RegisterWorkflow(Approval)
}
