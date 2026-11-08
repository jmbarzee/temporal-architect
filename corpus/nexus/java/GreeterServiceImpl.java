package nexus;

import io.nexusrpc.handler.OperationHandler;
import io.nexusrpc.handler.OperationImpl;
import io.nexusrpc.handler.ServiceImpl;
import io.temporal.nexus.Nexus;
import io.temporal.nexus.WorkflowRunOperation;

@ServiceImpl(service = GreeterService.class)
public class GreeterServiceImpl {
  /** sync: the handler's lambda is the operation's whole body. */
  @OperationImpl
  public OperationHandler<String, String> hello() {
    return OperationHandler.sync((ctx, details, name) -> "Hello, " + name);
  }

  /** async Greet workflow Greet: a client start with Greet's start options. */
  @OperationImpl
  public OperationHandler<String, String> greet() {
    return WorkflowRunOperation.fromWorkflowMethod(
        (ctx, details, name) ->
            Nexus.getOperationContext()
                    .getWorkflowClient()
                    .newWorkflowStub(Greet.class, Greet.startOptions(name))
                ::run);
  }
}
