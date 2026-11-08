"""Test workflows for Arrivals; registered only by test_arrivals.py."""

import asyncio

from temporalio import workflow

with workflow.unsafe.imports_passed_through():
    from arrivals import Arrivals


class _X:
    """A workflow base with a signal X whose arrivals queue in xs."""

    def __init__(self) -> None:
        self.xs: Arrivals[str] = Arrivals()

    @workflow.signal(name="X")
    def x(self, v: str) -> None:
        self.xs.add(v)


@workflow.defn
class TwoWaiters(_X):
    """Two waiters of X; the one created first sleeps before it waits, so the other begins waiting first."""

    @workflow.run
    async def run(self) -> dict[str, str]:
        took: dict[str, str] = {}

        async def created_first() -> None:
            await asyncio.sleep(1)
            took["created first"] = await self.xs.take()

        async def began_first() -> None:
            took["began first"] = await self.xs.take()

        await asyncio.gather(created_first(), began_first())
        return took


@workflow.defn
class PromiseThenAwait(_X):
    """Binds a promise on X, then awaits X."""

    @workflow.run
    async def run(self) -> dict[str, str]:
        p = self.xs.take()
        awaited = await self.xs.take()
        return {"promise": await p, "await": awaited}


@workflow.defn
class CancelledWaiter(_X):
    """Starts a waiter of X and cancels it, then takes X."""

    @workflow.run
    async def run(self) -> str:
        waiter = self.xs.take()
        await asyncio.sleep(1)
        waiter.cancel()
        return await self.xs.take()


@workflow.defn
class AwaitOne(_X):
    """await one: a case for X raced against a timer (listed second), then takes X."""

    @workflow.run
    async def run(self, timeout: float) -> list[str]:
        took: list[str] = []
        ticket = self.xs.wait()
        timer = asyncio.create_task(asyncio.sleep(timeout))
        await workflow.wait_condition(lambda: self.xs.ready(ticket) or timer.done())
        if self.xs.ready(ticket):
            took.append("case " + self.xs.claim())  # first listed wins
        else:
            self.xs.leave(ticket)
            took.append("timer")
        timer.cancel()
        took.append("then " + await self.xs.take())
        return took


@workflow.defn
class NaiveTwoWaiters:
    """The naive mapping: two waiters on wait_condition(lambda: len(pending) > 0)."""

    def __init__(self) -> None:
        self.pending: list[str] = []

    @workflow.signal(name="X")
    def x(self, v: str) -> None:
        self.pending.append(v)

    async def take(self) -> str | None:
        await workflow.wait_condition(lambda: len(self.pending) > 0)
        return self.pending.pop(0) if self.pending else None

    @workflow.run
    async def run(self) -> list[str | None]:
        return list(await asyncio.gather(self.take(), self.take()))


FIXTURES = [TwoWaiters, PromiseThenAwait, CancelledWaiter, AwaitOne, NaiveTwoWaiters]
