package failure

import "go.temporal.io/sdk/worker"

func RegisterJobTypes(r worker.Registry) {
	r.RegisterWorkflow(Job)
	r.RegisterActivity(Reject)
	r.RegisterActivity(Process)
}
