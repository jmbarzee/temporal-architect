package nexus

import (
	"context"

	"github.com/nexus-rpc/sdk-go/nexus"
	"go.temporal.io/sdk/client"
	"go.temporal.io/sdk/temporalnexus"
)

const (
	GreeterEndpoint    = "GreeterEndpoint"
	GreeterServiceName = "GreeterService"
	HelloOp            = "Hello"
	GreetOp            = "Greet"
)

var HelloOperation = nexus.NewSyncOperation(HelloOp,
	func(ctx context.Context, name string, options nexus.StartOperationOptions) (string, error) {
		return "Hello, " + name, nil
	})

var GreetOperation = temporalnexus.NewWorkflowRunOperation(GreetOp, Greet,
	func(ctx context.Context, name string, options nexus.StartOperationOptions) (client.StartWorkflowOptions, error) {
		return GreetStartOptions(name), nil
	})

func NewGreeterService() *nexus.Service {
	service := nexus.NewService(GreeterServiceName)
	service.MustRegister(HelloOperation, GreetOperation)
	return service
}
