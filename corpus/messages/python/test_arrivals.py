import itertools
from collections.abc import AsyncIterator
from datetime import timedelta
from typing import Any

import pytest_asyncio
from temporalio.service import RPCError
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Worker

from arrivals_fixtures import (
    FIXTURES,
    AwaitOne,
    CancelledWaiter,
    NaiveTwoWaiters,
    PromiseThenAwait,
    TwoWaiters,
)

TASK_QUEUE = "arrivals"
_ids = itertools.count()


@pytest_asyncio.fixture
async def env() -> AsyncIterator[WorkflowEnvironment]:
    async with await WorkflowEnvironment.start_time_skipping() as env:
        yield env


async def with_two_xs(env: WorkflowEnvironment, run: Any, *args: Any) -> Any:
    """Runs a fixture, sending X "1" after a minute and X "2" after two."""
    async with Worker(env.client, task_queue=TASK_QUEUE, workflows=FIXTURES):
        h = await env.client.start_workflow(run, *args, id=f"wf-{next(_ids)}", task_queue=TASK_QUEUE)
        await env.sleep(timedelta(minutes=1))
        await h.signal("X", "1")
        await env.sleep(timedelta(minutes=1))
        try:
            await h.signal("X", "2")
        except RPCError:
            pass  # A workflow that needed only one X has completed by now.
        return await h.result()


async def test_arrivals_go_to_waiters_in_the_order_they_began(env: WorkflowEnvironment) -> None:
    assert await with_two_xs(env, TwoWaiters.run) == {"began first": "1", "created first": "2"}


async def test_a_promise_begins_waiting_at_its_binding(env: WorkflowEnvironment) -> None:
    assert await with_two_xs(env, PromiseThenAwait.run) == {"promise": "1", "await": "2"}


async def test_await_one_the_case_wins_and_takes(env: WorkflowEnvironment) -> None:
    assert await with_two_xs(env, AwaitOne.run, 3600.0) == ["case 1", "then 2"]


async def test_await_one_the_timer_wins_and_the_case_takes_nothing(env: WorkflowEnvironment) -> None:
    assert await with_two_xs(env, AwaitOne.run, 1.0) == ["timer", "then 1"]


async def test_a_cancelled_waiter_leaves_the_queue(env: WorkflowEnvironment) -> None:
    assert await with_two_xs(env, CancelledWaiter.run) == "1"


async def test_naive_wait_condition_per_waiter_loses_an_arrival(env: WorkflowEnvironment) -> None:
    # Both conditions unblock in one pass, before either pops.
    assert await with_two_xs(env, NaiveTwoWaiters.run) == ["1", None]
