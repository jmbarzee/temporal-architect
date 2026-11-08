namespace Corpus.Messages;

using Temporalio.Client;
using Temporalio.Testing;
using Temporalio.Worker;
using Xunit;

public class ApprovalTests
{
    private const string TaskQueue = "approvals";

    [Fact]
    public async Task Approval()
    {
        await using var env = await WorkflowEnvironment.StartTimeSkippingAsync();
        using var worker = new TemporalWorker(env.Client, new TemporalWorkerOptions(TaskQueue).AddApprovalTypes());
        var got = await worker.ExecuteAsync(async () =>
        {
            var h = await env.Client.StartWorkflowAsync(
                (Approval wf) => wf.RunAsync("access"), new(id: "approval-1", taskQueue: TaskQueue));
            // Approve arrives before anything waits for it, and stays pending.
            await env.DelayAsync(TimeSpan.FromSeconds(30));
            await h.SignalAsync(wf => wf.ApproveAsync("Grace"));
            await env.DelayAsync(TimeSpan.FromSeconds(30));
            await h.SignalAsync(wf => wf.OpenAsync());
            await env.DelayAsync(TimeSpan.FromMinutes(1));
            Assert.Equal("open", await h.QueryAsync(wf => wf.Status()));
            Assert.Equal("reviewed", await h.ExecuteUpdateAsync(wf => wf.ReviewAsync("LGTM")));
            return await h.GetResultAsync();
        });
        Assert.Equal(new Decision("access", "Grace", "LGTM", "reviewed"), got);
    }

    [Fact]
    public async Task ReviewCallerGetsItsResultBeforeAnyWaiterTakesIt()
    {
        await using var env = await WorkflowEnvironment.StartTimeSkippingAsync();
        using var worker = new TemporalWorker(env.Client, new TemporalWorkerOptions(TaskQueue).AddApprovalTypes());
        var got = await worker.ExecuteAsync(async () =>
        {
            var h = await env.Client.StartWorkflowAsync(
                (Approval wf) => wf.RunAsync("access"), new(id: "approval-2", taskQueue: TaskQueue));
            // Review arrives while Approval still awaits Open, before anything waits for Review.
            await env.DelayAsync(TimeSpan.FromSeconds(30));
            Assert.Equal("reviewed", await h.ExecuteUpdateAsync(wf => wf.ReviewAsync("LGTM")));
            await h.SignalAsync(wf => wf.OpenAsync());
            await env.DelayAsync(TimeSpan.FromMinutes(1));
            await h.SignalAsync(wf => wf.ApproveAsync("Grace"));
            return await h.GetResultAsync();
        });
        Assert.Equal(new Decision("access", "Grace", "LGTM", "approved"), got);
    }
}
