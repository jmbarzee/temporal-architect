import nexusrpc
from temporalio import nexus

from api import GreeterService, greet_id
from greeter_workflows import Greet


@nexusrpc.handler.service_handler(service=GreeterService)
class GreeterServiceHandler:
    # sync: the method is the operation's whole body.
    @nexusrpc.handler.sync_operation
    async def hello(self, ctx: nexusrpc.handler.StartOperationContext, name: str) -> str:
        return "Hello, " + name

    # async Greet workflow Greet: a client start; the task queue defaults to the handler's.
    @nexus.workflow_run_operation
    async def greet(self, ctx: nexus.WorkflowRunOperationContext, name: str) -> nexus.WorkflowHandle[str]:
        return await ctx.start_workflow(Greet.run, name, id=greet_id(name))
