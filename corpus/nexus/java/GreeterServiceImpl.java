package nexus;

import io.nexusrpc.handler.OperationHandler;
import io.nexusrpc.handler.OperationImpl;
import io.nexusrpc.handler.ServiceImpl;
import io.temporal.client.WorkflowOptions;
import io.temporal.nexus.Nexus;
import io.temporal.nexus.WorkflowRunOperation;

@ServiceImpl(service = GreeterService.class)
public class GreeterServiceImpl {
  /** Greet's id_scheme; not on GreeterService, where every method, a static one too, must be an @Operation. */
  public static String greetId(String name) {
    return "greet-" + name;
  }

  /** sync: the handler's lambda is the operation's whole body. */
  @OperationImpl
  public OperationHandler<String, String> hello() {
    return OperationHandler.sync((ctx, details, name) -> "Hello, " + name);
  }

  /** async Greet workflow Greet: a client start; the task queue defaults to the handler's. */
  @OperationImpl
  public OperationHandler<String, String> greet() {
    return WorkflowRunOperation.fromWorkflowMethod(
        (ctx, details, name) ->
            Nexus.getOperationContext()
                    .getWorkflowClient()
                    .newWorkflowStub(
                        Greet.class,
                        WorkflowOptions.newBuilder().setWorkflowId(greetId(name)).build())
                ::run);
  }
}
