namespace Corpus.Nexus;

using Temporalio.Activities;
using Temporalio.Api.Enums.V1;
using Temporalio.Client;
using Temporalio.Testing;
using Temporalio.Worker;
using Xunit;

public class CallerTests
{
    [Fact]
    public async Task CallerSyncAndAsyncOperationsAndADetachedGreetItNeverWaitsFor()
    {
        await using var env = await WorkflowEnvironment.StartTimeSkippingAsync();
        await env.CreateNexusEndpointAsync(Greeter.Endpoint, Greeter.TaskQueue);
        var held = new HeldCompose();
        var greeterOptions = new TemporalWorkerOptions(Greeter.TaskQueue).AddGreeterTypes();
        greeterOptions.Activities.Clear();
        greeterOptions.AddAllActivities(held);
        using var greeter = new TemporalWorker(env.Client, greeterOptions);
        using var caller = new TemporalWorker(env.Client, new TemporalWorkerOptions("caller").AddCallerTypes());

        var got = await greeter.ExecuteAsync(() => caller.ExecuteAsync(async () =>
        {
            var r = await env.Client.ExecuteWorkflowAsync(
                (Caller wf) => wf.RunAsync("Ada", "Grace"), new(id: "caller-1", taskQueue: "caller"));
            var grace = env.Client.GetWorkflowHandle<Greet>(Greeter.GreetId("Grace"));
            Assert.Equal(WorkflowExecutionStatus.Running, (await grace.DescribeAsync()).Status);
            held.Release.SetResult();
            Assert.Equal("Greetings, Grace", await grace.GetResultAsync<string>());
            return r;
        }));
        Assert.Equal(new Greetings("Hello, Ada", "Greetings, Ada"), got);
    }

    [Fact]
    public async Task Greet()
    {
        await using var env = await WorkflowEnvironment.StartTimeSkippingAsync();
        using var worker = new TemporalWorker(env.Client, new TemporalWorkerOptions(Greeter.TaskQueue).AddGreeterTypes());
        var got = await worker.ExecuteAsync(() => env.Client.ExecuteWorkflowAsync(
            (Greet wf) => wf.RunAsync("Ada"), new(id: "greet-1", taskQueue: Greeter.TaskQueue)));
        Assert.Equal("Greetings, Ada", got);
    }

    /// <summary>Compose, with Grace's greeting held until the test releases it.</summary>
    private sealed class HeldCompose
    {
        public TaskCompletionSource Release { get; } = new();

        [Activity("Compose")]
        public async Task<string> ComposeAsync(string name)
        {
            if (name == "Grace")
            {
                await Release.Task;
            }
            return "Greetings, " + name;
        }
    }
}
