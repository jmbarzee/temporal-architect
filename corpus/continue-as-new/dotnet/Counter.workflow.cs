namespace Corpus.ContinueAsNew;

using Temporalio.Workflows;

[Workflow]
public class Counter
{
    [WorkflowRun]
    public async Task<long> RunAsync(long count, long limit)
    {
        await Workflow.DelayAsync(TimeSpan.FromMinutes(1));
        var next = await Workflow.ExecuteActivityAsync(
            () => Activities.Increment(count), new() { StartToCloseTimeout = TimeSpan.FromMinutes(1) });
        if (next >= limit)
        {
            return next;
        }
        throw Workflow.CreateContinueAsNewException((Counter wf) => wf.RunAsync(next, limit));
    }
}
