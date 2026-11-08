// Test workflows for await one; registered only by AwaitOneTests.
namespace Corpus.Concurrency;

using Temporalio.Workflows;

/// <summary>Counts arrivals of signal Ack.</summary>
public abstract class WithAck
{
    protected int Acks { get; private set; }

    [WorkflowSignal]
    public Task AckAsync()
    {
        Acks++;
        return Task.CompletedTask;
    }
}

/// <summary>Batch's await one over Ack and timer(1h), with the cases listed in order; returns the winner.</summary>
[Workflow]
public class AwaitOneTie : WithAck
{
    [WorkflowRun]
    public async Task<string> RunAsync(List<string> order)
    {
        using var timerCancel = CancellationTokenSource.CreateLinkedTokenSource(Workflow.CancellationToken);
        var timer = Workflow.DelayAsync(TimeSpan.FromHours(1), timerCancel.Token);
        bool Ready(string c) => c == "Ack" ? Acks > 0 : timer.IsCompleted;
        await Workflow.WaitConditionAsync(() => order.Any(Ready));
        var won = order.First(Ready);
        if (won == "Ack")
        {
            timerCancel.Cancel();
        }
        return won;
    }
}

/// <summary>The tempting mappings of await one { signal Ack; timer(1h) }, which pick by completion order.</summary>
[Workflow]
public class AwaitOneTempting : WithAck
{
    [WorkflowRun]
    public async Task<string> RunAsync(string form)
    {
        if (form == "WaitConditionAsync with a timeout")
        {
            return await Workflow.WaitConditionAsync(() => Acks > 0, TimeSpan.FromHours(1)) ? "Ack" : "timer";
        }
        var ack = Workflow.WaitConditionAsync(() => Acks > 0);
        var timer = Workflow.DelayAsync(TimeSpan.FromHours(1));
        return await Workflow.WhenAnyAsync(ack, timer) == ack ? "Ack" : "timer";
    }
}
