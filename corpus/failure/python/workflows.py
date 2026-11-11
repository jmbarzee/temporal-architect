import asyncio
from datetime import timedelta

from temporalio import workflow

with workflow.unsafe.imports_passed_through():
    from activities import process, reject, reject_defaults


@workflow.defn
class Job:
    @workflow.init
    def __init__(self, item: str) -> None:
        # Handlers can run before run(), so state lives in __init__.
        self.item = item
        self.proceeding = False

    @workflow.signal(name="Proceed")
    def proceed(self) -> None:
        self.proceeding = True

    @workflow.update(name="Attempt")
    async def attempt(self) -> None:
        await asyncio.gather(
            workflow.execute_activity(reject, self.item, **reject_defaults),
            workflow.execute_activity(process, self.item, start_to_close_timeout=timedelta(minutes=1)),
        )

    @workflow.run
    async def run(self, item: str) -> None:
        await workflow.wait_condition(lambda: self.proceeding)
        await asyncio.gather(
            workflow.execute_activity(reject, item, **reject_defaults),
            workflow.execute_activity(process, item, start_to_close_timeout=timedelta(minutes=1)),
        )
