namespace Corpus.ContinueAsNew;

using Temporalio.Api.Enums.V1;
using Temporalio.Client;
using Temporalio.Testing;
using Temporalio.Worker;
using Xunit;

public class CounterTests
{
    private const string TaskQueue = "counters";

    [Fact]
    public async Task CounterCompletesAtTheLimit()
    {
        await using var env = await WorkflowEnvironment.StartTimeSkippingAsync();
        using var worker = new TemporalWorker(env.Client, new TemporalWorkerOptions(TaskQueue).AddCounterTypes());
        var got = await worker.ExecuteAsync(() => env.Client.ExecuteWorkflowAsync(
            (Counter wf) => wf.RunAsync(2, 3), new(id: "counter-1", taskQueue: TaskQueue)));
        Assert.Equal(3, got);
    }

    [Fact]
    public async Task CounterContinuesAsNewBelowIt()
    {
        await using var env = await WorkflowEnvironment.StartTimeSkippingAsync();
        using var worker = new TemporalWorker(env.Client, new TemporalWorkerOptions(TaskQueue).AddCounterTypes());
        var got = await worker.ExecuteAsync(async () =>
        {
            var h = await env.Client.StartWorkflowAsync(
                (Counter wf) => wf.RunAsync(0, 3), new(id: "counter-2", taskQueue: TaskQueue));
            var r = await h.GetResultAsync(); // follows the chain of runs
            var first = env.Client.GetWorkflowHandle(h.Id, runId: h.FirstExecutionRunId);
            Assert.Equal(WorkflowExecutionStatus.ContinuedAsNew, (await first.DescribeAsync()).Status);
            return r;
        });
        Assert.Equal(3, got);
    }
}
