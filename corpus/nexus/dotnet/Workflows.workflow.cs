namespace Corpus.Nexus;

using Temporalio.Workflows;

public record Greetings(string Hello, string Greeting);

[Workflow]
public class Greet
{
    [WorkflowRun]
    public Task<string> RunAsync(string name) =>
        Workflow.ExecuteActivityAsync(
            () => Activities.Compose(name), new() { StartToCloseTimeout = TimeSpan.FromMinutes(1) });
}

[Workflow]
public class Caller
{
    [WorkflowRun]
    public async Task<Greetings> RunAsync(string name, string friend)
    {
        var greeter = Workflow.CreateNexusWorkflowClient<IGreeterService>(Greeter.Endpoint);
        var hello = await greeter.ExecuteNexusOperationAsync(svc => svc.Hello(name));
        var greeting = await greeter.ExecuteNexusOperationAsync(svc => svc.Greet(name));
        // detach: wait for the start, never the result, and never propagate cancellation.
        await greeter.StartNexusOperationAsync(
            svc => svc.Greet(friend), new() { CancellationType = NexusOperationCancellationType.Abandon });
        return new(hello, greeting);
    }
}
