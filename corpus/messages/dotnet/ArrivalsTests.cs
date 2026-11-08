namespace Corpus.Messages;

using Temporalio.Api.History.V1;
using Temporalio.Client;
using Temporalio.Exceptions;
using Temporalio.Testing;
using Temporalio.Worker;
using Xunit;

public class ArrivalsTests
{
    private const string TaskQueue = "arrivals";
    private static int n;

    private static TemporalWorkerOptions Fixtures(int maxCachedWorkflows = 10000) =>
        new TemporalWorkerOptions(TaskQueue) { MaxCachedWorkflows = maxCachedWorkflows }
            .AddWorkflow<TwoWaiters>()
            .AddWorkflow<PromiseThenAwait>()
            .AddWorkflow<CancelledWaiter>()
            .AddWorkflow<AwaitOneX>()
            .AddWorkflow<PromiseBeforeAwaitOne>()
            .AddWorkflow<AwaitOneXTie>();

    /// <summary>Runs a fixture, sending X "1" after a minute and X "2" after two.</summary>
    private static async Task<TResult> WithTwoXsAsync<TWf, TResult>(
        System.Linq.Expressions.Expression<Func<TWf, Task<TResult>>> run)
        where TWf : WithX
    {
        await using var env = await WorkflowEnvironment.StartTimeSkippingAsync();
        using var worker = new TemporalWorker(env.Client, Fixtures());
        return await worker.ExecuteAsync(async () =>
        {
            var h = await env.Client.StartWorkflowAsync(run, new(id: $"wf-{n++}", taskQueue: TaskQueue));
            await env.DelayAsync(TimeSpan.FromMinutes(1));
            await h.SignalAsync(wf => wf.XAsync("1"));
            await env.DelayAsync(TimeSpan.FromMinutes(1));
            try
            {
                await h.SignalAsync(wf => wf.XAsync("2"));
            }
            catch (RpcException e) when (e.Code == RpcException.StatusCode.NotFound)
            {
                // A workflow that needed only one X has completed by now.
            }
            return await h.GetResultAsync();
        });
    }

    [Fact]
    public async Task ArrivalsGoToWaitersInTheOrderTheyBegan() =>
        Assert.Equal(
            new Dictionary<string, string> { ["began first"] = "1", ["created first"] = "2" },
            await WithTwoXsAsync((TwoWaiters wf) => wf.RunAsync()));

    [Fact]
    public async Task APromiseBeginsWaitingAtItsBinding() =>
        Assert.Equal(
            new Dictionary<string, string> { ["promise"] = "1", ["await"] = "2" },
            await WithTwoXsAsync((PromiseThenAwait wf) => wf.RunAsync()));

    [Fact]
    public async Task AwaitOneTheCaseWinsAndTakes() =>
        Assert.Equal(
            new List<string> { "case 1", "then 2" },
            await WithTwoXsAsync((AwaitOneX wf) => wf.RunAsync(TimeSpan.FromHours(1))));

    [Fact]
    public async Task AwaitOneTheTimerWinsAndTheCaseTakesNothing() =>
        Assert.Equal(
            new List<string> { "timer", "then 1" },
            await WithTwoXsAsync((AwaitOneX wf) => wf.RunAsync(TimeSpan.FromSeconds(1))));

    [Fact]
    public async Task AnAwaitOneCaseWaitsBehindAnEarlierWaiter() =>
        Assert.Equal(
            new List<string> { "promise 1", "case 2" },
            await WithTwoXsAsync((PromiseBeforeAwaitOne wf) => wf.RunAsync()));

    [Fact]
    public async Task ACancelledWaiterLeavesTheQueue() =>
        Assert.Equal("1", await WithTwoXsAsync((CancelledWaiter wf) => wf.RunAsync()));

    [Fact]
    public async Task AwaitOneAtATieTheFirstListedWinsAndOnlyAWinningCaseTakes()
    {
        await using var env = await WorkflowEnvironment.StartTimeSkippingAsync();
        Assert.Equal(
            new List<string> { "case 1", "none pending" },
            await TieAsync(env, (AwaitOneXTie wf) => wf.RunAsync(new() { "X", "timer" }), "tie-x"));
        Assert.Equal(
            new List<string> { "timer", "pending 1" },
            await TieAsync(env, (AwaitOneXTie wf) => wf.RunAsync(new() { "timer", "X" }), "tie-timer"));
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
    /// Runs a tie fixture with the timer fired and X "1" sent while no worker runs, so both reach one
    /// workflow task. Their job order there does not matter: the modern event loop applies every job,
    /// in Core's order, before it checks any condition (WorkflowInstance.cs:768-772 and 795-820 in
    /// Temporalio 1.21.1), so the listed-order check sees both cases ready.
    /// </summary>
    private static async Task<TResult> TieAsync<TWf, TResult>(
        WorkflowEnvironment env, System.Linq.Expressions.Expression<Func<TWf, Task<TResult>>> run, string id)
    {
        // No cache, so no sticky queue: the next workflow task goes to the normal queue, not to a stopped worker.
        var h = await env.Client.StartWorkflowAsync(run, new(id: id, taskQueue: TaskQueue));
        using (var w = new TemporalWorker(env.Client, Fixtures(maxCachedWorkflows: 0)))
        {
            await w.ExecuteAsync(() => UntilAsync(h, e => e.TimerStartedEventAttributes != null));
        }
        // Skip time past the timer; with no worker, nothing reads its workflow task.
        _ = env.DelayAsync(TimeSpan.FromHours(1));
        await UntilAsync(h, e => e.TimerFiredEventAttributes != null);
        await h.SignalAsync("X", new object?[] { "1" });
        TResult got;
        using (var w = new TemporalWorker(env.Client, Fixtures(maxCachedWorkflows: 0)))
        {
            got = await w.ExecuteAsync(() => h.GetResultAsync<TResult>());
        }

        // Both ready on one resume: no workflow task started between the timer firing and X arriving.
        var evs = await EventsAsync(h);
        var fired = evs.ToList().FindIndex(e => e.TimerFiredEventAttributes != null);
        var signaled = evs.ToList().FindIndex(e => e.WorkflowExecutionSignaledEventAttributes != null);
        Assert.True(fired >= 0 && signaled >= 0);
        var between = evs.Skip(Math.Min(fired, signaled)).Take(Math.Abs(fired - signaled));
        Assert.False(
            between.Any(e => e.WorkflowTaskStartedEventAttributes != null),
            "the timer and X reached different workflow tasks");
        return got;
    }
}

