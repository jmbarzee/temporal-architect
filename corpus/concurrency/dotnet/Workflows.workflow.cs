namespace Corpus.Concurrency;

using Temporalio.Workflows;

public record Report(long Count, bool Audited, string Status);

[Workflow]
public class Batch
{
    private static readonly ActivityOptions Options = new() { StartToCloseTimeout = TimeSpan.FromMinutes(1) };
    private string status = "unacknowledged";
    private int acks; // pending arrivals of Ack

    [WorkflowSignal]
    public Task AckAsync()
    {
        status = "acknowledged";
        acks++;
        return Task.CompletedTask;
    }

    [WorkflowRun]
    public async Task<Report> RunAsync(List<string> items)
    {
        var count = Workflow.ExecuteActivityAsync(() => Activities.Count(items), Options);
        var audited = Workflow.ExecuteChildWorkflowAsync((Audit wf) => wf.RunAsync(items));
        var pending = new List<Task> { count, audited };
        while (pending.Count > 0)
        {
            var done = await Workflow.WhenAnyAsync(pending);
            pending.Remove(done);
            await done;
        }

        // detach: abandon the child, never request its cancellation, and wait only for its start.
        await Workflow.StartChildWorkflowAsync(
            (Archive wf) => wf.RunAsync(items),
            new() { ParentClosePolicy = ParentClosePolicy.Abandon, CancellationType = ChildWorkflowCancellationType.Abandon });

        // await one: one condition over every case, then the first listed that is ready wins,
        // so Ack wins a tie with the timer; the losing timer is cancelled (spec 06, lifecycle of non-winning cases).
        using var timerCancel = CancellationTokenSource.CreateLinkedTokenSource(Workflow.CancellationToken);
        var timer = Workflow.DelayAsync(TimeSpan.FromHours(1), timerCancel.Token);
        await Workflow.WaitConditionAsync(() => acks > 0 || timer.IsCompleted);
        if (acks > 0)
        {
            acks--;
            timerCancel.Cancel();
        }

        return new(await count, await audited, status);
    }
}

[Workflow]
public class Audit
{
    [WorkflowRun]
    public Task<bool> RunAsync(List<string> items) => Task.FromResult(items.Count > 0);
}

[Workflow]
public class Archive
{
    [WorkflowRun]
    public Task RunAsync(List<string> items) =>
        Workflow.ExecuteActivityAsync(
            () => Activities.Store(items), new() { StartToCloseTimeout = TimeSpan.FromMinutes(1) });
}
