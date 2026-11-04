package continueasnew

import "go.temporal.io/sdk/worker"

func RegisterCounterTypes(r worker.Registry) {
	r.RegisterWorkflow(Counter)
	r.RegisterActivity(Increment)
}
