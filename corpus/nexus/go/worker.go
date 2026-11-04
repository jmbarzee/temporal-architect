package nexus

import "go.temporal.io/sdk/worker"

const GreeterTaskQueue = "greeter"

func RegisterCallerTypes(r worker.Registry) {
	r.RegisterWorkflow(Caller)
}

func RegisterGreeterTypes(r worker.Registry) {
	r.RegisterWorkflow(Greet)
	r.RegisterActivity(Compose)
	r.RegisterNexusService(NewGreeterService())
}
