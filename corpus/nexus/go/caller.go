package nexus

import "go.temporal.io/sdk/workflow"

type Greetings struct {
	Hello    string
	Greeting string
}

func Caller(ctx workflow.Context, name, friend string) (Greetings, error) {
	c := workflow.NewNexusClient(GreeterEndpoint, GreeterServiceName)

	var hello string
	if err := c.ExecuteOperation(ctx, HelloOp, name, workflow.NexusOperationOptions{}).Get(ctx, &hello); err != nil {
		return Greetings{}, err
	}
	var greeting string
	if err := c.ExecuteOperation(ctx, GreetOp, name, workflow.NexusOperationOptions{}).Get(ctx, &greeting); err != nil {
		return Greetings{}, err
	}

	// detach: wait for the start, never the result, and never propagate cancellation.
	detached := workflow.NexusOperationOptions{CancellationType: workflow.NexusOperationCancellationTypeAbandon}
	if err := c.ExecuteOperation(ctx, GreetOp, friend, detached).GetNexusOperationExecution().Get(ctx, nil); err != nil {
		return Greetings{}, err
	}

	return Greetings{Hello: hello, Greeting: greeting}, nil
}
