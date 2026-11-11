namespace Corpus.Failure;

using Temporalio.Workflows;

[Workflow]
public class Job
{
    private static readonly ActivityOptions RejectDefaults = new()
    {
        StartToCloseTimeout = TimeSpan.FromMinutes(1),
        RetryPolicy = new() { MaximumAttempts = 1 },
    };

    private static readonly ActivityOptions ProcessDefaults = new() { StartToCloseTimeout = TimeSpan.FromMinutes(1) };
    private readonly string item;
    private bool proceeding;

    [WorkflowInit]
    public Job(string item) => this.item = item;

    [WorkflowSignal]
    public Task ProceedAsync()
    {
        proceeding = true;
        return Task.CompletedTask;
    }

    [WorkflowUpdate]
    public Task AttemptAsync() => RejectAndProcessAsync();

    [WorkflowRun]
    public async Task RunAsync(string item)
    {
        await Workflow.WaitConditionAsync(() => proceeding);
        await RejectAndProcessAsync();
    }

    // await all: the loop throws at Reject's failure, and Process keeps running. Left uncaught,
    // the failure fails the run from RunAsync and only the update from AttemptAsync.
    private async Task RejectAndProcessAsync()
    {
        var pending = new List<Task>
        {
            Workflow.ExecuteActivityAsync(() => Activities.Reject(item), RejectDefaults),
            Workflow.ExecuteActivityAsync(() => Activities.Process(item), ProcessDefaults),
        };
        while (pending.Count > 0)
        {
            var done = await Workflow.WhenAnyAsync(pending);
            pending.Remove(done);
            await done;
        }
    }
}
