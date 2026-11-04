package nexus

import (
	"context"
	"time"

	"go.temporal.io/sdk/client"
	"go.temporal.io/sdk/workflow"
)

func GreetID(name string) string { return "greet-" + name }

func GreetStartOptions(name string) client.StartWorkflowOptions {
	return client.StartWorkflowOptions{
		ID:        GreetID(name),
		TaskQueue: GreeterTaskQueue,
	}
}

func Greet(ctx workflow.Context, name string) (string, error) {
	ctx = workflow.WithActivityOptions(ctx, workflow.ActivityOptions{StartToCloseTimeout: time.Minute})
	var greeting string
	if err := workflow.ExecuteActivity(ctx, Compose, name).Get(ctx, &greeting); err != nil {
		return "", err
	}
	return greeting, nil
}

func Compose(ctx context.Context, name string) (string, error) {
	return "Greetings, " + name, nil
}
