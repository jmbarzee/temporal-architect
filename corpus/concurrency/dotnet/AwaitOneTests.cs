namespace Corpus.Concurrency;

using Temporalio.Api.History.V1;
using Temporalio.Client;
using Temporalio.Testing;
using Temporalio.Worker;
using Xunit;

public class AwaitOneTests
{
    private const string TaskQueue = "await-one";

    private static TemporalWorkerOptions Fixtures() =>
        // No cache, so no sticky queue: the next workflow task goes to the normal queue, not to a stopped worker.
        new TemporalWorkerOptions(TaskQueue) { MaxCachedWorkflows = 0 }
            .AddWorkflow<AwaitOneTie>()
            .AddWorkflow<AwaitOneTempting>();

    [Fact]
    public async Task TheFirstListedOfSeveralReadyCasesWins()
    {
        await using var env = await WorkflowEnvironment.StartTimeSkippingAsync();
        Assert.Equal("Ack", await TieAsync(env, (AwaitOneTie wf) => wf.RunAsync(new() { "Ack", "timer" }), "tie-ack"));
        Assert.Equal("timer", await TieAsync(env, (AwaitOneTie wf) => wf.RunAsync(new() { "timer", "Ack" }), "tie-timer"));
    }

    [Fact]
    public async Task AtATieTheTemptingFormsPickTheTimer()
    {
        // Each lists Ack first, so await one would pick Ack.
        await using var env = await WorkflowEnvironment.StartTimeSkippingAsync();
        Assert.Equal("timer", await TieAsync(env, (AwaitOneTempting wf) => wf.RunAsync("WaitConditionAsync with a timeout"), "tempting-wait"));
        Assert.Equal("timer", await TieAsync(env, (AwaitOneTempting wf) => wf.RunAsync("WhenAnyAsync"), "tempting-whenany"));
    }

    private static async Task<IList<HistoryEvent>> EventsAsync(WorkflowHandle h) =>
        (await h.FetchHistoryAsync()).Events.ToList();

    /// <summary>Waits up to 10s of real time for an event that has; throws rather than hang.</summary>
    private static async Task UntilAsync(WorkflowHandle h, Func<HistoryEvent, bool> has)
    {
        var deadline = DateTime.UtcNow.AddSeconds(10);
        while (!(await EventsAsync(h)).Any(has))
        {
            if (DateTime.UtcNow > deadline)
            {
                throw new TimeoutException($"{h.Id}: the awaited event never reached history");
            }
            await Task.Delay(20);
        }
    }

    /// <summary>
    /// Runs a tie fixture with the timer fired and Ack sent while no worker runs, so both reach one
    /// workflow task. Their job order there does not matter: the modern event loop applies every job,
    /// in Core's order, before it checks any condition (WorkflowInstance.cs:768-772 and 795-820 in
    /// Temporalio 1.21.1), so the listed-order check sees both cases ready. The tempting forms lose
    /// because WaitConditionAsync with a timeout is itself a WhenAny over the condition and a delay
    /// (WorkflowInstance.cs:650-668), and the delay completes first.
    /// </summary>
    private static async Task<string> TieAsync<TWf>(
        WorkflowEnvironment env, System.Linq.Expressions.Expression<Func<TWf, Task<string>>> run, string id)
    {
        var h = await env.Client.StartWorkflowAsync(run, new(id: id, taskQueue: TaskQueue));
        using (var w = new TemporalWorker(env.Client, Fixtures()))
        {
            await w.ExecuteAsync(() => UntilAsync(h, e => e.TimerStartedEventAttributes != null));
        }
        // Skip time past the timer; with no worker, nothing reads its workflow task.
        _ = env.DelayAsync(TimeSpan.FromHours(1));
        await UntilAsync(h, e => e.TimerFiredEventAttributes != null);
        await h.SignalAsync("Ack", Array.Empty<object?>());
        string got;
        using (var w = new TemporalWorker(env.Client, Fixtures()))
        {
            got = await w.ExecuteAsync(() => h.GetResultAsync<string>());
        }

        // Both ready on one resume: no workflow task started between the timer firing and Ack arriving.
        var evs = await EventsAsync(h);
        var fired = evs.ToList().FindIndex(e => e.TimerFiredEventAttributes != null);
        var signaled = evs.ToList().FindIndex(e => e.WorkflowExecutionSignaledEventAttributes != null);
        Assert.True(fired >= 0 && signaled >= 0);
        var between = evs.Skip(Math.Min(fired, signaled)).Take(Math.Abs(fired - signaled));
        Assert.False(
            between.Any(e => e.WorkflowTaskStartedEventAttributes != null),
            "the timer and Ack reached different workflow tasks");
        return got;
    }
}
