package concurrency

import "go.temporal.io/sdk/worker"

func RegisterBatchTypes(r worker.Registry) {
	r.RegisterWorkflow(Batch)
	r.RegisterWorkflow(Audit)
	r.RegisterWorkflow(Archive)
	r.RegisterActivity(Count)
	r.RegisterActivity(Store)
}
