"""Test workflows for await one; registered only by test_await_one.py."""

import asyncio
from datetime import timedelta

from temporalio import workflow


@workflow.defn
class AwaitOne:
    """Batch's await one over Ack and timer(1h), the cases listed in order; returns the winner."""

    def __init__(self) -> None:
        self.acks = 0

    @workflow.signal(name="Ack")
    def ack(self) -> None:
        self.acks += 1

    @workflow.run
    async def run(self, order: list[str]) -> str:
        timer = asyncio.create_task(workflow.sleep(timedelta(hours=1)))
        ready = {"Ack": lambda: self.acks > 0, "timer": timer.done}
        await workflow.wait_condition(lambda: any(ready[c]() for c in order))
        return next(c for c in order if ready[c]())
