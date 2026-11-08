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

    [SkippableFact]
    public async Task TheFirstListedOfSeveralReadyCasesWins()
    {
        Assert.Equal("Ack", await TieAsync((AwaitOneTie wf) => wf.RunAsync(new() { "Ack", "timer" }), "tie-ack"));
        Assert.Equal("timer", await TieAsync((AwaitOneTie wf) => wf.RunAsync(new() { "timer", "Ack" }), "tie-timer"));
    }

    [SkippableFact]
    public async Task AtATieTheTemptingFormsPickTheTimer()
    {
        // Each lists Ack first, so await one would pick Ack.
        Assert.Equal("timer", await TieAsync((AwaitOneTempting wf) => wf.RunAsync("WaitConditionAsync with a timeout"), "tempting-wait"));
        Assert.Equal("timer", await TieAsync((AwaitOneTempting wf) => wf.RunAsync("WhenAnyAsync"), "tempting-whenany"));
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
    /// <remarks>
    /// In CI the setup sometimes misses: a workflow task starts between the timer firing and Ack
    /// arriving, most likely on a poll the stopped first worker left open at the test server. A miss
    /// is retried on a fresh test server; if every attempt misses, the test is skipped, so it never
    /// asserts the behaviour on a tie that was not set up.
    /// </remarks>
    private static async Task<string> TieAsync<TWf>(
        System.Linq.Expressions.Expression<Func<TWf, Task<string>>> run, string id)
    {
        const int attempts = 3;
        var missed = new List<string>();
        for (var attempt = 1; attempt <= attempts; attempt++)
        {
            await using var env = await WorkflowEnvironment.StartTimeSkippingAsync();
            var h = await env.Client.StartWorkflowAsync(run, new(id: $"{id}-{attempt}", taskQueue: TaskQueue));
            var miss = await SetUpTieAsync(env, h);
            if (miss == null)
            {
                using var w = new TemporalWorker(env.Client, Fixtures());
                return await w.ExecuteAsync(() => h.GetResultAsync<string>());
            }
            missed.Add(miss);
        }
        throw new SkipException($"the tie was not set up in {attempts} attempts: {string.Join("; ", missed)}");
    }

    /// <summary>
    /// Fires the timer and sends Ack while no worker runs. Returns null when both reach one workflow
    /// task, otherwise the history between them.
    /// </summary>
    private static async Task<string?> SetUpTieAsync(WorkflowEnvironment env, WorkflowHandle h)
    {
        using (var w = new TemporalWorker(env.Client, Fixtures()))
        {
            await w.ExecuteAsync(() => UntilAsync(h, e => e.TimerStartedEventAttributes != null));
        }
        // Skip time past the timer; with no worker, nothing should read its workflow task.
        _ = env.DelayAsync(TimeSpan.FromHours(1));
        await UntilAsync(h, e => e.TimerFiredEventAttributes != null);
        await h.SignalAsync("Ack", Array.Empty<object?>());

        var evs = await EventsAsync(h);
        var between = evs
            .SkipWhile(e => e.TimerFiredEventAttributes == null)
            .TakeWhile(e => e.WorkflowExecutionSignaledEventAttributes == null)
            .ToList();
        return between.Any(e => e.WorkflowTaskStartedEventAttributes != null)
            ? $"{h.Id}: {string.Join(",", between.Select(e => e.EventType))}"
            : null;
    }
}
