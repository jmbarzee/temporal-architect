// Test workflows for Arrivals; registered only by ArrivalsTests.
namespace Corpus.Messages;

using Temporalio.Workflows;

/// <summary>A workflow with signal X, whose arrivals are queued.</summary>
public abstract class WithX
{
    protected Arrivals<string> Xs { get; } = new();

    [WorkflowSignal]
    public Task XAsync(string v)
    {
        Xs.Add(v);
        return Task.CompletedTask;
    }
}

/// <summary>Two waiters of X; the one started first sleeps before it waits, so the other begins waiting first.</summary>
[Workflow]
public class TwoWaiters : WithX
{
    [WorkflowRun]
    public async Task<Dictionary<string, string>> RunAsync()
    {
        var took = new Dictionary<string, string>();
        await Workflow.WhenAllAsync(
            Workflow.RunTaskAsync(async () =>
            {
                await Workflow.DelayAsync(TimeSpan.FromSeconds(1));
                took["created first"] = await Xs.TakeAsync();
            }),
            Workflow.RunTaskAsync(async () => took["began first"] = await Xs.TakeAsync()));
        return took;
    }
}

/// <summary>Binds a promise on X, then awaits X.</summary>
[Workflow]
public class PromiseThenAwait : WithX
{
    [WorkflowRun]
    public async Task<Dictionary<string, string>> RunAsync()
    {
        var p = Xs.TakeAsync();
        var awaited = await Xs.TakeAsync();
        return new() { ["promise"] = await p, ["await"] = awaited };
    }
}

/// <summary>Starts a waiter of X and cancels it, then takes X.</summary>
[Workflow]
public class CancelledWaiter : WithX
{
    [WorkflowRun]
    public async Task<string> RunAsync()
    {
        using var cancel = CancellationTokenSource.CreateLinkedTokenSource(Workflow.CancellationToken);
        var waiter = Xs.TakeAsync(cancel.Token);
        await Workflow.DelayAsync(TimeSpan.FromSeconds(1));
        cancel.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => waiter);
        return await Xs.TakeAsync();
    }

    private static class Assert
    {
        public static async Task ThrowsAnyAsync<TException>(Func<Task> f)
            where TException : Exception
        {
            try
            {
                await f();
            }
            catch (TException)
            {
                return;
            }
            throw new InvalidOperationException("the waiter was not cancelled");
        }
    }
}

/// <summary>await one: a case for X raced against a timer (listed second), then takes X. A losing timer is cancelled (#496).</summary>
[Workflow]
public class AwaitOneX : WithX
{
    [WorkflowRun]
    public async Task<List<string>> RunAsync(TimeSpan timeout)
    {
        var took = new List<string>();
        using var timerCancel = CancellationTokenSource.CreateLinkedTokenSource(Workflow.CancellationToken);
        var timer = Workflow.DelayAsync(timeout, timerCancel.Token);
        await Workflow.WaitConditionAsync(() => Xs.Ready || timer.IsCompleted);
        if (Xs.Ready) // first listed wins
        {
            took.Add("case " + Xs.Claim());
            timerCancel.Cancel();
        }
        else
        {
            took.Add("timer");
        }
        took.Add("then " + await Xs.TakeAsync());
        return took;
    }
}

/// <summary>An await one case for X listed after a promise on X that began first.</summary>
[Workflow]
public class PromiseBeforeAwaitOne : WithX
{
    [WorkflowRun]
    public async Task<List<string>> RunAsync()
    {
        var p = Xs.TakeAsync();
        using var timerCancel = CancellationTokenSource.CreateLinkedTokenSource(Workflow.CancellationToken);
        var timer = Workflow.DelayAsync(TimeSpan.FromHours(1), timerCancel.Token);
        await Workflow.WaitConditionAsync(() => Xs.Ready || timer.IsCompleted);
        var won = "timer";
        if (Xs.Ready)
        {
            won = "case " + Xs.Claim();
            timerCancel.Cancel();
        }
        return new() { "promise " + await p, won };
    }
}

/// <summary>
/// await one over a case for X and timer(1h), listed in order, with both ready on one resume:
/// returns the winner, then whether X is still pending.
/// </summary>
[Workflow]
public class AwaitOneXTie : WithX
{
    [WorkflowRun]
    public async Task<List<string>> RunAsync(List<string> order)
    {
        using var timerCancel = CancellationTokenSource.CreateLinkedTokenSource(Workflow.CancellationToken);
        var timer = Workflow.DelayAsync(TimeSpan.FromHours(1), timerCancel.Token);
        bool Ready(string c) => c == "X" ? Xs.Ready : timer.IsCompleted;
        await Workflow.WaitConditionAsync(() => order.Any(Ready));
        var won = "timer";
        if (order.First(Ready) == "X")
        {
            won = "case " + Xs.Claim();
            timerCancel.Cancel();
        }
        return new() { won, Xs.Ready ? "pending " + Xs.Claim() : "none pending" };
    }
}

