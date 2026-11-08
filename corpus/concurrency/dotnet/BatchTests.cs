namespace Corpus.Concurrency;

using Temporalio.Activities;
using Temporalio.Api.Enums.V1;
using Temporalio.Client;
using Temporalio.Testing;
using Temporalio.Worker;
using Xunit;

public class BatchTests
{
    private const string TaskQueue = "batches";
    private static readonly List<string> Items = new() { "a", "b" };

    [Fact]
    public async Task BatchAcknowledgedWithoutWaitingForItsDetachedArchive()
    {
        // Archive's Store is held until Batch returns. A held activity stops time skipping, so Ack is sent at once.
        await using var env = await WorkflowEnvironment.StartTimeSkippingAsync();
        var held = new HeldStore();
        var options = new TemporalWorkerOptions(TaskQueue).AddBatchTypes();
        options.Activities.Remove(options.Activities.Single(a => a.Name == "Store"));
        options.AddAllActivities(held);
        using var worker = new TemporalWorker(env.Client, options);
        var got = await worker.ExecuteAsync(async () =>
        {
            try
            {
                var h = await env.Client.StartWorkflowAsync(
                    (Batch wf) => wf.RunAsync(Items), new(id: "batch-ack", taskQueue: TaskQueue));
                await h.SignalAsync(wf => wf.AckAsync());
                var r = await h.GetResultAsync();
                var archiveId = (await h.FetchHistoryAsync()).Events
                    .Select(e => e.ChildWorkflowExecutionStartedEventAttributes)
                    .FirstOrDefault(a => a?.WorkflowType.Name == "Archive")?.WorkflowExecution.WorkflowId;
                Assert.NotNull(archiveId);
                var archive = env.Client.GetWorkflowHandle(archiveId);
                Assert.Equal(WorkflowExecutionStatus.Running, (await archive.DescribeAsync()).Status);
                held.Release.SetResult();
                await archive.GetResultAsync();
                return r;
            }
            finally
            {
                held.Release.TrySetResult();
            }
        });
        Assert.Equal(new Report(2, true, "acknowledged"), got);
    }

    [Fact]
    public async Task BatchTheTimerWins()
    {
        await using var env = await WorkflowEnvironment.StartTimeSkippingAsync();
        using var worker = new TemporalWorker(env.Client, new TemporalWorkerOptions(TaskQueue).AddBatchTypes());
        var got = await worker.ExecuteAsync(() => env.Client.ExecuteWorkflowAsync(
            (Batch wf) => wf.RunAsync(Items), new(id: "batch-timer", taskQueue: TaskQueue)));
        Assert.Equal(new Report(2, true, "unacknowledged"), got);
    }

    [Fact]
    public async Task Audit()
    {
        await using var env = await WorkflowEnvironment.StartTimeSkippingAsync();
        using var worker = new TemporalWorker(env.Client, new TemporalWorkerOptions(TaskQueue).AddBatchTypes());
        Assert.True(await worker.ExecuteAsync(() => env.Client.ExecuteWorkflowAsync(
            (Audit wf) => wf.RunAsync(new() { "a" }), new(id: "audit", taskQueue: TaskQueue))));
    }

    [Fact]
    public async Task Archive()
    {
        await using var env = await WorkflowEnvironment.StartTimeSkippingAsync();
        using var worker = new TemporalWorker(env.Client, new TemporalWorkerOptions(TaskQueue).AddBatchTypes());
        await worker.ExecuteAsync(() => env.Client.ExecuteWorkflowAsync(
            (Archive wf) => wf.RunAsync(new() { "a" }), new(id: "archive", taskQueue: TaskQueue)));
    }

    /// <summary>Store, held until the test releases it.</summary>
    private sealed class HeldStore
    {
        public TaskCompletionSource Release { get; } = new();

        [Activity("Store")]
        public Task StoreAsync(List<string> items) => Release.Task;
    }
}
