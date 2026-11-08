from dataclasses import dataclass

from temporalio import workflow

with workflow.unsafe.imports_passed_through():
    from api import GREETER_ENDPOINT, GreeterService


@dataclass
class Greetings:
    hello: str
    greeting: str


@workflow.defn
class Caller:
    @workflow.run
    async def run(self, name: str, friend: str) -> Greetings:
        greeter = workflow.create_nexus_client(service=GreeterService, endpoint=GREETER_ENDPOINT)
        hello = await greeter.execute_operation(GreeterService.hello, name)
        greeting = await greeter.execute_operation(GreeterService.greet, name)
        # detach: wait for the start, never the result, and never propagate cancellation.
        await greeter.start_operation(
            GreeterService.greet, friend, cancellation_type=workflow.NexusOperationCancellationType.ABANDON
        )
        return Greetings(hello=hello, greeting=greeting)
