namespace Corpus.Failure;

using Temporalio.Activities;
using Temporalio.Api.Enums.V1;
using Temporalio.Client;
using Temporalio.Exceptions;
using Temporalio.Testing;
using Temporalio.Worker;
using Xunit;

public class JobTests
{
    private const string TaskQueue = "jobs";

    // Waiting for Process, which is held until the test ends, would hang: fail instead.
    private static readonly TimeSpan Bound = TimeSpan.FromSeconds(30);

    [Fact]
    public async Task ABranchFailureFailsTheRunWhileTheOtherBranchRuns()
    {
        await RunHeldAsync("job-1", async h =>
        {
            await h.SignalAsync(wf => wf.ProceedAsync());
            var e = await Assert.ThrowsAsync<WorkflowFailedException>(() => h.GetResultAsync().WaitAsync(Bound));
            AssertRejected(e.InnerException);
            await AssertProcessStillRunningAsync(h);
        });
    }

    [Fact]
    public async Task ABranchFailureInAnUpdateFailsOnlyThatUpdate()
    {
        await RunHeldAsync("job-2", async h =>
        {
            var e = await Assert.ThrowsAsync<WorkflowUpdateFailedException>(
                () => h.ExecuteUpdateAsync(wf => wf.AttemptAsync()).WaitAsync(Bound));
            AssertRejected(e.InnerException);
            Assert.Equal(WorkflowExecutionStatus.Running, (await h.DescribeAsync()).Status);
            await AssertProcessStillRunningAsync(h);
        });
    }

    /// <summary>Starts Job with Process, the slow branch, held until the test ends.</summary>
    private static async Task RunHeldAsync(string id, Func<WorkflowHandle<Job>, Task> test)
    {
        await using var env = await WorkflowEnvironment.StartTimeSkippingAsync();
        var held = new HeldProcess();
        var options = new TemporalWorkerOptions(TaskQueue).AddJobTypes();
        options.Activities.Remove(options.Activities.Single(a => a.Name == "Process"));
        options.AddAllActivities(held);
        using var worker = new TemporalWorker(env.Client, options);
        await worker.ExecuteAsync(async () =>
        {
            try
            {
                var h = await env.Client.StartWorkflowAsync(
                    (Job wf) => wf.RunAsync("a"), new(id: id, taskQueue: TaskQueue));
                await test(h);
            }
            finally
            {
                held.Release.TrySetResult();
            }
        });
    }

    private static void AssertRejected(Exception? cause) =>
        Assert.Equal("Reject", Assert.IsType<ActivityFailureException>(cause).ActivityType);

    /// <summary>Process was scheduled, and neither completed nor was asked to cancel.</summary>
    private static async Task AssertProcessStillRunningAsync(WorkflowHandle<Job> h)
    {
        var events = (await h.FetchHistoryAsync()).Events;
        Assert.Contains(events, e => e.ActivityTaskScheduledEventAttributes?.ActivityType.Name == "Process");
        Assert.DoesNotContain(events, e => e.EventType == EventType.ActivityTaskCompleted);
        Assert.DoesNotContain(events, e => e.EventType == EventType.ActivityTaskCancelRequested);
    }

    /// <summary>Process, held until the test releases it.</summary>
    private sealed class HeldProcess
    {
        public TaskCompletionSource Release { get; } = new();

        [Activity("Process")]
        public Task ProcessAsync(string item) => Release.Task;
    }
}
