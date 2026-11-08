namespace Corpus.Nexus;

using NexusRpc.Handlers;
using Temporalio.Nexus;

[NexusServiceHandler(typeof(IGreeterService))]
public class GreeterService
{
    // sync: the handler function is the operation's whole body.
    [NexusOperationHandler]
    public IOperationHandler<string, string> Hello() =>
        OperationHandler.Sync<string, string>((ctx, name) => "Hello, " + name);

    // async Greet workflow Greet: a client start; the task queue defaults to the handler's.
    [NexusOperationHandler]
    public IOperationHandler<string, string> Greet() =>
        WorkflowRunOperationHandler.FromHandleFactory(
            (WorkflowRunOperationContext ctx, string name) =>
                ctx.StartWorkflowAsync((Greet wf) => wf.RunAsync(name), Greeter.GreetStartOptions(name)));
}
