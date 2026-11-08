import asyncio
from dataclasses import dataclass
from datetime import timedelta

from temporalio import workflow
from temporalio.workflow import ChildWorkflowCancellationType, ParentClosePolicy

with workflow.unsafe.imports_passed_through():
    from activities import count, store


@dataclass
class Report:
    count: int
    audited: bool
    status: str


@workflow.defn
class Batch:
    def __init__(self) -> None:
        # Handlers can run before run(), so state lives in __init__.
        self.status = "unacknowledged"
        self.acks = 0  # pending arrivals of Ack

    @workflow.signal(name="Ack")
    def ack(self) -> None:
        self.status = "acknowledged"
        self.acks += 1

    @workflow.run
    async def run(self, items: list[str]) -> Report:
        counted, audited = await asyncio.gather(
            workflow.execute_activity(count, items, start_to_close_timeout=timedelta(minutes=1)),
            workflow.execute_child_workflow(Audit.run, items),
        )

        # detach: abandon the child, never request its cancellation, and wait only for its start.
        await workflow.start_child_workflow(
            Archive.run,
            items,
            parent_close_policy=ParentClosePolicy.ABANDON,
            cancellation_type=ChildWorkflowCancellationType.ABANDON,
        )

        # await one: one condition over every case, then the first listed that is ready wins,
        # so Ack wins a tie with the timer.
        timer = asyncio.create_task(workflow.sleep(timedelta(hours=1)))
        await workflow.wait_condition(lambda: self.acks > 0 or timer.done())
        if self.acks > 0:
            self.acks -= 1
            timer.cancel()

        return Report(count=counted, audited=audited, status=self.status)


@workflow.defn
class Audit:
    @workflow.run
    async def run(self, items: list[str]) -> bool:
        return len(items) > 0


@workflow.defn
class Archive:
    @workflow.run
    async def run(self, items: list[str]) -> None:
        await workflow.execute_activity(store, items, start_to_close_timeout=timedelta(minutes=1))
